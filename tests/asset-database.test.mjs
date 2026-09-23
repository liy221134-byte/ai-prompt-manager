import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
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

test("本地数据库可以创建和更新项目", () => {
  const context = createContext();
  const project = {
    id: "project-1",
    name: "提示词资产工具",
    description: "项目管理测试",
    status: "active",
    stage: "development",
    riskLevel: "user_data",
    createdAt: "2026-09-21T10:00:00.000Z",
    updatedAt: "2026-09-21T10:00:00.000Z",
    archivedAt: null,
  };

  try {
    assert.equal(context.database.createProject(project), true);
    assert.equal(context.database.createProject(project), false);
    assert.equal(
      context.database.updateProject({
        ...project,
        name: "更新后的项目",
        updatedAt: "2026-09-21T11:00:00.000Z",
      }),
      true,
    );
    assert.ok(
      context.database
        .listProjects()
        .some(
          (item) =>
            item.name === "更新后的项目" && item.riskLevel === "user_data",
        ),
    );
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("本地数据库可以创建规则资产并保存不可变版本", () => {
  const context = createContext();
  const asset = {
    id: "rule-1",
    projectId: "default-project",
    assetType: "rule",
    title: "删除数据前必须确认",
    summary: "保护用户数据。",
    content: "未经确认不得删除用户数据。",
    metadata: {
      ruleType: "must",
      scope: "global",
    },
    source: {
      sourceType: "manual",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: "rule-version-1",
    status: "active",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: "2026-09-21T10:00:00.000Z",
    updatedAt: "2026-09-21T10:00:00.000Z",
  };

  try {
    assert.equal(
      context.database.createAsset({
        asset,
        versionId: "rule-version-1",
        changeReason: "创建规则",
      }),
      true,
    );
    assert.equal(
      context.database.createAsset({
        asset,
        versionId: "rule-version-1",
        changeReason: "创建规则",
      }),
      false,
    );
    assert.equal(context.database.listAssetVersions("rule-1").length, 1);

    const updatedAsset = {
      ...asset,
      content: "删除任何用户数据前必须得到明确确认。",
      currentVersionId: "rule-version-2",
      updatedAt: "2026-09-21T11:00:00.000Z",
    };

    assert.equal(
      context.database.updateAsset({
        asset: updatedAsset,
        versionId: "rule-version-2",
        changeReason: "补充确认范围",
      }),
      true,
    );

    const versions = context.database.listAssetVersions("rule-1");

    assert.equal(versions.length, 2);
    assert.equal(versions[1].versionNumber, 2);
    assert.equal(context.database.getAsset("rule-1").content, updatedAsset.content);
  } finally {
    context.database.close();
    context.cleanup();
  }
});

// 2.8.0 之前建的库没有 projects.risk_level 这一列，打开时要自动补上，不能报错
test("老库升级：项目表缺质量等级列时自动补列，老项目读成个人工具", () => {
  const directory = mkdtempSync(join(tmpdir(), "asset-database-legacy-"));
  const databasePath = join(directory, "prompts.sqlite");
  const legacy = new DatabaseSync(databasePath);

  legacy.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      stage TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );

    INSERT INTO projects (
      id, name, description, status, stage, created_at, updated_at, archived_at
    ) VALUES (
      'default-project', '默认项目', '升级前建的项目', 'active', 'development',
      '2026-09-20T00:00:00.000Z', '2026-09-20T00:00:00.000Z', NULL
    );
  `);
  legacy.close();

  const database = new PromptDatabase(databasePath);

  try {
    const [project] = database.listProjects();

    assert.equal(project.id, DEFAULT_PROJECT_ID);
    assert.equal(project.riskLevel, "personal");

    // 补完列之后还能正常改等级
    database.updateProject({ ...project, riskLevel: "low_risk" });
    assert.equal(database.listProjects()[0].riskLevel, "low_risk");
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

// 回滚演练发现的场景：用新版本建过数据后，旧代码读到不认识的类型。
// 这里验证报错说得清楚，而不是丢一个「无法识别」让人猜。
test("读到不认识的资产类型时，报错里带类型和处置办法", () => {
  const context = createContext();

  try {
    context.database.close();

    const raw = new DatabaseSync(context.databasePath);

    raw.exec(`
      INSERT INTO assets (
        id, project_id, asset_type, title, summary, content, metadata_json,
        source_type, source_asset_id, import_batch_id, original_filename,
        current_version_id, status, archived_at, deleted_at, deleted_reason,
        created_at, updated_at
      ) VALUES (
        'future-asset-1', 'default-project', 'future_type', '未来版本建的资产', '', '正文', '{}',
        'manual', NULL, NULL, NULL,
        'current-future-asset-1', 'active', NULL, NULL, NULL,
        '2026-09-24T00:00:00.000Z', '2026-09-24T00:00:00.000Z'
      );
    `);
    raw.close();

    // 和回滚演练里一样：旧代码连库都打不开，报错发生在启动阶段
    assert.throws(
      () => new PromptDatabase(context.databasePath),
      (error) =>
        error.message.includes("future-asset-1") &&
        error.message.includes("future_type") &&
        error.message.includes("导出一份备份"),
    );
  } finally {
    context.cleanup();
  }
});
