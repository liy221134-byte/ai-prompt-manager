import assert from "node:assert/strict";
import test from "node:test";

import {
  getDeletedReasonLabel,
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
