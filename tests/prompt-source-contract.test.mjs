import assert from "node:assert/strict";
import test from "node:test";

import { localPromptDataSource } from "../src/lib/prompt-source.ts";

const REQUIRED_METHODS = [
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
