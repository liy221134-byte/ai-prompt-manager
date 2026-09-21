import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { DEFAULT_PROJECT_ID } from "../src/data/projects.ts";
import {
  PROMPT_BACKUP_TYPE,
  PROMPT_BACKUP_VERSION,
  createPromptBackup,
  parsePromptBackup,
} from "../src/lib/prompt-backup.ts";
import { localPromptDataSource } from "../src/lib/prompt-source.ts";
import { PromptDatabase } from "../src/lib/server/prompt-database.ts";

function createContext() {
  const directory = mkdtempSync(join(tmpdir(), "asset-backup-"));
  const databasePath = join(directory, "prompts.sqlite");

  return {
    database: new PromptDatabase(databasePath),
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

function createPrompt(overrides = {}) {
  return {
    id: "prompt-backup-a",
    title: "备份导入测试",
    category: "AI效能",
    tags: ["备份", "兼容"],
    content: "请处理 {{内容}}",
    useCase: "验证旧备份可以进入默认项目。",
    createdAt: "2026-09-21T08:00:00.000Z",
    updatedAt: "2026-09-21T08:00:00.000Z",
    deletedAt: null,
    deletedReason: null,
    mergedIntoPromptId: null,
    mergeVersionId: null,
    ...overrides,
  };
}

function findAsset(database, assetId) {
  return database.listAssets().find((asset) => asset.id === assetId);
}

test("旧版提示词备份导入后会进入默认项目", () => {
  const context = createContext();
  const prompt = createPrompt({ id: "prompt-backup-import" });

  try {
    const backup = parsePromptBackup(
      createPromptBackup([prompt], "2026-09-21T10:00:00.000Z"),
    );
    const result = context.database.mergePrompts(backup.prompts);

    assert.equal(result.addCount, 1);
    assert.equal(result.updateCount, 0);

    context.database.close();

    // 统一资产在启动时同步，重新打开相当于下一次启动。
    const reopened = new PromptDatabase(context.databasePath);

    try {
      const asset = findAsset(reopened, prompt.id);
      const versions = reopened.listAssetVersions(prompt.id);

      assert.ok(asset);
      assert.equal(asset.projectId, DEFAULT_PROJECT_ID);
      assert.equal(asset.assetType, "prompt");
      assert.equal(asset.title, prompt.title);
      assert.equal(asset.content, prompt.content);
      assert.equal(asset.summary, prompt.useCase);
      assert.equal(asset.status, "active");
      assert.deepEqual(asset.metadata.tags, prompt.tags);
      assert.equal(asset.metadata.category, prompt.category);
      assert.ok(
        versions.some(
          (version) => version.versionId === asset.currentVersionId,
        ),
      );
    } finally {
      reopened.close();
    }
  } finally {
    context.cleanup();
  }
});

test("统一资产迁移失败时旧提示词数据仍然完整可读", () => {
  const context = createContext();
  const promptId = "prompt-migration-safety";

  try {
    context.database.createPrompt(
      createPrompt({ id: promptId, title: "迁移安全测试" }),
    );
    context.database.close();

    // 故意把统一资产表改成不兼容结构，让下一次启动的迁移直接失败。
    const raw = new DatabaseSync(context.databasePath);
    raw.exec("DROP TABLE asset_versions");
    raw.exec("DROP TABLE assets");
    raw.exec("CREATE TABLE assets (id TEXT PRIMARY KEY)");
    raw.close();

    assert.throws(() => new PromptDatabase(context.databasePath));

    // 迁移失败不能破坏迁移前的数据源。
    const check = new DatabaseSync(context.databasePath);

    try {
      const row = check
        .prepare("SELECT title, content FROM prompts WHERE id = ?")
        .get(promptId);
      const count = check
        .prepare("SELECT COUNT(*) AS count FROM prompts")
        .get();

      assert.equal(row.title, "迁移安全测试");
      assert.equal(row.content, "请处理 {{内容}}");
      // 3 条示例提示词 + 新增的 1 条，一条都不能少。
      assert.equal(Number(count.count), 4);
    } finally {
      check.close();
    }
  } finally {
    context.cleanup();
  }
});

test("重复导入同一份备份不会产生重复资产和版本", () => {
  const context = createContext();
  const prompt = createPrompt({ id: "prompt-backup-duplicate" });

  try {
    const backup = parsePromptBackup(
      createPromptBackup([prompt], "2026-09-21T10:00:00.000Z"),
    );

    context.database.mergePrompts(backup.prompts);
    const secondImport = context.database.mergePrompts(backup.prompts);
    const thirdImport = context.database.mergePrompts(backup.prompts);

    assert.equal(secondImport.addCount, 0);
    assert.equal(secondImport.updateCount, 0);
    assert.equal(thirdImport.addCount, 0);
    assert.equal(thirdImport.updateCount, 0);

    context.database.close();

    for (let round = 0; round < 2; round += 1) {
      const reopened = new PromptDatabase(context.databasePath);

      try {
        const matchingAssets = reopened
          .listAssets()
          .filter((asset) => asset.id === prompt.id);

        assert.equal(matchingAssets.length, 1);
        assert.equal(reopened.listAssetVersions(prompt.id).length, 1);
      } finally {
        reopened.close();
      }
    }
  } finally {
    context.cleanup();
  }
});

test("合并来源在统一资产里保留关系，垃圾箱恢复后清除", () => {
  const context = createContext();

  try {
    context.database.createPrompt(
      createPrompt({ id: "prompt-merge-target", title: "合并目标" }),
    );
    context.database.createPrompt(
      createPrompt({ id: "prompt-merge-source", title: "合并来源" }),
    );
    context.database.commitPromptMerge({
      prompt: createPrompt({
        id: "prompt-merge-target",
        title: "合并结果",
        updatedAt: "2026-09-21T09:00:00.000Z",
      }),
      sourcePromptIds: ["prompt-merge-target", "prompt-merge-source"],
      versionId: "merge-version-1",
    });
    context.database.close();

    const reopened = new PromptDatabase(context.databasePath);

    try {
      const sourceAsset = findAsset(reopened, "prompt-merge-source");
      const targetAsset = findAsset(reopened, "prompt-merge-target");

      assert.equal(sourceAsset.deletedReason, "merge");
      assert.equal(
        sourceAsset.metadata.mergedIntoAssetId,
        "prompt-merge-target",
      );
      assert.equal(sourceAsset.metadata.mergeVersionId, "merge-version-1");
      assert.equal(targetAsset.deletedAt, null);
      assert.equal(targetAsset.title, "合并结果");

      assert.equal(reopened.restorePrompt("prompt-merge-source"), true);
    } finally {
      reopened.close();
    }

    const afterRestore = new PromptDatabase(context.databasePath);

    try {
      const restoredAsset = findAsset(afterRestore, "prompt-merge-source");

      assert.equal(restoredAsset.deletedAt, null);
      assert.equal(restoredAsset.deletedReason, null);
      assert.equal(restoredAsset.metadata.mergedIntoAssetId, null);
      assert.equal(restoredAsset.metadata.mergeVersionId, null);
      assert.equal(restoredAsset.status, "active");
    } finally {
      afterRestore.close();
    }
  } finally {
    context.cleanup();
  }
});

test("优化前快照会迁移成资产版本，并可以回到优化前", () => {
  const context = createContext();

  try {
    context.database.createPrompt(
      createPrompt({
        id: "prompt-optimize-1",
        title: "优化前标题",
        content: "优化前正文",
      }),
    );
    context.database.commitPromptOptimize({
      prompt: createPrompt({
        id: "prompt-optimize-1",
        title: "优化后标题",
        content: "优化后正文",
        updatedAt: "2026-09-21T11:00:00.000Z",
      }),
      versionId: "optimize-version-1",
    });
    context.database.close();

    const reopened = new PromptDatabase(context.databasePath);

    try {
      const asset = findAsset(reopened, "prompt-optimize-1");
      const version = reopened
        .listAssetVersions("prompt-optimize-1")
        .find((item) => item.versionId === "optimize-version-1");

      assert.equal(asset.title, "优化后标题");
      assert.equal(asset.content, "优化后正文");
      assert.ok(version);
      assert.equal(version.versionReason, "optimize_before");
      assert.equal(version.title, "优化前标题");
      assert.equal(version.content, "优化前正文");

      // 回退会新写一条「回退前快照」，标识由服务端生成，调用方只提供提示词标识。
      assert.notEqual(
        reopened.restorePromptOptimize("prompt-optimize-1"),
        null,
      );
    } finally {
      reopened.close();
    }

    const afterRestore = new PromptDatabase(context.databasePath);

    try {
      const asset = findAsset(afterRestore, "prompt-optimize-1");

      assert.equal(asset.title, "优化前标题");
      assert.equal(asset.content, "优化前正文");
    } finally {
      afterRestore.close();
    }
  } finally {
    context.cleanup();
  }
});

test("本地回到优化前不会再向接口传回退快照标识", async () => {
  const requests = [];
  const previousFetch = globalThis.fetch;

  globalThis.fetch = async (url, init) => {
    requests.push({
      url: String(url),
      body: init?.body ? JSON.parse(init.body) : null,
    });

    return new Response(JSON.stringify({ version: 1, prompts: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await localPromptDataSource.restoreAiOptimize("prompt-a");
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/api/prompts/ai-optimize/prompt-a");
  // 回退快照标识由服务端生成，请求体里不能再出现版本标识。
  assert.equal(requests[0].body, null);
});

test("当前备份格式只包含提示词，不包含规则和文档", () => {
  const context = createContext();

  try {
    context.database.createAsset({
      asset: {
        id: "rule-in-backup",
        projectId: DEFAULT_PROJECT_ID,
        assetType: "rule",
        title: "备份不应该带走这条规则",
        summary: "规则摘要",
        content: "规则正文",
        metadata: { ruleType: "must", scope: "project" },
        source: {
          sourceType: "manual",
          sourceAssetId: null,
          importBatchId: null,
          originalFilename: null,
        },
        currentVersionId: "current-rule-in-backup",
        status: "active",
        archivedAt: null,
        deletedAt: null,
        deletedReason: null,
        createdAt: "2026-09-21T12:00:00.000Z",
        updatedAt: "2026-09-21T12:00:00.000Z",
      },
      versionId: "current-rule-in-backup",
      changeReason: "创建资产",
      versionReason: "initial",
    });

    const backupContent = createPromptBackup(
      context.database.listPrompts(),
      "2026-09-21T12:00:00.000Z",
    );
    const parsedBackup = JSON.parse(backupContent);

    assert.equal(parsedBackup.type, PROMPT_BACKUP_TYPE);
    assert.equal(parsedBackup.version, PROMPT_BACKUP_VERSION);
    assert.equal(Array.isArray(parsedBackup.prompts), true);
    assert.equal(
      Object.keys(parsedBackup).sort().join(","),
      "exportedAt,prompts,type,version",
    );
    assert.equal(backupContent.includes("rule-in-backup"), false);
    assert.equal(backupContent.includes("规则正文"), false);

    // 备份里的每条记录只保留提示词内容字段，生命周期字段不进备份文件。
    for (const prompt of parsedBackup.prompts) {
      assert.equal(
        Object.keys(prompt).sort().join(","),
        "category,content,createdAt,id,tags,title,updatedAt,useCase",
      );
    }
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("提示词标识在备份往返和统一资产迁移中保持不变", () => {
  const context = createContext();
  const prompt = createPrompt({ id: "prompt-stable-id" });

  try {
    const backup = createPromptBackup([prompt], "2026-09-21T13:00:00.000Z");
    const parsed = parsePromptBackup(backup);

    assert.equal(parsed.prompts[0].id, "prompt-stable-id");

    context.database.mergePrompts(parsed.prompts);
    context.database.close();

    const reopened = new PromptDatabase(context.databasePath);

    try {
      assert.ok(
        reopened.listPrompts().some((item) => item.id === "prompt-stable-id"),
      );
      assert.ok(findAsset(reopened, "prompt-stable-id"));
    } finally {
      reopened.close();
    }
  } finally {
    context.cleanup();
  }
});
