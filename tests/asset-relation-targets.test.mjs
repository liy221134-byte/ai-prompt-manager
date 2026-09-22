import assert from "node:assert/strict";
import test from "node:test";

import { listRelationTargetOptions } from "../src/lib/asset-list.ts";

function createAsset(overrides = {}) {
  return {
    id: "asset-1",
    projectId: "project-1",
    assetType: "rule",
    title: "提交前必须通过检查",
    summary: "规则摘要",
    content: "运行 npm run check",
    metadata: { ruleType: "must", scope: "project" },
    source: {
      sourceType: "manual",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: "version-1",
    status: "active",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z",
    ...overrides,
  };
}

const assets = [
  createAsset({ id: "prompt-a", title: "提示词 A" }),
  createAsset({ id: "prompt-b", title: "提示词 B" }),
  createAsset({
    id: "rule-trashed",
    title: "已进垃圾箱的规则",
    deletedAt: "2026-09-22T01:00:00.000Z",
  }),
  createAsset({
    id: "rule-archived",
    title: "已归档的规则",
    status: "archived",
    archivedAt: "2026-09-22T01:00:00.000Z",
  }),
  createAsset({ id: "other-project", projectId: "project-2", title: "别的项目" }),
];

test("关系目标候选只列同项目、没进垃圾箱的资产", () => {
  const options = listRelationTargetOptions(assets, {
    projectId: "project-1",
  });

  assert.deepEqual(
    options.map((option) => option.id),
    ["prompt-a", "prompt-b", "rule-archived"],
  );
});

test("正在编辑的那条不会出现在候选里，避免指向自己", () => {
  const options = listRelationTargetOptions(assets, {
    projectId: "project-1",
    excludeAssetIds: ["prompt-a"],
  });

  assert.equal(
    options.some((option) => option.id === "prompt-a"),
    false,
  );
  assert.equal(
    options.some((option) => option.id === "prompt-b"),
    true,
  );
});

test("同时编辑提示词和资产时，两条都能被排除", () => {
  const options = listRelationTargetOptions(assets, {
    projectId: "project-1",
    excludeAssetIds: ["prompt-a", "rule-archived"],
  });

  assert.deepEqual(
    options.map((option) => option.id),
    ["prompt-b"],
  );
});
