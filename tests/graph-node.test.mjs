import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeNodeImpact,
  buildGraphTree,
  buildNodePath,
  findNodeWithSameCode,
  listProjectGraphNodes,
} from "../src/lib/graph-node.ts";

const now = "2026-09-23T12:00:00.000Z";

function createNode(overrides = {}) {
  const { metadata, ...rest } = overrides;

  return {
    id: "node-1",
    projectId: "project-a",
    assetType: "graph_node",
    title: "需求一",
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

function createRule(overrides = {}) {
  const { metadata, ...rest } = overrides;

  return {
    id: "rule-1",
    projectId: "project-a",
    assetType: "rule",
    title: "提交前必须跑检查",
    summary: "",
    content: "检查",
    metadata: { ruleType: "must", scope: "project", ...metadata },
    source: {
      sourceType: "manual",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
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

test("图谱只列活跃、未删除的节点，按编号排序", () => {
  const assets = [
    createNode({ id: "node-b", metadata: { code: "REQ-002" }, title: "需求二" }),
    createNode({ id: "node-a", metadata: { code: "REQ-001" }, title: "需求一" }),
    createNode({ id: "node-archived", status: "archived" }),
    createNode({
      id: "node-trashed",
      deletedAt: now,
      deletedReason: "manual",
    }),
    createNode({ id: "node-other", projectId: "project-b" }),
    createRule({ id: "rule-1" }),
  ];

  assert.deepEqual(
    listProjectGraphNodes(assets, "project-a").map((node) => node.id),
    ["node-a", "node-b"],
  );
});

test("树按父节点组装，父节点不在列表里就当根", () => {
  const root = createNode({ id: "req-1", metadata: { code: "REQ-001" } });
  const child = createNode({
    id: "req-2",
    metadata: { code: "REQ-002", parentId: "req-1" },
  });
  const orphan = createNode({
    id: "req-3",
    metadata: { code: "REQ-003", parentId: "被归档的父节点" },
  });
  const tree = buildGraphTree([root, child, orphan]);

  assert.deepEqual(
    tree.roots.map((node) => node.id),
    ["req-1", "req-3"],
  );
  assert.deepEqual(
    (tree.childrenOf.get("req-1") ?? []).map((node) => node.id),
    ["req-2"],
  );
  assert.deepEqual(
    buildNodePath([root, child, orphan], "req-2").map((node) => node.id),
    ["req-1", "req-2"],
  );
});

test("编号查重只看同项目同类型，忽略大小写和自己", () => {
  const nodes = [
    createNode({ id: "req-1", metadata: { code: "REQ-001" } }),
    createNode({
      id: "mod-1",
      metadata: { nodeType: "module", code: "MOD-001" },
    }),
  ];

  assert.equal(
    findNodeWithSameCode(nodes, {
      id: "req-2",
      nodeType: "requirement",
      code: "req-001",
    })?.id,
    "req-1",
  );
  assert.equal(
    findNodeWithSameCode(nodes, {
      id: "req-1",
      nodeType: "requirement",
      code: "REQ-001",
    }),
    null,
  );
  assert.equal(
    findNodeWithSameCode(nodes, {
      id: "mod-2",
      nodeType: "module",
      code: "MOD-002",
    }),
    null,
  );
});

test("影响分析给出出向、入向和二层间接影响", () => {
  const node = createNode({
    id: "req-1",
    title: "需求一",
    metadata: {
      code: "REQ-001",
      relations: [
        { targetAssetId: "mod-1", relationType: "depends_on", note: "落在模块一" },
      ],
    },
  });
  const moduleNode = createNode({
    id: "mod-1",
    title: "模块一",
    metadata: { nodeType: "module", code: "MOD-001" },
  });
  const ruleOnRequirement = createRule({
    id: "rule-on-req",
    title: "需求规则",
    metadata: {
      ruleType: "must",
      scope: "project",
      relations: [
        { targetAssetId: "req-1", relationType: "reference", note: "适用于需求一" },
      ],
    },
  });
  const ruleOnRule = createRule({
    id: "rule-on-rule",
    title: "引用需求规则的另一条规则",
    metadata: {
      ruleType: "must",
      scope: "project",
      relations: [
        {
          targetAssetId: "rule-on-req",
          relationType: "depends_on",
          note: "依赖",
        },
      ],
    },
  });
  const impact = analyzeNodeImpact({
    node,
    assets: [node, moduleNode, ruleOnRequirement, ruleOnRule],
  });

  assert.deepEqual(
    impact.outgoing.map((entry) => entry.asset.id),
    ["mod-1"],
  );
  assert.deepEqual(
    impact.incoming.map((entry) => entry.asset.id),
    ["rule-on-req"],
  );
  assert.deepEqual(
    impact.indirect.map((entry) => [entry.asset.id, entry.via]),
    [["rule-on-rule", ["需求规则"]]],
  );
});

test("影响分析跳过垃圾箱里的资产，也不把指向目标本身的算成间接", () => {
  const node = createNode({
    id: "req-1",
    metadata: { relations: [] },
  });
  const trashedRule = createRule({
    id: "rule-trashed",
    deletedAt: now,
    deletedReason: "manual",
    metadata: {
      ruleType: "must",
      scope: "project",
      relations: [
        { targetAssetId: "req-1", relationType: "reference", note: "" },
      ],
    },
  });
  const impact = analyzeNodeImpact({
    node,
    assets: [node, trashedRule],
  });

  assert.deepEqual(impact.incoming, []);
  assert.deepEqual(impact.indirect, []);
});
