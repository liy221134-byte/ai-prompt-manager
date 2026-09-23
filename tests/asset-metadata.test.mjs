import assert from "node:assert/strict";
import test from "node:test";

import {
  createAssetVersion,
  isAssetData,
  normalizeDocumentMetadata,
  normalizeEvidenceMetadata,
  normalizeReleaseRecordMetadata,
  normalizeRulePackMetadata,
  normalizeRuleMetadata,
  normalizeTemplateMetadata,
} from "../src/data/assets.ts";

function createEvidence(metadata) {
  return {
    id: "evidence-a",
    projectId: "project-1",
    assetType: "evidence",
    title: "REQ-001 验收记录",
    summary: "",
    content: "验收条件：……",
    metadata,
    source: {
      sourceType: "manual",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: "current-evidence-a",
    status: "active",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: "2026-09-23T00:00:00.000Z",
    updatedAt: "2026-09-23T00:00:00.000Z",
  };
}

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

test("验收记录元数据：合法的认识，结论和证据非法值会被拒", () => {
  assert.equal(
    isAssetData(
      createEvidence({
        nodeId: "node-1",
        conclusion: "pending",
        commitRef: "v2.9.0",
        evidenceItems: [
          { label: "跑了一遍导入", reference: "https://example.com/run" },
        ],
      }),
    ),
    true,
  );

  // 结论必须是四个枚举值之一
  assert.equal(
    isAssetData(
      createEvidence({
        nodeId: "node-1",
        conclusion: "看起来没问题",
        commitRef: "",
        evidenceItems: [],
      }),
    ),
    false,
  );

  // 证据必须是「说明 + 链接」两个字符串，不能塞别的形状
  assert.equal(
    isAssetData(
      createEvidence({
        nodeId: "node-1",
        conclusion: "passed",
        commitRef: "",
        evidenceItems: ["跑了一遍"],
      }),
    ),
    false,
  );

  // 还没挂需求时 nodeId 可以是空
  assert.equal(
    isAssetData(
      createEvidence({
        nodeId: null,
        conclusion: "pending",
        commitRef: "",
        evidenceItems: [],
      }),
    ),
    true,
  );
});

test("验收记录缺字段时按空值补齐，结论回落成待确认", () => {
  assert.deepEqual(normalizeEvidenceMetadata(undefined), {
    nodeId: "",
    conclusion: "pending",
    commitRef: "",
    evidenceItems: [],
  });
  assert.deepEqual(
    normalizeEvidenceMetadata({
      conclusion: "乱写的",
      evidenceItems: [{ label: "只有说明", reference: "" }],
    }),
    {
      nodeId: "",
      conclusion: "pending",
      commitRef: "",
      evidenceItems: [{ label: "只有说明", reference: "" }],
    },
  );
});

test("发布记录元数据：版本、结果和门禁项都要合法", () => {
  const base = {
    id: "release-a",
    projectId: "project-1",
    assetType: "release_record",
    title: "v2.10.0 发布记录",
    summary: "",
    content: "这次改了……",
    source: {
      sourceType: "manual",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: "current-release-a",
    status: "active",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: "2026-09-23T00:00:00.000Z",
    updatedAt: "2026-09-23T00:00:00.000Z",
  };

  assert.equal(
    isAssetData({
      ...base,
      metadata: {
        version: "v2.10.0",
        releasedAt: "2026-09-23",
        result: "released",
        rollbackTarget: "v2.9.0",
        gates: [
          { key: "gate-1", label: "工程检查通过", done: true, note: "跑了 check" },
        ],
      },
    }),
    true,
  );

  // 结果必须是三个枚举值之一
  assert.equal(
    isAssetData({
      ...base,
      metadata: {
        version: "v2.10.0",
        releasedAt: "",
        result: "成功了",
        rollbackTarget: "",
        gates: [],
      },
    }),
    false,
  );

  // 门禁项缺字段或不是对象都不行
  assert.equal(
    isAssetData({
      ...base,
      metadata: {
        version: "v2.10.0",
        releasedAt: "",
        result: "in_progress",
        rollbackTarget: "",
        gates: ["工程检查通过"],
      },
    }),
    false,
  );

  // 缺字段时按空值补齐，结果回落成进行中
  assert.deepEqual(normalizeReleaseRecordMetadata(undefined), {
    version: "",
    releasedAt: "",
    result: "in_progress",
    rollbackTarget: "",
    gates: [],
  });
  assert.equal(
    normalizeReleaseRecordMetadata({ result: "乱写的", gates: [] }).result,
    "in_progress",
  );
});
