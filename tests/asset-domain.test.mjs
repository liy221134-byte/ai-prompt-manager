import assert from "node:assert/strict";
import test from "node:test";

import {
  assetToPrompt,
  createAssetVersion,
  isAssetData,
  isAssetVersionData,
  promptToAsset,
} from "../src/data/assets.ts";

const samplePrompt = {
  id: "prompt-product-review",
  title: "产品需求评审助手",
  category: "产品设计",
  tags: ["需求分析", "评审"],
  content: "请评审 {{需求文档}}。",
  useCase: "在需求评审前检查范围。",
  createdAt: "2026-09-17T02:00:00.000Z",
  updatedAt: "2026-09-18T02:00:00.000Z",
  deletedAt: null,
  deletedReason: null,
  mergedIntoPromptId: null,
  mergeVersionId: null,
};

test("提示词可以转换成统一资产并原样转回", () => {
  const asset = promptToAsset(samplePrompt, "default-project");

  assert.equal(asset.assetType, "prompt");
  assert.equal(asset.id, samplePrompt.id);
  assert.equal(asset.projectId, "default-project");
  assert.equal(asset.currentVersionId, "version-prompt-product-review-1");
  assert.deepEqual(assetToPrompt(asset), samplePrompt);
});

test("提示词转换会保留垃圾箱和合并关系", () => {
  const trashedPrompt = {
    ...samplePrompt,
    deletedAt: "2026-09-19T00:00:00.000Z",
    deletedReason: "merge",
    mergedIntoPromptId: "prompt-target",
    mergeVersionId: "merge-1",
  };

  assert.deepEqual(
    assetToPrompt(promptToAsset(trashedPrompt, "default-project")),
    trashedPrompt,
  );
});

test("正式资产版本会保留资产类型、内容和变更原因", () => {
  const asset = promptToAsset(samplePrompt, "default-project");
  const version = createAssetVersion(asset, {
    versionId: "version-prompt-product-review-1",
    versionNumber: 1,
    changeReason: "迁移现有提示词",
    createdAt: "2026-09-21T00:00:00.000Z",
  });

  assert.equal(version.assetId, samplePrompt.id);
  assert.equal(version.assetType, "prompt");
  assert.equal(version.versionNumber, 1);
  assert.equal(version.changeReason, "迁移现有提示词");
  assert.equal(version.versionReason, "save");
  assert.deepEqual(version.sourceAssetIds, []);
  assert.equal(version.restoredAt, null);
  assert.equal(version.expiresAt, null);
  assert.equal(isAssetVersionData(version), true);
});

test("统一资产校验支持规则和文档基础类型", () => {
  const commonAsset = {
    id: "asset-1",
    projectId: "default-project",
    title: "规则标题",
    summary: "规则摘要",
    content: "规则正文",
    status: "active",
    source: {
      sourceType: "manual",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: "version-asset-1",
    createdAt: "2026-09-21T00:00:00.000Z",
    updatedAt: "2026-09-21T00:00:00.000Z",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
  };

  assert.equal(
    isAssetData({
      ...commonAsset,
      assetType: "rule",
      metadata: { ruleType: "must", scope: "project" },
    }),
    true,
  );

  assert.equal(
    isAssetData({
      ...commonAsset,
      assetType: "document",
      metadata: { documentType: "prd" },
    }),
    true,
  );
});

test("统一资产会拒绝未知类型和缺少必需元数据的资产", () => {
  const baseAsset = {
    id: "asset-1",
    projectId: "default-project",
    title: "资产",
    summary: "",
    content: "正文",
    status: "active",
    source: {
      sourceType: "manual",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: "version-asset-1",
    createdAt: "2026-09-21T00:00:00.000Z",
    updatedAt: "2026-09-21T00:00:00.000Z",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
  };

  assert.equal(
    isAssetData({ ...baseAsset, assetType: "unknown", metadata: {} }),
    false,
  );
  assert.equal(
    isAssetData({ ...baseAsset, assetType: "prompt", metadata: {} }),
    false,
  );
});
