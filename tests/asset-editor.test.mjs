import assert from "node:assert/strict";
import test from "node:test";

import {
  createInitialAssetVersionId,
  isAssetData,
  isAssetVersionData,
  assetVersionReasons,
} from "../src/data/assets.ts";
import {
  assetToDraft,
  buildCreateAssetInput,
  buildUpdateAssetInput,
  createEmptyAssetDraft,
  isEditableAssetData,
  validateAssetDraft,
} from "../src/lib/asset-draft.ts";
import {
  assetStatusLabels,
  describeAssetSummary,
  filterProjectAssets,
  matchesAssetStatusFilter,
  ruleScopeLabels,
  ruleTypeLabels,
} from "../src/lib/asset-list.ts";
import {
  assetVersionReasonLabels,
  buildRestoreAssetInput,
  canRestoreAssetVersion,
  createAssetVersionId,
  isCurrentAssetVersion,
  sortAssetVersionsNewestFirst,
} from "../src/lib/asset-versions.ts";

function createRuleAsset(overrides = {}) {
  return {
    id: "rule-1",
    projectId: "project-1",
    assetType: "rule",
    title: "提交前必须通过检查",
    summary: "提交代码前必须跑完整检查。",
    content: "运行 npm run check",
    metadata: { ruleType: "must", scope: "project" },
    source: {
      sourceType: "manual",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: "version-3",
    status: "active",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: "2026-09-21T00:00:00.000Z",
    updatedAt: "2026-09-21T02:00:00.000Z",
    ...overrides,
  };
}

function createVersion(overrides = {}) {
  return {
    versionId: "version-2",
    assetId: "rule-1",
    assetType: "rule",
    versionNumber: 2,
    title: "提交前必须通过检查",
    summary: "旧摘要",
    content: "旧正文",
    metadata: { ruleType: "must", scope: "project" },
    changeReason: "保存",
    versionReason: "save",
    sourceAssetIds: [],
    restoredAt: null,
    expiresAt: null,
    createdAt: "2026-09-21T01:00:00.000Z",
    ...overrides,
  };
}

test("规则草稿带默认规则类型、适用范围和活跃状态", () => {
  const draft = createEmptyAssetDraft("rule");

  assert.equal(draft.assetType, "rule");
  assert.equal(draft.title, "");
  assert.equal(draft.status, "active");
  assert.equal(draft.ruleType, "must");
  assert.equal(draft.scope, "project");
});

test("文档草稿带默认文档类型和活跃状态", () => {
  const draft = createEmptyAssetDraft("document");

  assert.equal(draft.assetType, "document");
  assert.equal(draft.status, "active");
  assert.equal(draft.documentType, "PRD");
});

test("草稿校验拦截空标题、超长标题和空正文", () => {
  const draft = createEmptyAssetDraft("rule");

  assert.match(validateAssetDraft(draft) ?? "", /标题/);
  assert.match(
    validateAssetDraft({ ...draft, title: "标".repeat(61) }) ?? "",
    /60/,
  );
  assert.match(
    validateAssetDraft({ ...draft, title: "标题" }) ?? "",
    /规则正文/,
  );
  assert.equal(
    validateAssetDraft({ ...draft, title: "标题", content: "正文" }),
    null,
  );
});

test("文档草稿校验要求文档类型", () => {
  const draft = createEmptyAssetDraft("document");

  assert.match(
    validateAssetDraft({
      ...draft,
      title: "标题",
      content: "正文",
      documentType: "  ",
    }) ?? "",
    /文档类型/,
  );
});

test("已有资产可以还原成草稿再保存，字段保持一致", () => {
  const asset = createRuleAsset();
  const draft = assetToDraft(asset);

  assert.equal(draft.assetType, "rule");
  assert.equal(draft.title, asset.title);
  assert.equal(draft.content, asset.content);
  assert.equal(draft.summary, asset.summary);
  assert.equal(draft.status, "active");
  assert.equal(draft.ruleType, "must");
  assert.equal(draft.scope, "project");

  const input = buildUpdateAssetInput(asset, draft, {
    versionId: "version-4",
    now: "2026-09-21T03:00:00.000Z",
  });

  assert.equal(input.asset.id, asset.id);
  assert.equal(input.asset.createdAt, asset.createdAt);
  assert.equal(input.asset.updatedAt, "2026-09-21T03:00:00.000Z");
  assert.equal(input.asset.currentVersionId, "version-4");
  assert.equal(input.versionId, "version-4");
  assert.equal(input.versionReason, "save");
  assert.equal(isAssetData(input.asset), true);
});

test("规则的理由和来源片段能放进草稿再存回元数据", () => {
  const asset = createRuleAsset();
  const draft = assetToDraft(asset);

  const input = buildUpdateAssetInput(
    asset,
    {
      ...draft,
      rationale: "上一版漏了检查出过事故",
      sourceExcerpt: "提交前必须跑完整检查。",
    },
    { versionId: "version-5", now: "2026-09-23T03:00:00.000Z" },
  );

  assert.equal(input.asset.metadata.rationale, "上一版漏了检查出过事故");
  assert.equal(input.asset.metadata.sourceExcerpt, "提交前必须跑完整检查。");
  assert.equal(isAssetData(input.asset), true);

  const backToDraft = assetToDraft(input.asset);
  assert.equal(backToDraft.rationale, "上一版漏了检查出过事故");
  assert.equal(backToDraft.sourceExcerpt, "提交前必须跑完整检查。");
});

test("理由和来源片段留空时不写进元数据", () => {
  const asset = createRuleAsset();
  const input = buildUpdateAssetInput(
    asset,
    { ...assetToDraft(asset), rationale: "   ", sourceExcerpt: "" },
    { versionId: "version-6", now: "2026-09-23T04:00:00.000Z" },
  );

  assert.equal("rationale" in input.asset.metadata, false);
  assert.equal("sourceExcerpt" in input.asset.metadata, false);
});

test("规则、文档和技术档案都能进编辑器，提示词和规则包不能", () => {
  const rule = createRuleAsset();
  const techProfile = {
    ...rule,
    id: "tech-profile-1",
    assetType: "tech_profile",
    metadata: { stack: [] },
  };
  const prompt = { ...rule, id: "prompt-1", assetType: "prompt" };
  const pack = {
    ...rule,
    id: "rule-pack-1",
    assetType: "rule_pack",
    metadata: {
      packVersion: "0.2.1",
      packConfidence: "provisional",
      projectScale: ["personal"],
      sourceNote: "",
    },
  };

  assert.equal(isEditableAssetData(rule), true);
  assert.equal(isEditableAssetData(techProfile), true);
  assert.equal(isEditableAssetData(prompt), false);
  assert.equal(isEditableAssetData(pack), false);
});

test("编辑器改不到的元数据在保存时不会丢", () => {
  const asset = {
    ...createRuleAsset(),
    metadata: {
      ...createRuleAsset().metadata,
      confidence: "provisional",
      compileTarget: ["agents"],
      compileDecision: {
        decision: "excluded",
        note: "和另一条冲突",
        decidedAt: "2026-09-23T00:00:00.000Z",
      },
      pack: {
        packId: "rule-pack-engineering-foundations",
        packItemId: "RULE-BOUNDARY-001",
        packVersion: "0.2.1",
        packAssetType: "rule",
        projectScale: ["personal"],
      },
    },
  };
  const input = buildUpdateAssetInput(asset, assetToDraft(asset), {
    versionId: "version-7",
    now: "2026-09-23T05:00:00.000Z",
  });

  assert.equal(input.asset.metadata.confidence, "provisional");
  assert.deepEqual(input.asset.metadata.compileTarget, ["agents"]);
  assert.equal(input.asset.metadata.compileDecision.decision, "excluded");
  assert.equal(
    input.asset.metadata.pack.packItemId,
    "RULE-BOUNDARY-001",
  );
  assert.equal(isAssetData(input.asset), true);
});

test("文档的所属包链接也不会被编辑覆盖", () => {
  const asset = {
    ...createRuleAsset(),
    id: "document-pack-member",
    assetType: "document",
    metadata: {
      documentType: "模板",
      pack: {
        packId: "rule-pack-engineering-foundations",
        packItemId: "TPL-ACCEPT-001",
        packVersion: "0.2.1",
        packAssetType: "template",
        projectScale: ["personal"],
      },
    },
  };
  const input = buildUpdateAssetInput(asset, assetToDraft(asset), {
    versionId: "version-8",
    now: "2026-09-23T05:00:00.000Z",
  });

  assert.equal(input.asset.metadata.pack.packItemId, "TPL-ACCEPT-001");
  assert.equal(input.asset.metadata.documentType, "模板");
});

test("新建规则会生成合法的资产和初始版本标识", () => {
  const input = buildCreateAssetInput({
    id: "rule-alpha",
    projectId: "project-1",
    draft: {
      ...createEmptyAssetDraft("rule"),
      title: "提交前必须通过检查",
      summary: "提交前跑检查",
      content: "运行 npm run check",
      ruleType: "forbidden",
      scope: "global",
    },
    now: "2026-09-21T03:00:00.000Z",
  });

  assert.equal(input.asset.assetType, "rule");
  assert.equal(input.asset.projectId, "project-1");
  assert.equal(input.asset.status, "active");
  assert.equal(input.asset.archivedAt, null);
  assert.equal(input.asset.createdAt, "2026-09-21T03:00:00.000Z");
  assert.equal(input.asset.currentVersionId, createInitialAssetVersionId("rule-alpha"));
  assert.equal(input.versionId, createInitialAssetVersionId("rule-alpha"));
  assert.equal(input.versionReason, "initial");
  // 扩展元数据留空时只有字符串字段和数组会写出去，空枚举不写
  assert.deepEqual(input.asset.metadata, {
    ruleType: "forbidden",
    scope: "global",
    purpose: "",
    techContext: [],
    evidence: "",
    verification: "",
  });
  assert.equal(isAssetData(input.asset), true);
});

test("新建文档会写入文档类型元数据", () => {
  const input = buildCreateAssetInput({
    id: "document-alpha",
    projectId: "project-1",
    draft: {
      ...createEmptyAssetDraft("document"),
      title: "数据库说明",
      content: "# 表结构",
      documentType: "数据库说明",
    },
    now: "2026-09-21T03:00:00.000Z",
  });

  assert.equal(input.asset.assetType, "document");
  assert.deepEqual(input.asset.metadata, {
    documentType: "数据库说明",
    authority: false,
    module: "",
    effectiveVersion: "",
    sourceLocation: "",
    updateTrigger: "",
    freshness: "",
    lastVerifiedAt: "",
  });
  assert.equal(isAssetData(input.asset), true);
});

test("归档状态会记录归档时间，切回活跃会清空", () => {
  const asset = createRuleAsset();
  const archived = buildUpdateAssetInput(
    asset,
    { ...assetToDraft(asset), status: "archived" },
    { versionId: "version-4", now: "2026-09-21T03:00:00.000Z" },
  );

  assert.equal(archived.asset.status, "archived");
  assert.equal(archived.asset.archivedAt, "2026-09-21T03:00:00.000Z");

  const reactivated = buildUpdateAssetInput(
    archived.asset,
    { ...assetToDraft(asset), status: "active" },
    { versionId: "version-5", now: "2026-09-21T04:00:00.000Z" },
  );

  assert.equal(reactivated.asset.status, "active");
  assert.equal(reactivated.asset.archivedAt, null);
});

test("版本标识使用独立前缀且可重复生成", () => {
  const first = createAssetVersionId();
  const second = createAssetVersionId();

  assert.match(first, /^version-/);
  assert.notEqual(first, second);
});

test("版本列表按版本号从新到旧排列", () => {
  const versions = [
    createVersion({ versionId: "version-1", versionNumber: 1 }),
    createVersion({ versionId: "version-3", versionNumber: 3 }),
    createVersion({ versionId: "version-2", versionNumber: 2 }),
  ];

  assert.deepEqual(
    sortAssetVersionsNewestFirst(versions).map((version) => version.versionId),
    ["version-3", "version-2", "version-1"],
  );
  // 原数组不被修改，避免影响调用方的状态。
  assert.equal(versions[0].versionId, "version-1");
});

test("当前版本不能被恢复，历史版本可以", () => {
  const asset = createRuleAsset();
  const currentVersion = createVersion({ versionId: "version-3" });
  const oldVersion = createVersion({ versionId: "version-2" });

  assert.equal(isCurrentAssetVersion(asset, currentVersion), true);
  assert.equal(canRestoreAssetVersion(asset, currentVersion), false);
  assert.equal(canRestoreAssetVersion(asset, oldVersion), true);
  assert.equal(
    canRestoreAssetVersion(asset, createVersion({ assetId: "rule-2" })),
    false,
  );
});

test("恢复历史版本会生成新版本并保留当前状态", () => {
  const asset = createRuleAsset({
    status: "deprecated",
    archivedAt: null,
  });
  const version = createVersion({
    title: "旧标题",
    summary: "旧摘要",
    content: "旧正文",
  });
  const input = buildRestoreAssetInput(asset, version, {
    versionId: "version-9",
    now: "2026-09-21T05:00:00.000Z",
  });

  assert.equal(input.versionId, "version-9");
  assert.equal(input.versionReason, "restore");
  assert.equal(input.changeReason, "恢复到第 2 版");
  assert.equal(input.asset.currentVersionId, "version-9");
  assert.equal(input.asset.title, "旧标题");
  assert.equal(input.asset.summary, "旧摘要");
  assert.equal(input.asset.content, "旧正文");
  assert.equal(input.asset.status, "deprecated");
  assert.equal(input.asset.createdAt, asset.createdAt);
  assert.equal(input.asset.updatedAt, "2026-09-21T05:00:00.000Z");
  assert.equal(isAssetData(input.asset), true);
});

test("资产版本原因包含恢复，并且都有中文说明", () => {
  assert.equal(assetVersionReasons.includes("restore"), true);

  for (const reason of assetVersionReasons) {
    assert.equal(
      typeof assetVersionReasonLabels[reason],
      "string",
      `缺少版本原因说明：${reason}`,
    );
  }

  assert.equal(assetVersionReasonLabels.restore, "恢复");
  assert.equal(isAssetVersionData(createVersion({ versionReason: "restore" })), true);
});

test("状态筛选默认只看活跃资产，其他状态可以单独查看", () => {
  const assets = [
    createRuleAsset(),
    createRuleAsset({ id: "rule-2", status: "draft" }),
    createRuleAsset({
      id: "rule-3",
      status: "archived",
      archivedAt: "2026-09-21T02:00:00.000Z",
    }),
    createRuleAsset({
      id: "rule-4",
      deletedAt: "2026-09-21T02:00:00.000Z",
      deletedReason: "manual",
    }),
  ];

  assert.deepEqual(
    filterProjectAssets(assets, { projectId: "project-1" }).map(
      (asset) => asset.id,
    ),
    ["rule-1"],
  );
  assert.deepEqual(
    filterProjectAssets(assets, {
      projectId: "project-1",
      status: "archived",
    }).map((asset) => asset.id),
    ["rule-3"],
  );
  assert.equal(matchesAssetStatusFilter(createRuleAsset(), "active"), true);
  assert.equal(matchesAssetStatusFilter(createRuleAsset(), "draft"), false);
  assert.equal(assetStatusLabels.deprecated, "已废弃");
});

test("规则和文档字段都有中文说明", () => {
  assert.equal(ruleTypeLabels.forbidden, "禁止");
  assert.equal(ruleScopeLabels.task, "任务临时");
});

test("摘要为空时用正文首行代替", () => {
  assert.equal(
    describeAssetSummary(createRuleAsset({ summary: "已有摘要" })),
    "已有摘要",
  );
  assert.equal(
    describeAssetSummary(
      createRuleAsset({ summary: "", content: "\n\n第一行\n第二行" }),
    ),
    "第一行",
  );
});
