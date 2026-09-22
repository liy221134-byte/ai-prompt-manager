import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { DEFAULT_PROJECT_ID } from "../src/data/projects.ts";
import { PromptDatabase } from "../src/lib/server/prompt-database.ts";

// 切换演练：造一个 2.0.0 时代的库（只有旧提示词表和旧版本表），
// 再用 2.1.0 打开，确认老数据、垃圾箱和恢复关系全部过渡过来。
function createLegacyDatabase(databasePath) {
  const raw = new DatabaseSync(databasePath);

  raw.exec(`
    CREATE TABLE prompts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      content TEXT NOT NULL,
      use_case TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      deleted_reason TEXT,
      merged_into_prompt_id TEXT,
      merge_version_id TEXT
    );

    CREATE TABLE prompt_versions (
      version_id TEXT PRIMARY KEY,
      prompt_id TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      content TEXT NOT NULL,
      use_case TEXT NOT NULL,
      created_at TEXT NOT NULL,
      version_reason TEXT NOT NULL,
      source_prompt_ids_json TEXT NOT NULL,
      restored_at TEXT,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    INSERT INTO app_meta (key, value) VALUES
      ('library_version', '10'),
      ('seed_initialized', '1');
  `);

  const insertPrompt = raw.prepare(
    `
      INSERT INTO prompts (
        id, title, category, tags_json, content, use_case,
        created_at, updated_at, deleted_at, deleted_reason,
        merged_into_prompt_id, merge_version_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  );

  insertPrompt.run(
    "prompt-a",
    "合并后的提示词",
    "AI效能",
    JSON.stringify(["合并"]),
    "合并后的正文",
    "合并后的场景",
    "2026-08-01T00:00:00.000Z",
    "2026-08-03T00:00:00.000Z",
    null,
    null,
    null,
    null,
  );
  insertPrompt.run(
    "prompt-b",
    "合并来源提示词",
    "AI效能",
    JSON.stringify(["来源"]),
    "来源正文",
    "来源场景",
    "2026-08-01T00:00:00.000Z",
    "2026-08-02T00:00:00.000Z",
    "2026-08-03T00:00:00.000Z",
    "merge",
    "prompt-a",
    "merge-version-1",
  );
  insertPrompt.run(
    "prompt-c",
    "垃圾箱里的提示词",
    "产品设计",
    JSON.stringify(["垃圾箱"]),
    "垃圾箱正文",
    "垃圾箱场景",
    "2026-08-01T00:00:00.000Z",
    "2026-08-01T00:00:00.000Z",
    "2026-08-10T00:00:00.000Z",
    "manual",
    null,
    null,
  );
  insertPrompt.run(
    "prompt-d",
    "优化后的提示词",
    "软件开发",
    JSON.stringify(["优化"]),
    "优化后的正文",
    "优化场景",
    "2026-08-01T00:00:00.000Z",
    "2026-08-05T00:00:00.000Z",
    null,
    null,
    null,
    null,
  );

  const insertVersion = raw.prepare(
    `
      INSERT INTO prompt_versions (
        version_id, prompt_id, title, category, tags_json, content,
        use_case, created_at, version_reason, source_prompt_ids_json,
        restored_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  );

  insertVersion.run(
    "merge-version-1",
    "prompt-a",
    "合并前标题",
    "AI效能",
    JSON.stringify(["合并"]),
    "合并前正文",
    "合并前场景",
    "2026-08-03T00:00:00.000Z",
    "merge_before",
    JSON.stringify(["prompt-a", "prompt-b"]),
    null,
    "2099-01-01T00:00:00.000Z",
  );
  insertVersion.run(
    "optimize-version-1",
    "prompt-d",
    "优化前标题",
    "软件开发",
    JSON.stringify(["优化"]),
    "优化前正文",
    "优化场景",
    "2026-08-05T00:00:00.000Z",
    "optimize_before",
    JSON.stringify([]),
    null,
    "2099-01-01T00:00:00.000Z",
  );

  raw.close();
}

function createContext() {
  const directory = mkdtempSync(join(tmpdir(), "prompt-switch-"));
  const databasePath = join(directory, "prompts.sqlite");
  createLegacyDatabase(databasePath);

  return {
    databasePath,
    cleanup() {
      rmSync(directory, {
        force: true,
        maxRetries: 5,
        recursive: true,
        retryDelay: 100,
      });
    },
  };
}

test("切换演练：老库里的提示词、垃圾箱和恢复关系全部过渡到统一资产", () => {
  const context = createContext();
  const database = new PromptDatabase(context.databasePath);

  try {
    const prompts = database.listPrompts();
    const trash = database.listTrash();
    const assets = database.listAssets();

    // 活跃提示词只剩没被删除的两条。
    assert.deepEqual(
      prompts.map((prompt) => prompt.id).sort(),
      ["prompt-a", "prompt-d"],
    );
    const merged = prompts.find((prompt) => prompt.id === "prompt-a");
    assert.equal(merged.title, "合并后的提示词");
    assert.equal(merged.content, "合并后的正文");
    assert.deepEqual(merged.tags, ["合并"]);
    assert.equal(merged.category, "AI效能");

    // 手工删除和合并来源都还在垃圾箱里，合并关系没丢。
    assert.deepEqual(
      trash.map((prompt) => prompt.id).sort(),
      ["prompt-b", "prompt-c"],
    );
    const mergeSource = trash.find((prompt) => prompt.id === "prompt-b");
    assert.equal(mergeSource.deletedReason, "merge");
    assert.equal(mergeSource.mergedIntoPromptId, "prompt-a");
    assert.equal(mergeSource.mergeVersionId, "merge-version-1");

    // 全部提示词都归属默认项目，标识一个不变。
    assert.equal(assets.length, 4);
    assert.ok(
      assets.every(
        (asset) =>
          asset.assetType === "prompt" &&
          asset.projectId === DEFAULT_PROJECT_ID,
      ),
    );

    // 合并恢复记录和优化前快照都迁移到了资产版本里。
    const mergeRecords = database.listMergeRecoveryRecords();
    assert.equal(mergeRecords.length, 1);
    assert.equal(mergeRecords[0].versionId, "merge-version-1");
    assert.deepEqual(mergeRecords[0].sourcePromptIds, [
      "prompt-a",
      "prompt-b",
    ]);

    const optimizeVersion = database.fetchLatestOptimizeVersion("prompt-d");
    assert.equal(optimizeVersion.versionId, "optimize-version-1");
    assert.equal(optimizeVersion.content, "优化前正文");
  } finally {
    database.close();
    context.cleanup();
  }
});

test("切换演练：过渡过来的恢复能力仍然可用", () => {
  const context = createContext();
  const database = new PromptDatabase(context.databasePath);

  try {
    // 回到合并前：目标恢复成合并前内容，来源重新回到活跃列表。
    assert.ok(database.restoreMergeRecord("merge-version-1"));

    const promptsAfterMergeRestore = database.listPrompts();
    const restoredTarget = promptsAfterMergeRestore.find(
      (prompt) => prompt.id === "prompt-a",
    );
    const restoredSource = promptsAfterMergeRestore.find(
      (prompt) => prompt.id === "prompt-b",
    );

    assert.equal(restoredTarget.title, "合并前标题");
    assert.equal(restoredTarget.content, "合并前正文");
    assert.ok(restoredSource);
    assert.equal(restoredSource.deletedAt, null);
    assert.equal(database.listMergeRecoveryRecords().length, 0);

    // 回到优化前：内容恢复到优化前，快照被消费。
    assert.ok(database.restorePromptOptimize("prompt-d"));

    const optimized = database
      .listPrompts()
      .find((prompt) => prompt.id === "prompt-d");

    assert.equal(optimized.title, "优化前标题");
    assert.equal(optimized.content, "优化前正文");
    assert.equal(database.fetchLatestOptimizeVersion("prompt-d"), null);

    // 恢复动作本身也会留下内容版本，历史可以被追溯。
    assert.ok(database.listAssetVersions("prompt-a").length >= 3);
    assert.ok(database.listAssetVersions("prompt-d").length >= 3);
  } finally {
    database.close();
    context.cleanup();
  }
});

test("切换演练：重复打开不会重复迁移", () => {
  const context = createContext();
  const first = new PromptDatabase(context.databasePath);

  const firstAssets = first.listAssets().length;
  const firstVersions = first.listAssetVersions().length;

  first.close();

  const second = new PromptDatabase(context.databasePath);

  try {
    assert.equal(second.listAssets().length, firstAssets);
    assert.equal(second.listAssetVersions().length, firstVersions);
    assert.equal(second.listPrompts().length, 2);
    assert.equal(second.listTrash().length, 2);
  } finally {
    second.close();
    context.cleanup();
  }
});
