import assert from "node:assert/strict";
import test from "node:test";

import { localPromptDataSource } from "../src/lib/prompt-source.ts";

const REQUIRED_METHODS = [
  "fetchProjects",
  "createProject",
  "updateProject",
  "fetchAssets",
  "createAsset",
  "updateAsset",
  "fetchAssetVersions",
  "fetchLibrary",
  "createPrompt",
  "updatePrompt",
  "deletePrompt",
  "mergePrompts",
  "fetchTrash",
  "restorePrompt",
  "permanentlyDeletePrompt",
  "emptyTrash",
  "commitAiMerge",
  "fetchMergeRecoveryRecords",
  "restoreMergeRecord",
  "permanentlyDeleteMergeRecord",
  "commitAiOptimize",
  "fetchOptimizeVersion",
  "restoreAiOptimize",
];

test("本地数据源实现完整契约", () => {
  for (const methodName of REQUIRED_METHODS) {
    assert.equal(
      typeof localPromptDataSource[methodName],
      "function",
      `缺少数据源方法：${methodName}`,
    );
  }
});

// 回退会新写一条回退前快照，快照标识必须由数据源生成；调用方传错标识会写库失败。
test("回到优化前不接受调用方传入的回退快照标识", () => {
  assert.equal(localPromptDataSource.restoreAiOptimize.length, 1);
});
