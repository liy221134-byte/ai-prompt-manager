import assert from "node:assert/strict";
import test from "node:test";

import {
  markImportCandidates,
  materializeImportAssets,
} from "../src/lib/graph-import.ts";

const now = "2026-09-23T12:00:00.000Z";

function createNode(overrides = {}) {
  const { metadata, ...rest } = overrides;

  return {
    id: "node-1",
    projectId: "project-a",
    assetType: "graph_node",
    title: "已有节点",
    summary: "",
    content: "已有内容",
    metadata: {
      nodeType: "data",
      code: "TBL-assets",
      parentId: null,
      note: "",
      ...metadata,
    },
    source: {
      sourceType: "manual",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: "current-node-1",
    status: "active",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: now,
    updatedAt: now,
    ...rest,
  };
}

function createDraft(overrides = {}) {
  return {
    id: "draft-1",
    nodeType: "data",
    code: "TBL-projects",
    title: "projects",
    summary: "3 个字段",
    content: "字段清单",
    note: "来自 migrate.sql",
    sourceLabel: "migrate.sql",
    parentCode: null,
    relations: [],
    ...overrides,
  };
}

test("同项目同类型的编号已存在时标成已存在，忽略大小写", () => {
  const candidates = markImportCandidates(
    [
      createDraft({ code: "tbl-ASSETS" }),
      createDraft({ id: "draft-2", code: "TBL-projects" }),
    ],
    [createNode()],
  );

  assert.equal(candidates[0].existingAssetId, "node-1");
  assert.equal(candidates[1].existingAssetId, null);
});

test("编号查重只看同类型，垃圾箱里的节点不占位", () => {
  const candidates = markImportCandidates(
    [
      createDraft({ nodeType: "module", code: "TBL-assets" }),
      createDraft({ code: "TBL-assets" }),
    ],
    [
      createNode({
        id: "node-module",
        metadata: { nodeType: "module", code: "TBL-assets" },
      }),
      createNode({ id: "node-trashed", deletedAt: now }),
    ],
  );

  assert.equal(candidates[0].existingAssetId, "node-module");
  assert.equal(candidates[1].existingAssetId, null);
});

test("物化时把父节点和关系换成资产标识，来源标成导入", () => {
  const [child, parent] = materializeImportAssets({
    candidates: [
      {
        ...createDraft({ id: "draft-child", parentCode: "TBL-projects" }),
        existingAssetId: null,
        relations: [
          {
            targetCode: "TBL-projects",
            relationType: "depends_on",
            note: "project_id → projects(id)",
          },
        ],
      },
      {
        ...createDraft({ id: "draft-parent", code: "TBL-projects" }),
        existingAssetId: null,
      },
    ],
    existingNodes: [],
    projectId: "project-a",
    batchId: "batch-1",
    now,
  });

  assert.equal(child.metadata.parentId, "draft-parent");
  assert.deepEqual(child.metadata.relations, [
    {
      targetAssetId: "draft-parent",
      relationType: "depends_on",
      note: "project_id → projects(id)",
    },
  ]);
  assert.equal(parent.metadata.parentId, null);
  assert.deepEqual(child.source, {
    sourceType: "import",
    sourceAssetId: null,
    importBatchId: "batch-1",
    originalFilename: "migrate.sql",
  });
  assert.equal(child.status, "active");
  assert.equal(child.currentVersionId, "current-draft-child");
});

test("关系指向库里已有的节点时按编号回落到那条资产", () => {
  const [imported] = materializeImportAssets({
    candidates: [
      {
        ...createDraft({ id: "draft-child" }),
        existingAssetId: null,
        relations: [
          {
            targetCode: "tbl-ASSETS",
            relationType: "depends_on",
            note: "",
          },
        ],
      },
    ],
    existingNodes: [createNode()],
    projectId: "project-a",
    batchId: "batch-1",
    now,
  });

  assert.equal(imported.metadata.relations[0].targetAssetId, "node-1");
});

test("指向自己的关系和找不到目标的关系都不写进元数据", () => {
  const [imported] = materializeImportAssets({
    candidates: [
      {
        ...createDraft({}),
        existingAssetId: null,
        relations: [
          { targetCode: "TBL-projects", relationType: "depends_on", note: "" },
          { targetCode: "TBL-missing", relationType: "depends_on", note: "" },
        ],
      },
    ],
    existingNodes: [],
    projectId: "project-a",
    batchId: "batch-1",
    now,
  });

  assert.equal(imported.metadata.relations, undefined);
});
