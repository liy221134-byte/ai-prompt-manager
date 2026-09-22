import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSET_BACKUP_NOTE,
  ASSET_BACKUP_VERSION,
  createAssetBackup,
  parseBackup,
  planAssetImport,
  planProjectMerge,
} from "../src/lib/prompt-backup.ts";

const project = {
  id: "project-a",
  name: "资产库",
  description: "把文档整理成资产",
  status: "active",
  stage: "development",
  createdAt: "2026-09-22T10:00:00.000Z",
  updatedAt: "2026-09-22T10:00:00.000Z",
  archivedAt: null,
};

const documentAsset = {
  id: "document-a",
  projectId: "project-a",
  assetType: "document",
  title: "需求说明",
  summary: "",
  content: "正文",
  metadata: {
    documentType: "PRD",
    relations: [
      { targetAssetId: "rule-a", relationType: "reference", note: "引用" },
    ],
  },
  source: {
    sourceType: "manual",
    sourceAssetId: null,
    importBatchId: null,
    originalFilename: null,
  },
  currentVersionId: "current-document-a",
  status: "active",
  archivedAt: null,
  deletedAt: null,
  deletedReason: null,
  createdAt: "2026-09-22T10:00:00.000Z",
  updatedAt: "2026-09-22T10:00:00.000Z",
};

test("v2 备份包含项目、资产和关系，并写明不包含来源包原文", () => {
  const backup = createAssetBackup({
    projects: [project],
    assets: [documentAsset],
    exportedAt: "2026-09-22T12:00:00.000Z",
  });

  assert.equal(backup.version, ASSET_BACKUP_VERSION);
  assert.equal(backup.projects.length, 1);
  assert.equal(backup.assets.length, 1);
  assert.deepEqual(backup.assets[0].metadata.relations, [
    { targetAssetId: "rule-a", relationType: "reference", note: "引用" },
  ]);
  assert.match(backup.note, /来源包/);
  assert.equal(backup.note, ASSET_BACKUP_NOTE);
});

test("垃圾箱里的资产不进备份", () => {
  const backup = createAssetBackup({
    projects: [project],
    assets: [
      documentAsset,
      {
        ...documentAsset,
        id: "document-trashed",
        deletedAt: "2026-09-22T11:00:00.000Z",
        deletedReason: "manual",
      },
    ],
  });

  assert.deepEqual(
    backup.assets.map((asset) => asset.id),
    ["document-a"],
  );
});

test("v2 备份能被解析回来，v1 备份继续走老解析路径", () => {
  const v2 = JSON.stringify(
    createAssetBackup({ projects: [project], assets: [documentAsset] }),
  );
  const parsedV2 = parseBackup(v2);

  assert.equal(parsedV2.kind, "asset");
  assert.equal(parsedV2.backup.assets.length, 1);

  const v1 = JSON.stringify({
    type: "ai-prompt-manager-backup",
    version: 1,
    exportedAt: "2026-09-22T12:00:00.000Z",
    prompts: [
      {
        id: "prompt-a",
        title: "提示词",
        category: "测试",
        tags: [],
        content: "正文",
        useCase: "场景",
        createdAt: "2026-09-22T10:00:00.000Z",
        updatedAt: "2026-09-22T10:00:00.000Z",
        deletedAt: null,
        deletedReason: null,
        mergedIntoPromptId: null,
        mergeVersionId: null,
      },
    ],
  });
  const parsedV1 = parseBackup(v1);

  assert.equal(parsedV1.kind, "prompt");
  assert.equal(parsedV1.backup.prompts.length, 1);
});

test("备份结构不对时给中文提示", () => {
  assert.throws(() => parseBackup("不是 JSON"), /不是有效的 JSON/);
  assert.throws(
    () => parseBackup(JSON.stringify({ type: "别的工具", version: 1 })),
    /不是 AI 提示词资产库的备份文件/,
  );
  assert.throws(
    () =>
      parseBackup(
        JSON.stringify({
          type: "ai-prompt-manager-backup",
          version: 2,
          exportedAt: "2026-09-22T12:00:00.000Z",
          projects: [project],
          assets: [{ ...documentAsset, metadata: {} }],
        }),
      ),
    /资产数据不完整/,
  );
});

test("同名项目按名称合并到已有项目", () => {
  const mapping = planProjectMerge(
    [{ ...project, id: "project-existing" }],
    [project, { ...project, id: "project-b", name: "另一个项目" }],
  );

  assert.equal(mapping.get("project-a"), "project-existing");
  assert.equal(mapping.get("project-b"), "project-b");
});

test("导入规划只新增不覆盖，同名项目合并、已有资产跳过", () => {
  const backup = createAssetBackup({
    projects: [project, { ...project, id: "project-b", name: "新项目" }],
    assets: [
      documentAsset,
      { ...documentAsset, id: "document-new", projectId: "project-b" },
    ],
    exportedAt: "2026-09-22T12:00:00.000Z",
  });

  const plan = planAssetImport({
    existingProjects: [{ ...project, id: "project-existing" }],
    existingAssets: [documentAsset],
    backup,
  });

  // 同名项目合并到已有项目，只新建另一个
  assert.deepEqual(
    plan.projectsToCreate.map((item) => item.id),
    ["project-b"],
  );
  assert.equal(plan.projectIdMap.get("project-a"), "project-existing");

  // 已有 id 的资产跳过，不覆盖
  assert.deepEqual(plan.skippedAssetIds, ["document-a"]);
  assert.deepEqual(
    plan.assetsToCreate.map((asset) => asset.id),
    ["document-new"],
  );

  // 被合并项目的资产会改挂到已有项目上
  assert.deepEqual(
    planAssetImport({
      existingProjects: [{ ...project, id: "project-existing" }],
      existingAssets: [],
      backup,
    }).assetsToCreate.map((asset) => asset.projectId),
    ["project-existing", "project-b"],
  );
});
