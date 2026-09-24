import assert from "node:assert/strict";
import test from "node:test";

import {
  assetTypeDescriptions,
  assetTypeFilterLabels,
  matchesWorkspaceViewAsset,
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

test("两个视图的类型标签互不重复，并且都从「全部」开始", () => {
  for (const view of workspaceViews) {
    const options = workspaceViewTypeOptions[view];

    assert.equal(options[0], "all");
    assert.equal(new Set(options).size, options.length);
  }
});

test("提示词只出现在公共资产，图谱节点和验收发布记录只出现在项目", () => {
  assert.equal(matchesWorkspaceViewAsset("public", "prompt"), true);
  assert.equal(matchesWorkspaceViewAsset("project", "prompt"), false);

  assert.equal(matchesWorkspaceViewAsset("project", "graph_node"), true);
  assert.equal(matchesWorkspaceViewAsset("public", "graph_node"), false);

  assert.equal(matchesWorkspaceViewAsset("project", "evidence"), true);
  assert.equal(matchesWorkspaceViewAsset("project", "release_record"), true);
  assert.equal(matchesWorkspaceViewAsset("public", "evidence"), false);
  assert.equal(matchesWorkspaceViewAsset("public", "release_record"), false);
});

test("技术档案和来源包不进任何视图的列表", () => {
  for (const view of workspaceViews) {
    assert.equal(matchesWorkspaceViewAsset(view, "tech_profile"), false);
    assert.equal(matchesWorkspaceViewAsset(view, "source_package"), false);
  }
});

test("标签只列本视图的资产类型", () => {
  for (const view of workspaceViews) {
    const options = workspaceViewTypeOptions[view].filter(
      (option) => option !== "all",
    );

    assert.deepEqual(options, workspaceViewAssetTypes[view]);
  }
});

test("切换视图后不属于新视图的标签退回全部", () => {
  assert.equal(resolveWorkspaceTypeFilter("project", "prompt"), "all");
  assert.equal(resolveWorkspaceTypeFilter("public", "graph_node"), "all");
  assert.equal(resolveWorkspaceTypeFilter("public", "prompt"), "prompt");
  assert.equal(resolveWorkspaceTypeFilter("project", "document"), "document");
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
