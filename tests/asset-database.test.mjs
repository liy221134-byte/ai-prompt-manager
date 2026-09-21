import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { DEFAULT_PROJECT_ID } from "../src/data/projects.ts";
import { PromptDatabase } from "../src/lib/server/prompt-database.ts";

function createContext() {
  const directory = mkdtempSync(join(tmpdir(), "asset-database-"));
  const databasePath = join(directory, "prompts.sqlite");

  return {
    database: new PromptDatabase(databasePath),
    databasePath,
    cleanup() {
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

function createPrompt(overrides = {}) {
  return {
    id: "prompt-asset-test",
    title: "资产迁移测试",
    category: "AI效能",
    tags: ["资产", "迁移"],
    content: "请处理 {{内容}}",
    useCase: "验证统一资产迁移。",
    createdAt: "2026-09-21T08:00:00.000Z",
    updatedAt: "2026-09-21T08:00:00.000Z",
    deletedAt: null,
    deletedReason: null,
    mergedIntoPromptId: null,
    mergeVersionId: null,
    ...overrides,
  };
}

test("首次启动会创建默认项目并迁移示例提示词", () => {
  const context = createContext();

  try {
    const project = context.database.getDefaultProject();
    const assets = context.database.listAssets();
    const versions = context.database.listAssetVersions();

    assert.equal(project.id, DEFAULT_PROJECT_ID);
    assert.equal(project.status, "active");
    assert.equal(assets.length, 3);
    assert.equal(versions.length, 3);
    assert.ok(assets.every((asset) => asset.assetType === "prompt"));
    assert.ok(
      assets.every((asset) => asset.projectId === DEFAULT_PROJECT_ID),
    );
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("新增提示词后重新打开会同步到统一资产", () => {
  const context = createContext();
  const prompt = createPrompt();

  try {
    context.database.createPrompt(prompt);
    context.database.close();

    const reopened = new PromptDatabase(context.databasePath);

    try {
      const asset = reopened
        .listAssets()
        .find((item) => item.id === prompt.id);
      const versions = reopened.listAssetVersions(prompt.id);

      assert.ok(asset);
      assert.equal(asset.title, prompt.title);
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

test("合并恢复快照会迁移成资产版本并保留来源关系", () => {
  const context = createContext();

  try {
    context.database.createPrompt(
      createPrompt({ id: "prompt-asset-a", title: "资产 A" }),
    );
    context.database.createPrompt(
      createPrompt({ id: "prompt-asset-b", title: "资产 B" }),
    );
    context.database.commitPromptMerge({
      prompt: createPrompt({
        id: "prompt-asset-a",
        title: "合并后的资产",
        updatedAt: "2026-09-21T09:00:00.000Z",
      }),
      sourcePromptIds: ["prompt-asset-a", "prompt-asset-b"],
      versionId: "merge-asset-version",
    });
    context.database.close();

    const reopened = new PromptDatabase(context.databasePath);

    try {
      const mergeVersion = reopened
        .listAssetVersions("prompt-asset-a")
        .find((version) => version.versionId === "merge-asset-version");
      const sourceAsset = reopened
        .listAssets()
        .find((asset) => asset.id === "prompt-asset-b");

      assert.ok(mergeVersion);
      assert.equal(mergeVersion.versionReason, "merge_before");
      assert.deepEqual(mergeVersion.sourceAssetIds, [
        "prompt-asset-a",
        "prompt-asset-b",
      ]);
      assert.equal(sourceAsset.deletedReason, "merge");
      assert.equal(sourceAsset.metadata.mergedIntoAssetId, "prompt-asset-a");
      assert.equal(sourceAsset.metadata.mergeVersionId, "merge-asset-version");
    } finally {
      reopened.close();
    }
  } finally {
    context.cleanup();
  }
});

test("重复打开数据库不会重复迁移资产和版本", () => {
  const context = createContext();
  const firstAssetCount = context.database.listAssets().length;
  const firstVersionCount = context.database.listAssetVersions().length;

  context.database.close();

  const second = new PromptDatabase(context.databasePath);
  second.close();

  const third = new PromptDatabase(context.databasePath);

  try {
    assert.equal(third.listAssets().length, firstAssetCount);
    assert.equal(third.listAssetVersions().length, firstVersionCount);
  } finally {
    third.close();
    context.cleanup();
  }
});

test("垃圾箱状态会同步到统一资产生命周期字段", () => {
  const context = createContext();

  try {
    context.database.createPrompt(
      createPrompt({ id: "prompt-asset-trash" }),
    );
    context.database.deletePrompt("prompt-asset-trash");
    context.database.close();

    const reopened = new PromptDatabase(context.databasePath);

    try {
      const asset = reopened
        .listAssets()
        .find((item) => item.id === "prompt-asset-trash");

      assert.ok(asset);
      assert.equal(asset.deletedReason, "manual");
      assert.ok(asset.deletedAt);
    } finally {
      reopened.close();
    }
  } finally {
    context.cleanup();
  }
});
