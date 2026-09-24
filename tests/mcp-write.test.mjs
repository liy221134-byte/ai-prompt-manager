import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMcpCreateAsset,
  buildMcpStatusChange,
  buildMcpUpdateAsset,
} from "../src/lib/mcp-write.ts";

const now = "2026-09-23T12:00:00.000Z";
const versionId = "version-1";

function createNodeAsset(overrides = {}) {
  const { metadata, ...rest } = overrides;

  return {
    id: "node-1",
    projectId: "project-a",
    assetType: "graph_node",
    title: "需求一：资产入库",
    summary: "",
    content: "需求说明",
    metadata: {
      nodeType: "requirement",
      code: "REQ-001",
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

function createRuleAsset(overrides = {}) {
  const { metadata, ...rest } = overrides;

  return {
    id: "rule-1",
    projectId: "project-a",
    assetType: "rule",
    title: "必须校验输入",
    summary: "安全",
    content: "所有外部输入都要在边界处校验。",
    metadata: {
      ruleType: "must",
      scope: "project",
      level: "module",
      purpose: "安全",
      confidence: "verified",
      pack: {
        packId: "pack-1",
        packItemId: "item-1",
        packVersion: "0.2.1",
        packAssetType: "rule",
        projectScale: ["personal"],
      },
      relations: [
        {
          targetAssetId: "node-1",
          relationType: "reference",
          note: "引用需求一",
        },
      ],
      ...metadata,
    },
    source: {
      sourceType: "import",
      sourceAssetId: null,
      importBatchId: "batch-1",
      originalFilename: "seed.md",
    },
    currentVersionId: "current-rule-1",
    status: "active",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: now,
    updatedAt: now,
    ...rest,
  };
}

test("新建提示词：来源标成 AI，标签和适用场景进元数据", () => {
  const input = buildMcpCreateAsset(
    {
      assetType: "prompt",
      projectId: "project-a",
      title: "接口评审助手",
      content: "帮我评审这个接口设计",
      category: "评审",
      tags: [" 接口 ", ""],
      useCase: "评审接口时用",
    },
    { now, assets: [] },
  );

  assert.equal(input.asset.assetType, "prompt");
  assert.equal(input.asset.metadata.category, "评审");
  assert.deepEqual(input.asset.metadata.tags, ["接口"]);
  assert.equal(input.asset.summary, "评审接口时用");
  assert.equal(input.asset.source.sourceType, "ai");
  assert.equal(input.versionReason, "initial");
  assert.ok(input.asset.id.startsWith("prompt-"));
});

test("新建规则：没写类型和范围时用默认值，正文和标题缺一不可", () => {
  const input = buildMcpCreateAsset(
    {
      assetType: "rule",
      projectId: "project-a",
      title: "禁止硬编码密钥",
      content: "密钥只能从环境变量读。",
    },
    { now, assets: [] },
  );

  assert.equal(input.asset.metadata.ruleType, "must");
  assert.equal(input.asset.metadata.scope, "project");
  assert.equal(input.versionReason, "initial");

  assert.throws(
    () =>
      buildMcpCreateAsset(
        { assetType: "rule", projectId: "project-a", title: " ", content: "正文" },
        { now, assets: [] },
      ),
    /请填写标题/,
  );
  assert.throws(
    () =>
      buildMcpCreateAsset(
        { assetType: "rule", projectId: "project-a", title: "标题", content: " " },
        { now, assets: [] },
      ),
    /请填写规则正文/,
  );
});

test("新建图谱节点：编号重复会被拦下，父节点按编号找", () => {
  const existing = [createNodeAsset()];

  assert.throws(
    () =>
      buildMcpCreateAsset(
        {
          assetType: "graph_node",
          projectId: "project-a",
          title: "重复编号",
          content: "说明",
          nodeType: "requirement",
          code: "req-001",
        },
        { now, assets: existing },
      ),
    /编号「REQ-001」已经被「需求一：资产入库」用了/,
  );

  assert.throws(
    () =>
      buildMcpCreateAsset(
        {
          assetType: "graph_node",
          projectId: "project-a",
          title: "子需求",
          content: "说明",
          nodeType: "requirement",
          code: "REQ-002",
          parentCode: "REQ-999",
        },
        { now, assets: existing },
      ),
    /找不到编号为「REQ-999」的requirement父节点/,
  );

  const input = buildMcpCreateAsset(
    {
      assetType: "graph_node",
      projectId: "project-a",
      title: "子需求",
      content: "说明",
      nodeType: "requirement",
      code: "REQ-002",
      parentCode: "REQ-001",
    },
    { now, assets: existing },
  );

  assert.equal(input.asset.metadata.parentId, "node-1");
  assert.equal(input.asset.metadata.code, "REQ-002");
});

test("改资产：只覆盖传了的字段，包信息和关系都留着", () => {
  const asset = createRuleAsset();
  const input = buildMcpUpdateAsset(
    asset,
    { content: "改成更严格的说法。" },
    { versionId, now, assets: [asset] },
  );

  assert.equal(input.asset.content, "改成更严格的说法。");
  assert.equal(input.asset.title, "必须校验输入");
  assert.equal(input.asset.metadata.pack.packVersion, "0.2.1");
  assert.equal(input.asset.metadata.confidence, "verified");
  assert.deepEqual(input.asset.metadata.relations, [
    {
      targetAssetId: "node-1",
      relationType: "reference",
      note: "引用需求一",
    },
  ]);
  assert.equal(input.asset.currentVersionId, versionId);
  assert.equal(input.versionReason, "save");
});

test("改提示词：正文和适用场景一起改，标题没传就保持原样", () => {
  const asset = {
    ...createNodeAsset(),
    assetType: "prompt",
    title: "代码审查顾问",
    summary: "审查代码时用",
    content: "看类型安全",
    metadata: {
      category: "评审",
      tags: ["代码审查"],
      useCase: "审查代码时用",
      mergedIntoAssetId: null,
      mergeVersionId: null,
    },
  };
  const input = buildMcpUpdateAsset(
    asset,
    { content: "看类型安全和边界条件", useCase: "审查代码和接口时用" },
    { versionId, now, assets: [asset] },
  );

  assert.equal(input.asset.title, "代码审查顾问");
  assert.equal(input.asset.content, "看类型安全和边界条件");
  assert.equal(input.asset.metadata.useCase, "审查代码和接口时用");
  assert.equal(input.asset.summary, "审查代码和接口时用");
  assert.deepEqual(input.asset.metadata.tags, ["代码审查"]);
});

test("改状态：归档写入归档时间，重新激活时清掉", () => {
  const asset = createRuleAsset();
  const archived = buildMcpStatusChange(asset, "archived", {
    versionId,
    now,
    assets: [asset],
  });

  assert.equal(archived.asset.status, "archived");
  assert.equal(archived.asset.archivedAt, now);
  assert.equal(archived.changeReason, "归档资产");

  const reactivated = buildMcpStatusChange(
    { ...archived.asset, currentVersionId: versionId },
    "active",
    { versionId: "version-2", now, assets: [archived.asset] },
  );

  assert.equal(reactivated.asset.status, "active");
  assert.equal(reactivated.asset.archivedAt, null);
  assert.equal(reactivated.changeReason, "重新激活资产");
});

test("技术档案这类不开放的资产类型会被拒绝", () => {
  const asset = createNodeAsset({
    assetType: "tech_profile",
    metadata: { stack: [] },
  });

  assert.throws(
    () =>
      buildMcpUpdateAsset(asset, { content: "改一下" }, {
        versionId,
        now,
        assets: [asset],
      }),
    /还不支持通过 MCP 修改/,
  );
});

test("MCP 写验收记录：写成文档，挂上需求，结论一律先待确认", () => {
  const node = createNodeAsset();
  const input = buildMcpCreateAsset(
    {
      assetType: "document",
      projectId: "project-a",
      title: "REQ-001 验收记录",
      content: "验收条件：入库后能在图谱里看到。\n实际结果：看到了。",
      documentType: "验收记录",
      requirementCode: "req-001",
      commitRef: "v2.9.0",
      evidenceItems: [{ label: "跑了一遍导入", reference: "docs/acceptance" }],
    },
    { now, assets: [node] },
  );

  assert.equal(input.asset.assetType, "document");
  assert.equal(input.asset.metadata.documentType, "验收记录");
  assert.deepEqual(input.asset.metadata.evidence, {
    conclusion: "pending",
    commitRef: "v2.9.0",
  });
  // 覆盖哪条需求用关系记：验收覆盖就是按这条关系算的
  assert.deepEqual(
    input.asset.metadata.relations.map((relation) => [
      relation.targetAssetId,
      relation.relationType,
    ]),
    [["node-1", "reference"]],
  );
  assert.equal(input.asset.source.sourceType, "ai");

  // 不给需求编号也能建：一版一份清单可以先不挂具体需求，之后再挂
  const withoutRequirement = buildMcpCreateAsset(
    {
      assetType: "document",
      projectId: "project-a",
      title: "v2.17.0 验收清单",
      content: "正文",
      documentType: "验收记录",
    },
    { now, assets: [node] },
  );

  assert.deepEqual(withoutRequirement.asset.metadata.relations ?? [], []);

  // 需求编号写错也报错，并提示先查清单
  assert.throws(
    () =>
      buildMcpCreateAsset(
        {
          assetType: "document",
          projectId: "project-a",
          title: "编号写错了",
          content: "正文",
          documentType: "验收记录",
          requirementCode: "REQ-999",
        },
        { now, assets: [node] },
      ),
    /没有编号为「REQ-999」的需求节点/,
  );

  // 发布记录不让 AI 建：门禁是人工可验证证据
  assert.throws(
    () =>
      buildMcpCreateAsset(
        {
          assetType: "document",
          projectId: "project-a",
          title: "v2.17.0 发布记录",
          content: "正文",
          documentType: "发布记录",
        },
        { now, assets: [node] },
      ),
    /发布记录要在界面上建/,
  );
});

test("MCP 改验收记录：改内容可以，结论改不了", () => {
  const node = createNodeAsset();
  const record = {
    id: "evidence-1",
    projectId: "project-a",
    assetType: "evidence",
    title: "REQ-001 验收记录",
    summary: "",
    content: "验收条件：……",
    metadata: {
      nodeId: "node-1",
      conclusion: "pending",
      commitRef: "",
      evidenceItems: [],
    },
    source: {
      sourceType: "ai",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: "current-evidence-1",
    status: "active",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: now,
    updatedAt: now,
  };
  const input = buildMcpUpdateAsset(
    record,
    {
      content: "实际结果：重跑一遍仍然通过。",
      commitRef: "v2.9.1",
      evidenceItems: [{ label: "重跑记录", reference: "" }],
    },
    { versionId, now, assets: [node, record] },
  );

  assert.equal(input.asset.content, "实际结果：重跑一遍仍然通过。");
  assert.equal(input.asset.metadata.commitRef, "v2.9.1");
  assert.deepEqual(input.asset.metadata.evidenceItems, [
    { label: "重跑记录", reference: "" },
  ]);
  // 结论保持原样：MCP 的字段里根本没有结论
  assert.equal(input.asset.metadata.conclusion, "pending");
});

test("发布记录不给 AI 写：新建和修改都拒绝", () => {
  assert.throws(
    () =>
      buildMcpCreateAsset(
        {
          assetType: "release_record",
          projectId: "project-a",
          title: "v2.10.0 发布记录",
          content: "这次发布……",
        },
        { now, assets: [] },
      ),
    /不支持通过 MCP 新建/,
  );

  const record = {
    id: "release-1",
    projectId: "project-a",
    assetType: "release_record",
    title: "v2.10.0 发布记录",
    summary: "",
    content: "这次发布……",
    metadata: {
      version: "v2.10.0",
      releasedAt: "2026-09-23",
      result: "in_progress",
      rollbackTarget: "",
      gates: [],
    },
    source: {
      sourceType: "manual",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: "current-release-1",
    status: "active",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: now,
    updatedAt: now,
  };

  assert.throws(
    () =>
      buildMcpUpdateAsset(
        record,
        { content: "AI 想把门禁全勾上" },
        { versionId, now, assets: [record] },
      ),
    /还不支持通过 MCP 修改/,
  );
});
