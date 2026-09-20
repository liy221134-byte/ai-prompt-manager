import assert from "node:assert/strict";
import test from "node:test";

import {
  getDeletedReasonLabel,
  getMergeRestoreConfirmation,
  getMergeSourceCount,
  getTrashSummary,
} from "../src/lib/prompt-trash-presentation.ts";

test("垃圾箱来源显示中文说明", () => {
  assert.equal(getDeletedReasonLabel("manual"), "手动删除");
  assert.equal(getDeletedReasonLabel("merge"), "AI 合并");
});

test("垃圾箱摘要显示提示词和恢复记录数量", () => {
  assert.equal(
    getTrashSummary({
      prompts: [{}, {}],
      records: [{}],
    }),
    "2 条提示词，1 条合并恢复记录",
  );
});

test("合并恢复记录只统计目标之外的来源数量", () => {
  assert.equal(
    getMergeSourceCount({
      promptId: "prompt-a",
      sourcePromptIds: ["prompt-a", "prompt-b", "prompt-c"],
    }),
    2,
  );
});

test("合并恢复确认文案说明最多恢复数量和状态变化边界", () => {
  assert.equal(
    getMergeRestoreConfirmation({
      title: "提示词 A",
      promptId: "prompt-a",
      sourcePromptIds: ["prompt-a", "prompt-b", "prompt-c"],
    }),
    "“提示词 A”将恢复为合并前内容，最多恢复 2 条来源提示词。状态已改变的来源不会恢复，当前合并结果会被替换。",
  );
});
