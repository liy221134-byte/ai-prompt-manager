import assert from "node:assert/strict";
import test from "node:test";

import {
  assetTypeDescriptions,
  assetTypeFilterLabels,
  matchesWorkspaceViewAsset,
  readGraphNodeLane,
  resolveWorkspaceTypeFilter,
  workspaceViewAssetTypes,
  workspaceViewTypeOptions,
  workspaceViews,
} from "../src/lib/asset-list.ts";

const allAssetTypes = [
  "prompt",
  "rule",
  "document",
  "template",
  "tech_profile",
  "rule_pack",
  "graph_node",
  "evidence",
  "release_record",
  "source_package",
];

const now = "2026-09-24T00:00:00.000Z";

function createAsset(assetType, metadata = {}) {
  return {
    id: `${assetType}-1`,
    projectId: "project-1",
    assetType,
    title: "示例",
    summary: "",
    content: "正文",
    metadata: { documentType: "参考资料", ...metadata },
    source: {
      sourceType: "manual",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: "current-1",
    status: "active",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

function createNode(nodeType, code) {
  return createAsset("graph_node", { nodeType, code, parentId: null, note: "" });
}

test("三个视图的类型标签互不重复，并且都从「全部」开始", () => {
  assert.deepEqual([...workspaceViews], ["public", "project", "code"]);

  for (const view of workspaceViews) {
    const options = workspaceViewTypeOptions[view];

    assert.equal(options[0], "all");
    assert.equal(new Set(options).size, options.length);
  }
});

test("提示词只出现在公共资产，文档和规则只出现在项目文档视图", () => {
  assert.equal(matchesWorkspaceViewAsset("public", createAsset("prompt")), true);
  assert.equal(matchesWorkspaceViewAsset("project", createAsset("prompt")), false);
  assert.equal(matchesWorkspaceViewAsset("code", createAsset("prompt")), false);

  assert.equal(matchesWorkspaceViewAsset("project", createAsset("document")), true);
  assert.equal(matchesWorkspaceViewAsset("code", createAsset("document")), false);

  assert.equal(matchesWorkspaceViewAsset("project", createAsset("rule")), true);
  assert.equal(matchesWorkspaceViewAsset("code", createAsset("rule")), false);
});

test("图谱节点按节点类型分两条链路：需求跟文档，模块接口数据测试进代码", () => {
  assert.equal(readGraphNodeLane("requirement"), "document");
  for (const nodeType of ["module", "data", "interface", "test"]) {
    assert.equal(readGraphNodeLane(nodeType), "code");
  }

  const requirement = createNode("requirement", "REQ-001");
  const moduleNode = createNode("module", "MOD-001");

  assert.equal(matchesWorkspaceViewAsset("project", requirement), true);
  assert.equal(matchesWorkspaceViewAsset("code", requirement), false);
  assert.equal(matchesWorkspaceViewAsset("code", moduleNode), true);
  assert.equal(matchesWorkspaceViewAsset("project", moduleNode), false);
  assert.equal(matchesWorkspaceViewAsset("public", moduleNode), false);
});

test("验收记录与发布记录不再单独占位，但老数据仍出现在文档视图的「全部」里", () => {
  for (const assetType of ["evidence", "release_record"]) {
    assert.equal(matchesWorkspaceViewAsset("project", createAsset(assetType)), true);
    assert.equal(matchesWorkspaceViewAsset("code", createAsset(assetType)), false);
    assert.equal(
      workspaceViewTypeOptions.project.includes(assetType),
      false,
      "不再给老类型单独一个筛选标签",
    );
  }
});

test("技术档案和来源包不进任何视图的列表", () => {
  for (const view of workspaceViews) {
    assert.equal(matchesWorkspaceViewAsset(view, createAsset("tech_profile")), false);
    assert.equal(matchesWorkspaceViewAsset(view, createAsset("source_package")), false);
  }
});

test("标签只列本视图的资产类型", () => {
  for (const view of workspaceViews) {
    const options = workspaceViewTypeOptions[view].filter(
      (option) => option !== "all",
    );

    for (const option of options) {
      assert.ok(
        workspaceViewAssetTypes[view].includes(option),
        `${view} 的标签 ${option} 不在这个视图的资产类型里`,
      );
    }
  }
});

test("切换视图后不属于新视图的标签退回全部", () => {
  assert.equal(resolveWorkspaceTypeFilter("project", "prompt"), "all");
  assert.equal(resolveWorkspaceTypeFilter("public", "graph_node"), "all");
  assert.equal(resolveWorkspaceTypeFilter("public", "prompt"), "prompt");
  assert.equal(resolveWorkspaceTypeFilter("project", "document"), "document");
  assert.equal(resolveWorkspaceTypeFilter("code", "document"), "all");
  assert.equal(resolveWorkspaceTypeFilter("code", "graph_node"), "graph_node");
});

test("每类资产都有定位说明，且标签和说明都能读出来", () => {
  for (const assetType of allAssetTypes) {
    assert.ok(
      assetTypeDescriptions[assetType]?.length > 0,
      `${assetType} 缺少定位说明`,
    );
  }

  for (const view of workspaceViews) {
    for (const option of workspaceViewTypeOptions[view]) {
      assert.ok(
        assetTypeFilterLabels[option]?.length > 0,
        `${option} 缺少标签文案`,
      );
    }
  }
});
