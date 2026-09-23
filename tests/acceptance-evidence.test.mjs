import assert from "node:assert/strict";
import test from "node:test";

import {
  describeNodeEvidence,
  listEvidenceForNode,
  listProjectEvidence,
  listUnverifiedRequirements,
  rankRequirementsByEvidence,
  summarizeNodeEvidence,
} from "../src/lib/acceptance-evidence.ts";

const now = "2026-09-23T12:00:00.000Z";

function createNode(overrides = {}) {
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

function createEvidence(overrides = {}) {
  const { metadata, ...rest } = overrides;

  return {
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
      ...metadata,
    },
    source: {
      sourceType: "manual",
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
    ...rest,
  };
}

test("只有活跃、没进垃圾箱的验收记录算数", () => {
  const assets = [
    createEvidence(),
    createEvidence({ id: "evidence-draft", status: "draft" }),
    createEvidence({ id: "evidence-trashed", deletedAt: now }),
    createEvidence({ id: "evidence-other-project", projectId: "project-b" }),
    createNode(),
  ];

  assert.deepEqual(
    listProjectEvidence(assets, "project-a").map((record) => record.id),
    ["evidence-1"],
  );
});

test("按需求节点汇总：几条通过、几条待确认", () => {
  const assets = [
    createNode(),
    createNode({
      id: "node-2",
      title: "需求二",
      metadata: { nodeType: "requirement", code: "REQ-002", parentId: null },
    }),
    createEvidence({ id: "evidence-1", metadata: { conclusion: "passed" } }),
    createEvidence({
      id: "evidence-2",
      metadata: { conclusion: "failed" },
    }),
    createEvidence({
      id: "evidence-3",
      metadata: { nodeId: "node-2", conclusion: "pending" },
    }),
    // 没挂需求的记录不进任何节点的汇总
    createEvidence({ id: "evidence-4", metadata: { nodeId: null } }),
  ];
  const summary = summarizeNodeEvidence(assets, "project-a");

  assert.deepEqual(summary.get("node-1"), {
    total: 2,
    passed: 1,
    pending: 0,
    failed: 1,
    exception: 0,
  });
  assert.deepEqual(summary.get("node-2"), {
    total: 1,
    passed: 0,
    pending: 1,
    failed: 0,
    exception: 0,
  });
  assert.equal(summary.size, 2);
  assert.deepEqual(describeNodeEvidence(assets, "project-a", "node-3"), {
    total: 0,
    passed: 0,
    pending: 0,
    failed: 0,
    exception: 0,
  });
});

test("没通过验收的需求才进缺口清单，按编号排序", () => {
  const assets = [
    createNode({ id: "node-1", metadata: { code: "REQ-002" } }),
    createNode({
      id: "node-2",
      metadata: { code: "REQ-001" },
    }),
    // 模块节点不参与验收覆盖
    createNode({ id: "node-3", metadata: { nodeType: "module", code: "MOD-001" } }),
    createEvidence({ metadata: { nodeId: "node-1", conclusion: "passed" } }),
  ];
  const gaps = listUnverifiedRequirements(assets, "project-a");

  assert.deepEqual(
    gaps.map((node) => node.metadata.code),
    ["REQ-001"],
  );

  // 「例外」也算没有通过，仍然在缺口里
  const withException = [
    ...assets,
    createEvidence({
      id: "evidence-2",
      metadata: { nodeId: "node-2", conclusion: "exception" },
    }),
  ];

  assert.deepEqual(
    listUnverifiedRequirements(withException, "project-a").map(
      (node) => node.metadata.code,
    ),
    ["REQ-001"],
  );
});

test("排序：没通过验收的需求在前，未通过记录多的更靠前", () => {
  const assets = [
    createNode({ id: "node-a", metadata: { code: "REQ-001" } }),
    createNode({ id: "node-b", metadata: { code: "REQ-002" } }),
    createNode({ id: "node-c", metadata: { code: "REQ-003" } }),
    createEvidence({ id: "e1", metadata: { nodeId: "node-a", conclusion: "passed" } }),
    createEvidence({ id: "e2", metadata: { nodeId: "node-b", conclusion: "failed" } }),
    createEvidence({ id: "e3", metadata: { nodeId: "node-b", conclusion: "failed" } }),
  ];

  assert.deepEqual(
    rankRequirementsByEvidence(assets, "project-a").map((item) => [
      item.node.metadata.code,
      item.summary.failed,
      item.summary.passed,
    ]),
    [
      ["REQ-002", 2, 0],
      ["REQ-003", 0, 0],
      ["REQ-001", 0, 1],
    ],
  );
});

test("按节点列验收记录，最近更新的排前面", () => {
  const assets = [
    createNode(),
    createEvidence({ id: "evidence-old", updatedAt: "2026-09-22T00:00:00.000Z" }),
    createEvidence({ id: "evidence-new", updatedAt: "2026-09-23T10:00:00.000Z" }),
    createEvidence({ id: "evidence-other", metadata: { nodeId: "node-9" } }),
  ];

  assert.deepEqual(
    listEvidenceForNode(assets, "project-a", "node-1").map(
      (record) => record.id,
    ),
    ["evidence-new", "evidence-old"],
  );
});
