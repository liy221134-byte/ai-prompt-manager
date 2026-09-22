import assert from "node:assert/strict";
import test from "node:test";

import {
  createAssetVersion,
  isAssetData,
  normalizeDocumentMetadata,
  normalizeRuleMetadata,
} from "../src/data/assets.ts";

function createRule(metadata) {
  return {
    id: "rule-a",
    projectId: "default-project",
    assetType: "rule",
    title: "提交规范",
    summary: "提交前必须跑检查",
    content: "提交前必须通过完整检查。",
    metadata,
    source: {
      sourceType: "manual",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: "current-rule-a",
    status: "active",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: "2026-09-22T10:00:00.000Z",
    updatedAt: "2026-09-22T10:00:00.000Z",
  };
}

test("只有核心字段的旧规则元数据仍然合法", () => {
  assert.equal(isAssetData(createRule({ ruleType: "must", scope: "project" })), true);
});

test("扩展字段缺省时补成空值，界面不用自己兜底", () => {
  const form = normalizeRuleMetadata({ ruleType: "must", scope: "global" });

  assert.equal(form.ruleType, "must");
  assert.equal(form.scope, "global");
  assert.equal(form.purpose, "");
  assert.equal(form.level, "");
  assert.deepEqual(form.techContext, []);
  assert.equal(form.stage, "");
  assert.equal(form.priority, "");
  assert.equal(form.lifecycle, "");
  assert.equal(form.overrideScope, "");
  assert.equal(form.evidence, "");
  assert.equal(form.verification, "");
});

test("扩展字段认不出来的值按空值处理，不报错", () => {
  const form = normalizeRuleMetadata({
    ruleType: "must",
    scope: "project",
    level: "某个不存在的层级",
    stage: 42,
    priority: "urgent",
    lifecycle: "active",
    techContext: "不是数组",
    purpose: "提交前用",
  });

  assert.equal(form.level, "");
  assert.equal(form.stage, "");
  assert.equal(form.priority, "");
  assert.equal(form.lifecycle, "active");
  assert.deepEqual(form.techContext, []);
  assert.equal(form.purpose, "提交前用");
});

test("文档元数据能区分来源、工作稿、权威版和编译结果", () => {
  const form = normalizeDocumentMetadata({
    documentType: "PRD",
    role: "authoritative",
    authority: true,
    module: "资产库",
    effectiveVersion: "2.1.1",
    sourceLocation: "docs/product-brief.md",
    updateTrigger: "需求变更",
    freshness: "30 天",
    lastVerifiedAt: "2026-09-22",
  });

  assert.equal(form.role, "authoritative");
  assert.equal(form.authority, true);
  assert.equal(form.module, "资产库");
  assert.equal(form.effectiveVersion, "2.1.1");
  assert.equal(form.lastVerifiedAt, "2026-09-22");

  const legacy = normalizeDocumentMetadata({ documentType: "ADR" });
  assert.equal(legacy.role, "");
  assert.equal(legacy.authority, false);
  assert.equal(legacy.module, "");
});

test("扩展字段给了非法值时视为数据不合法", () => {
  const badLevel = createRule({ ruleType: "must", scope: "project", level: "不存在" });
  assert.equal(isAssetData(badLevel), false);

  const badTechContext = createRule({
    ruleType: "must",
    scope: "project",
    techContext: [1, 2],
  });
  assert.equal(isAssetData(badTechContext), false);
});

test("元数据会完整带进版本记录，改元数据等于产生新版本", () => {
  const asset = createRule({
    ruleType: "must",
    scope: "project",
    purpose: "提交前用",
    priority: "must",
  });

  const first = createAssetVersion(asset, {
    versionId: "current-rule-a",
    versionNumber: 1,
    changeReason: "创建资产",
    createdAt: "2026-09-22T10:00:00.000Z",
  });
  const second = createAssetVersion(
    { ...asset, metadata: { ...asset.metadata, priority: "should" } },
    {
      versionId: "version-2",
      versionNumber: 2,
      changeReason: "修改元数据",
      createdAt: "2026-09-22T11:00:00.000Z",
    },
  );

  assert.equal(first.metadata.priority, "must");
  assert.equal(second.metadata.priority, "should");
  assert.equal(first.versionNumber, 1);
  assert.equal(second.versionNumber, 2);
});
