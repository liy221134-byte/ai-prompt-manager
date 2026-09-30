import assert from "node:assert/strict";
import test from "node:test";

import {
  checkExternalSourcesCompliance,
  evaluateAssetCompliance,
  isExternalSourceAsset,
  planAutoActiveDowngrade,
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

test("批量降级只挑「active 且没有确认记录」的外部规则", () => {
  const targets = planAutoActiveDowngrade([
    // 要降的：外部规则、active、没有确认记录
    ruleAsset({}, "active"),
    // 不该动：已经有确认记录
    ruleAsset(
      {
        confirmation: {
          confirmedBy: "产品负责人",
          confirmedAt: "2026-09-30",
          basis: "本项目实际用过一轮",
        },
      },
      "active",
    ),
    // 不该动：本来就是待确认
    ruleAsset({}, "pending"),
    // 不该动：文档类没有 active 语义
    documentAsset(),
    // 不该动：进了垃圾箱
    { ...ruleAsset({}, "active"), deletedAt: "2026-09-30T00:00:00.000Z" },
    // 不该动：不是外部来源（没有 hypothesis 标记）
    {
      ...ruleAsset({ confidence: "verified" }, "active"),
      metadata: { ruleType: "must", confidence: "verified" },
    },
  ]);

  assert.equal(targets.length, 1);
  assert.equal(targets[0].status, "active");
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

test("外部规则处于 active 但没有确认记录就违规", () => {
  const violations = evaluateAssetCompliance(ruleAsset({}, "active"));
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "no_auto_active");
});

test("外部规则升到 active 且写了确认记录（谁、何时、凭什么）就算合规", () => {
  // M2 判据演进：不再要求 confidence 先变成 verified——
  // provisional 的语义本就是「人工确认过、还没实战验证」，它就该允许 active。
  const violations = evaluateAssetCompliance(
    ruleAsset(
      {
        confidence: "provisional",
        confirmation: {
          confirmedBy: "本机使用者",
          confirmedAt: "2026-09-29T10:00:00.000Z",
          basis: "看过来源原文，与已采心法不重复",
        },
      },
      "active",
    ),
  );
  assert.deepEqual(violations, []);
});

test("确认记录不完整（缺时间）不算数，仍然违规", () => {
  const violations = evaluateAssetCompliance(
    ruleAsset(
      { confirmation: { confirmedBy: "本机使用者", confirmedAt: "", basis: "看着行" } },
      "active",
    ),
  );
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "no_auto_active");
});

test("文档资产的 active 不受第四约束管（文档没有发布语义）", () => {
  // M0 那 9 个已入库文档就是 active 且没有确认记录，不该被扫成违规
  assert.deepEqual(evaluateAssetCompliance(documentAsset()), []);
  assert.deepEqual(
    evaluateAssetCompliance(
      documentAsset({ documentType: "采集记录", authority: false }),
    ),
    [],
  );
});

test("合规的外部规则：候选状态 + 假设可信度 + 有来源", () => {
  assert.deepEqual(evaluateAssetCompliance(ruleAsset()), []);
});

test("provisional 是合法可信度，不该被当成违规（M1 判据的漏洞）", () => {
  assert.deepEqual(
    evaluateAssetCompliance(ruleAsset({ confidence: "provisional" })),
    [],
  );
  assert.deepEqual(
    evaluateAssetCompliance(ruleAsset({ confidence: "verified" })),
    [],
  );

  const violations = evaluateAssetCompliance(ruleAsset({ confidence: "" }));
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "hypothesis");
});

test("外部规则缺来源摘录就违规", () => {
  const violations = evaluateAssetCompliance(ruleAsset({ rationale: "", sourceExcerpt: "" }));
  assert.equal(violations.length, 1);
  assert.equal(violations[0].rule, "source");
});

test("规则包成员与本产品的编译产物不算外部来源（authority:false 是文档默认值）", () => {
  // 主库真实案例（2026-09-30 的三处误报）：前两条从规则包导入、第三条是编译产物，
  // 三条都不是采来的，却因为文档默认 authority:false 被判成外部来源、要求填来源位置。
  const packProfile = {
    id: "document-profile-personal-001-3",
    title: "个人工具",
    assetType: "document",
    status: "active",
    metadata: {
      documentType: "项目画像",
      authority: false,
      sourceLocation: "",
      pack: {
        packId: "rule-pack-engineering-foundations",
        packItemId: "PROFILE-PERSONAL-001",
        packVersion: "0.2.1",
      },
    },
  };
  const packValidation = {
    id: "document-validation-01-personal-tool-3",
    title: "个人工具编译验证",
    assetType: "document",
    status: "active",
    metadata: {
      documentType: "编译验证记录",
      authority: false,
      sourceLocation: "",
      pack: {
        packId: "rule-pack-public-library",
        packItemId: "validation-01-personal-tool",
        packVersion: "0.1.0",
      },
    },
  };
  const compiled = {
    id: "document-71cddf08-e265-4891-992a-90c93864634b",
    title: "START_PROMPT.md",
    assetType: "document",
    status: "active",
    metadata: {
      documentType: "START_PROMPT.md",
      role: "compiled",
      authority: false,
      sourceLocation: "",
    },
  };

  assert.equal(isExternalSourceAsset(packProfile), false);
  assert.equal(isExternalSourceAsset(packValidation), false);
  assert.equal(isExternalSourceAsset(compiled), false);

  // 真正的外部来源文档（role: source）不受影响，照样要检查
  assert.equal(isExternalSourceAsset(documentAsset()), true);
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
