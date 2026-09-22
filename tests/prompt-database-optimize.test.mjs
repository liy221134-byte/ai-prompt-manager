import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { PromptDatabase } from "../src/lib/server/prompt-database.ts";

function createContext() {
  const directory = mkdtempSync(join(tmpdir(), "prompt-optimize-"));
  const databasePath = join(directory, "prompts.sqlite");

  return {
    database: new PromptDatabase(databasePath),
    databasePath,
    cleanup() {
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

function prompt(overrides = {}) {
  return {
    id: "prompt-a",
    title: "行业分析",
    category: "产品设计",
    tags: ["分析"],
    content: "请分析 {{行业}} 的市场规模",
    useCase: "快速了解一个行业",
    createdAt: "2026-09-21T00:00:00.000Z",
    updatedAt: "2026-09-21T00:00:00.000Z",
    deletedAt: null,
    deletedReason: null,
    mergedIntoPromptId: null,
    mergeVersionId: null,
    ...overrides,
  };
}

function readVersions(databasePath, promptId) {
  const raw = new DatabaseSync(databasePath);
  const rows = raw
    .prepare(
      `
        SELECT version_id, version_reason, content, restored_at
        FROM asset_versions
        WHERE asset_id = ?
        ORDER BY version_number ASC
      `,
    )
    .all(promptId);
  raw.close();
  return rows;
}

test("提交优化会先存优化前快照再更新提示词", () => {
  const context = createContext();

  try {
    context.database.createPrompt(prompt());

    context.database.commitPromptOptimize({
      prompt: prompt({
        title: "行业分析助手",
        content: "## 任务\n请分析 {{行业}} 的市场规模",
        updatedAt: "2026-09-21T01:00:00.000Z",
      }),
      versionId: "version-optimize",
    });

    const stored = context.database
      .listPrompts()
      .find((item) => item.id === "prompt-a");

    assert.equal(stored.title, "行业分析助手");
    assert.equal(stored.content, "## 任务\n请分析 {{行业}} 的市场规模");

    const version = context.database.fetchLatestOptimizeVersion("prompt-a");

    assert.equal(version.versionId, "version-optimize");
    assert.equal(version.versionReason, "optimize_before");
    assert.equal(version.content, "请分析 {{行业}} 的市场规模");
    assert.equal(version.restoredAt, null);
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("回到优化前会恢复内容，并留下回退前快照", () => {
  const context = createContext();

  try {
    context.database.createPrompt(prompt());
    context.database.commitPromptOptimize({
      prompt: prompt({
        title: "行业分析助手",
        content: "## 任务\n请分析 {{行业}} 的市场规模",
      }),
      versionId: "version-optimize",
    });

    const snapshot = context.database.restorePromptOptimize("prompt-a");

    assert.ok(snapshot);

    const restored = context.database
      .listPrompts()
      .find((item) => item.id === "prompt-a");

    assert.equal(restored.title, "行业分析");
    assert.equal(restored.content, "请分析 {{行业}} 的市场规模");

    // 优化前快照已被消费，不能再回退第二次。
    assert.equal(context.database.fetchLatestOptimizeVersion("prompt-a"), null);

    const versions = readVersions(context.databasePath, "prompt-a");
    const optimizeSnapshot = versions.find(
      (row) => row.version_reason === "optimize_before",
    );
    const restoreSnapshot = versions.find(
      (row) => row.version_reason === "restore_before",
    );

    assert.deepEqual(
      versions.map((row) => row.version_reason),
      ["initial", "optimize_before", "save", "restore_before", "restore"],
    );
    // 优化前快照已被消费，回退前快照还没有。
    assert.notEqual(optimizeSnapshot.restored_at, null);
    assert.equal(restoreSnapshot.restored_at, null);
    // 回退前快照保存的是回退发生之前的内容，也就是优化后的内容。
    assert.equal(
      restoreSnapshot.content,
      "## 任务\n请分析 {{行业}} 的市场规模",
    );
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("回到优化前会自己生成新的快照编号", () => {
  const context = createContext();

  try {
    context.database.createPrompt(prompt());
    context.database.commitPromptOptimize({
      prompt: prompt({ content: "## 任务\n优化后的正文" }),
      versionId: "version-optimize",
    });

    // 界面只提供提示词标识；回退前快照的编号必须由服务端新生成，
    // 复用被消费的那条编号会撞主键，让整个回退失败。
    const snapshot = context.database.restorePromptOptimize("prompt-a");

    assert.ok(snapshot);

    const versions = readVersions(context.databasePath, "prompt-a");
    const restoreSnapshot = versions.find(
      (row) => row.version_reason === "restore_before",
    );
    const optimizeSnapshot = versions.find(
      (row) => row.version_reason === "optimize_before",
    );

    assert.deepEqual(
      versions.map((row) => row.version_reason),
      ["initial", "optimize_before", "save", "restore_before", "restore"],
    );
    assert.notEqual(restoreSnapshot.version_id, optimizeSnapshot.version_id);
    assert.ok(String(restoreSnapshot.version_id).startsWith("version-"));
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("没有优化记录时回退返回空", () => {
  const context = createContext();

  try {
    context.database.createPrompt(prompt());

    assert.equal(context.database.fetchLatestOptimizeVersion("prompt-a"), null);
    assert.equal(
      context.database.restorePromptOptimize("prompt-a"),
      null,
    );
    // 没有优化记录时不写回退快照，只留下创建提示词时的内容版本。
    assert.deepEqual(
      readVersions(context.databasePath, "prompt-a").map(
        (row) => row.version_reason,
      ),
      ["initial"],
    );
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("提交优化会拒绝不存在的提示词且不写入快照", () => {
  const context = createContext();

  try {
    assert.throws(
      () =>
        context.database.commitPromptOptimize({
          prompt: prompt({ id: "prompt-missing" }),
          versionId: "version-optimize",
        }),
      /提示词不存在/,
    );
    assert.equal(
      readVersions(context.databasePath, "prompt-missing").length,
      0,
    );
  } finally {
    context.database.close();
    context.cleanup();
  }
});
