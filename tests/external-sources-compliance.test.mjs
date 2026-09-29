import assert from "node:assert/strict";
import test from "node:test";

import {
  checkExternalSourcesCompliance,
  evaluateAssetCompliance,
  isExternalSourceAsset,
} from "../src/lib/external-sources-compliance.ts";

function documentAsset(metadataOverrides = {}) {
  return {
    id: "document-team-method-okr-md",
    title: "OKR：目标与关键结果",
    assetType: "document",
    status: "active",
    metadata: {
      documentType: "团队方法",
      role: "source",
      authority: false,
      sourceLocation: "docs/team-methods/okr.md",
      ...metadataOverrides,
    },
  };
}

function ruleAsset(metadataOverrides = {}, status = "pending") {
  return {
    id: "rule-demo-001",
    title: "某条外部采集规则",
    assetType: "rule",
    status,
    metadata: {
      ruleType: "process",
      scope: "global",
      confidence: "hypothesis",
      rationale: "从外部来源提炼",
      ...metadataOverrides,
    },
  };
}

test("合规的外部文档资产：不报任何违规", () => {
  assert.deepEqual(evaluateAssetCompliance(documentAsset()), []);
});

test("参考文档（未标 role，但 authority:false + 有来源）也算合规", () => {
  // M0 导入时 docs/reference 没标 role:"source"，但同样用 authority:false 表达未采信
  const asset = documentAsset({
    role: undefined,
    documentType: "参考资料",
    sourceLocation: "docs/reference/prioritization-frameworks.md",
  });
  assert.deepEqual(evaluateAssetCompliance(asset), []);
});

test("外部文档一旦被采信（authority 非 false）就违规", () => {
  const violations = evaluateAssetCompliance(documentAsset({ authority: true }));
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "candidate");
});

test("外部文档缺来源位置就违规", () => {
  const violations = evaluateAssetCompliance(documentAsset({ sourceLocation: "" }));
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "source");
});

test("假设级外部规则不得处于 active", () => {
  const violations = evaluateAssetCompliance(ruleAsset({}, "active"));
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "no_auto_active");
});

test("合规的外部规则：候选状态 + 假设可信度 + 有来源", () => {
  assert.deepEqual(evaluateAssetCompliance(ruleAsset()), []);
});

test("外部规则缺来源摘录就违规", () => {
  const violations = evaluateAssetCompliance(ruleAsset({ rationale: "", sourceExcerpt: "" }));
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "source");
});

test("只扫外部来源资产，普通提示词不计入", () => {
  const promptAsset = {
    id: "prompt-code-review",
    title: "代码审查顾问",
    assetType: "prompt",
    status: "active",
    metadata: { category: "工程", tags: [], useCase: "", mergedIntoAssetId: null, mergeVersionId: null },
  };

  assert.equal(isExternalSourceAsset(promptAsset), false);
  assert.equal(isExternalSourceAsset(documentAsset()), true);

  const report = checkExternalSourcesCompliance([
    promptAsset,
    documentAsset(),
    ruleAsset(),
  ]);
  assert.equal(report.checkedCount, 2);
  assert.deepEqual(report.violations, []);
});
