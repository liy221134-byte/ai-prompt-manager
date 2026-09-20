import assert from "node:assert/strict";
import test from "node:test";

import {
  canStartMerge,
  createEmptySelection,
  setMergeTarget,
  togglePromptSelection,
} from "../src/lib/prompt-merge-selection.ts";

test("第一条选中项自动成为目标", () => {
  const selection = togglePromptSelection(createEmptySelection(), "a");

  assert.equal(selection.targetPromptId, "a");
});

test("取消目标后选择下一条作为目标", () => {
  let selection = togglePromptSelection(createEmptySelection(), "a");
  selection = togglePromptSelection(selection, "b");
  selection = togglePromptSelection(selection, "a");

  assert.equal(selection.targetPromptId, "b");
});

test("最多只能选择五条", () => {
  let selection = createEmptySelection();

  for (const id of ["a", "b", "c", "d", "e", "f"]) {
    selection = togglePromptSelection(selection, id);
  }

  assert.equal(selection.selectedPromptIds.length, 5);
});

test("只能把已选提示词设为目标", () => {
  const selection = togglePromptSelection(
    togglePromptSelection(createEmptySelection(), "a"),
    "b",
  );

  assert.equal(setMergeTarget(selection, "b").targetPromptId, "b");
  assert.equal(setMergeTarget(selection, "missing").targetPromptId, "a");
});

test("选择两条且目标存在时才能开始合并", () => {
  let selection = togglePromptSelection(createEmptySelection(), "a");

  assert.equal(canStartMerge(selection), false);

  selection = togglePromptSelection(selection, "b");

  assert.equal(canStartMerge(selection), true);
});
