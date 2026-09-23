import assert from "node:assert/strict";
import test from "node:test";

import {
  createAssetVersion,
  isAssetData,
  normalizeDocumentMetadata,
  normalizeRulePackMetadata,
  normalizeRuleMetadata,
  normalizeTemplateMetadata,
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

test("规则能带上理由、来源片段、可信度和编译去向", () => {
  const rule = createRule({
    ruleType: "must",
    scope: "project",
    rationale: "上一版因为漏了检查出过事故",
    sourceExcerpt: "提交前必须跑完整检查。",
    confidence: "provisional",
    compileTarget: ["agents", "none"],
  });

  assert.equal(isAssetData(rule), true);

  const form = normalizeRuleMetadata(rule.metadata);
  assert.equal(form.rationale, "上一版因为漏了检查出过事故");
  assert.equal(form.sourceExcerpt, "提交前必须跑完整检查。");
  assert.equal(form.confidence, "provisional");
  assert.deepEqual(form.compileTarget, ["agents", "none"]);
});

test("认不出来的可信度和编译去向按空值处理", () => {
  const form = normalizeRuleMetadata({
    ruleType: "must",
    scope: "project",
    confidence: "很有把握",
    compileTarget: ["agents", "某个不存在的去向"],
  });

  assert.equal(form.confidence, "");
  assert.deepEqual(form.compileTarget, ["agents"]);
});

test("规则包元数据校验包版本、可信度和适用规模", () => {
  const pack = {
    ...createRule({}),
    id: "rule-pack-a",
    assetType: "rule_pack",
    metadata: {
      packVersion: "0.2.1",
      packConfidence: "verified",
      projectScale: ["personal", "medium"],
      sourceNote: "来自工程方法种子资产包",
    },
  };

  assert.equal(isAssetData(pack), true);

  const form = normalizeRulePackMetadata(pack.metadata);
  assert.equal(form.packVersion, "0.2.1");
  assert.equal(form.packConfidence, "verified");
  assert.deepEqual(form.projectScale, ["personal", "medium"]);
  assert.equal(form.sourceNote, "来自工程方法种子资产包");
});

test("规则包缺关键字段或字段乱填时不通过校验", () => {
  const missing = {
    ...createRule({}),
    id: "rule-pack-b",
    assetType: "rule_pack",
    metadata: { packVersion: "1.0.0" },
  };

  assert.equal(isAssetData(missing), false);

  const weird = {
    ...createRule({}),
    id: "rule-pack-c",
    assetType: "rule_pack",
    metadata: {
      packVersion: "1.0.0",
      packConfidence: "很有把握",
      projectScale: ["personal"],
      sourceNote: "",
    },
  };

  assert.equal(isAssetData(weird), false);

  const legacyForm = normalizeRulePackMetadata(undefined);
  assert.equal(legacyForm.packVersion, "");
  assert.equal(legacyForm.packConfidence, "provisional");
  assert.deepEqual(legacyForm.projectScale, []);
});

test("模板元数据记产物文件名和备注，缺字段按空值读", () => {
  const template = {
    ...createRule({}),
    id: "template-agents",
    assetType: "template",
    metadata: {
      outputFileName: "AGENTS.md",
      note: "新项目开工用",
    },
  };

  assert.equal(isAssetData(template), true);

  const form = normalizeTemplateMetadata(template.metadata);
  assert.equal(form.outputFileName, "AGENTS.md");
  assert.equal(form.note, "新项目开工用");

  const legacy = normalizeTemplateMetadata(undefined);
  assert.equal(legacy.outputFileName, "");
  assert.equal(legacy.note, "");

  const broken = {
    ...template,
    metadata: { outputFileName: 42, note: "" },
  };
  assert.equal(isAssetData(broken), false);
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
