import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeNodeImpactByReference,
  describeAsset,
  findAsset,
  listGraphNodeAssets,
  listRuleAssets,
  resolveProject,
  searchPromptAssets,
} from "../src/lib/mcp-query.ts";

const now = "2026-09-23T12:00:00.000Z";

const projects = [
  {
    id: "default-project",
    name: "默认项目（开发）",
    description: "",
    status: "active",
    stage: "development",
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  },
  {
    id: "project-assets",
    name: "资产入库",
    description: "",
    status: "active",
    stage: "development",
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  },
  {
    id: "project-old",
    name: "老项目",
    description: "",
    status: "archived",
    stage: "maintenance",
    createdAt: now,
    updatedAt: now,
    archivedAt: now,
  },
];

function createAsset(overrides = {}) {
  const { metadata, ...rest } = overrides;

  return {
    id: "asset-1",
    projectId: "default-project",
    assetType: "prompt",
    title: "代码审查顾问",
    summary: "审查代码时用",
    content: "请审查这段代码的类型安全",
    metadata: {
      category: "评审",
      tags: ["代码审查"],
      useCase: "审查代码时用",
      mergedIntoAssetId: null,
      mergeVersionId: null,
      ...metadata,
    },
    source: {
      sourceType: "manual",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: "current-asset-1",
    status: "active",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: now,
    updatedAt: now,
    ...rest,
  };
}

function createRule(overrides = {}) {
  const { metadata, ...rest } = overrides;

  return createAsset({
    id: "rule-1",
    assetType: "rule",
    title: "必须校验输入",
    summary: "",
    content: "所有外部输入都要在边界处校验。",
    metadata: {
      ruleType: "must",
      scope: "project",
      level: "module",
      purpose: "安全",
      rationale: "历史上有过注入问题",
      sourceExcerpt: "原始文档第 3 节",
      ...metadata,
    },
    ...rest,
  });
}

function createNode(overrides = {}) {
  const { metadata, ...rest } = overrides;

  return createAsset({
    id: "node-1",
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
    ...rest,
  });
}

test("项目可以按标识、名称和名称片段找，找不到不猜", () => {
  assert.equal(resolveProject(projects).id, "default-project");
  assert.equal(resolveProject(projects, "project-assets").id, "project-assets");
  assert.equal(resolveProject(projects, "资产入库").id, "project-assets");
  assert.equal(resolveProject(projects, "入库").id, "project-assets");
  assert.equal(resolveProject(projects, "老项目").id, "project-old");
  assert.equal(resolveProject(projects, "不存在的项目"), null);
  assert.equal(resolveProject([], "默认项目（开发）"), null);
});

test("搜提示词：关键词、标签和条数上限都生效，归档和垃圾箱不出现", () => {
  const assets = [
    createAsset(),
    createAsset({
      id: "asset-2",
      title: "产品需求评审助手",
      content: "帮我评审需求",
      metadata: {
        category: "评审",
        tags: ["需求分析"],
        useCase: "评审需求时用",
      },
    }),
    createAsset({ id: "asset-archived", title: "归档的提示词", status: "archived" }),
    createAsset({ id: "asset-trashed", title: "垃圾箱里的", deletedAt: now }),
    createAsset({ id: "asset-other", projectId: "project-assets", title: "别的项目" }),
  ];

  const byKeyword = searchPromptAssets(assets, "default-project", {
    query: "类型安全",
  });
  assert.deepEqual(
    byKeyword.map((item) => item.title),
    ["代码审查顾问"],
  );
  assert.equal(byKeyword[0].category, "评审");

  assert.deepEqual(
    searchPromptAssets(assets, "default-project", { tag: "需求分析" }).map(
      (item) => item.title,
    ),
    ["产品需求评审助手"],
  );
  assert.equal(searchPromptAssets(assets, "default-project").length, 2);
  assert.equal(
    searchPromptAssets(assets, "default-project", { limit: 1 }).length,
    1,
  );
});

test("找资产：标识、完整标题、唯一标题片段都能找到，多义返回空", () => {
  const assets = [
    createAsset(),
    createAsset({ id: "asset-2", title: "代码审查顾问（进阶）" }),
  ];

  assert.equal(findAsset(assets, "asset-1").id, "asset-1");
  assert.equal(findAsset(assets, "代码审查顾问").id, "asset-1");
  assert.equal(findAsset(assets, "进阶").id, "asset-2");
  assert.equal(findAsset(assets, "代码审查"), null);
  assert.equal(findAsset(assets, ""), null);
});

test("取资产详情：出向和入向关系都列出来", () => {
  const target = createAsset({ id: "asset-target", title: "目标提示词" });
  const source = createAsset({
    id: "asset-source",
    title: "引用它的规则",
    assetType: "rule",
    metadata: {
      ruleType: "must",
      scope: "project",
      relations: [
        {
          targetAssetId: "asset-target",
          relationType: "reference",
          note: "引用这条提示词",
        },
      ],
    },
  });
  const owner = createAsset({
    id: "asset-owner",
    title: "被它引用的资产",
  });
  // 这条资产自己指向 owner，同时被 source 指向
  const linked = {
    ...target,
    metadata: {
      ...target.metadata,
      relations: [
        {
          targetAssetId: owner.id,
          relationType: "depends_on",
          note: "依赖",
        },
      ],
    },
  };
  const detail = describeAsset([linked, source, owner], linked);

  assert.deepEqual(
    detail.outgoing.map((entry) => entry.title),
    ["被它引用的资产"],
  );
  assert.deepEqual(
    detail.incoming.map((entry) => entry.title),
    ["引用它的规则"],
  );
  assert.equal(detail.outgoing[0].relationType, "depends_on");
  assert.equal(detail.incoming[0].relationType, "reference");

  // 没有关系的资产两侧都是空清单
  const isolated = createAsset({ id: "asset-isolated", title: "孤立资产" });
  const isolatedDetail = describeAsset([isolated], isolated);

  assert.deepEqual(isolatedDetail.outgoing, []);
  assert.deepEqual(isolatedDetail.incoming, []);
});

test("列规则：能按层级、类型和范围筛，带理由和来源片段", () => {
  const assets = [
    createRule(),
    createRule({
      id: "rule-2",
      title: "禁止硬编码密钥",
      metadata: { ruleType: "forbidden", scope: "global", level: "global" },
    }),
  ];

  assert.equal(listRuleAssets(assets, "default-project").length, 2);
  assert.deepEqual(
    listRuleAssets(assets, "default-project", { level: "global" }).map(
      (rule) => rule.title,
    ),
    ["禁止硬编码密钥"],
  );
  assert.deepEqual(
    listRuleAssets(assets, "default-project", { ruleType: "must" }).map(
      (rule) => rule.title,
    ),
    ["必须校验输入"],
  );
  assert.equal(
    listRuleAssets(assets, "default-project", { scope: "task" }).length,
    0,
  );

  const [rule] = listRuleAssets(assets, "default-project", { ruleType: "must" });
  assert.equal(rule.rationale, "历史上有过注入问题");
  assert.equal(rule.sourceExcerpt, "原始文档第 3 节");
});

test("列图谱节点：按类型筛，路径是多级父链", () => {
  const child = createNode({
    id: "node-2",
    title: "需求二：规则编译",
    metadata: {
      nodeType: "requirement",
      code: "REQ-002",
      parentId: "node-1",
      note: "子需求",
    },
  });
  const assets = [createNode(), child, createNode({
    id: "node-3",
    title: "assets 表",
    metadata: { nodeType: "data", code: "TBL-assets", parentId: null },
  })];

  const requirements = listGraphNodeAssets(assets, "default-project", "requirement");

  assert.deepEqual(
    requirements.map((node) => node.code),
    ["REQ-001", "REQ-002"],
  );
  assert.deepEqual(requirements[1].path, ["需求一：资产入库", "需求二：规则编译"]);
  assert.equal(
    listGraphNodeAssets(assets, "default-project", "data").length,
    1,
  );
  assert.equal(listGraphNodeAssets(assets, "default-project").length, 3);
});

test("影响分析：按编号忽略大小写找节点，间接影响写清通过谁", () => {
  const node = createNode();
  const rule = createRule({
    id: "rule-depends",
    title: "需求一必须保留原文",
    metadata: {
      ruleType: "must",
      scope: "project",
      relations: [
        {
          targetAssetId: "node-1",
          relationType: "reference",
          note: "引用需求一",
        },
      ],
    },
  });
  const checker = createRule({
    id: "rule-checker",
    title: "检查规则本身也要复核",
    metadata: {
      ruleType: "process",
      scope: "project",
      relations: [
        {
          targetAssetId: "rule-depends",
          relationType: "depends_on",
          note: "依赖那条规则",
        },
      ],
    },
  });
  const assets = [node, rule, checker];

  const impact = analyzeNodeImpactByReference(assets, "default-project", "req-001");

  assert.equal(impact.node.code, "REQ-001");
  assert.deepEqual(
    impact.incoming.map((entry) => entry.title),
    ["需求一必须保留原文"],
  );
  assert.deepEqual(
    impact.indirect.map((entry) => entry.title),
    ["检查规则本身也要复核"],
  );
  assert.deepEqual(impact.indirect[0].via, ["需求一必须保留原文"]);
  assert.equal(
    analyzeNodeImpactByReference(assets, "default-project", "不存在"),
    null,
  );
});
