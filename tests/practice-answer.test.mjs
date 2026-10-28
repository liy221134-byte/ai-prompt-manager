import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseAnswerTerms,
  resolveMultiAnswer,
  resolveSingleAnswer,
  sameTerms,
  toOptionText,
} from "../src/lib/practice/answer.ts";

// 这组测试守的是一个已经真实发生过的错：中项 84 道单选题答案存的是字母，
// 判分组件却拿「选项全文 === 字母」去比，结果全判错。
// 两批存量数据（全文 / 字母）必须共用同一套判分。

const OPTIONS = [
  "项目是持续性的，运营是临时性的",
  "项目具有临时性和独特性，运营是持续重复的",
  "项目不需要明确目标，运营需要",
  "项目和运营都由同一套组织流程管理，无区别",
];

test("字母答案按位置展开成选项全文（中项题库的形状）", () => {
  assert.equal(resolveSingleAnswer("B", OPTIONS), OPTIONS[1]);
  assert.equal(resolveSingleAnswer("A", OPTIONS), OPTIONS[0]);
  assert.equal(resolveSingleAnswer("D", OPTIONS), OPTIONS[3]);
});

test("本来存全文的答案原样返回（早期题库的形状）", () => {
  assert.equal(resolveSingleAnswer(OPTIONS[2], OPTIONS), OPTIONS[2]);
});

test("实操题没有选项，文本答案不会被当成字母误展开", () => {
  const text = "五组各≥2项产出，且每组都说明缺失后果";
  assert.equal(resolveSingleAnswer(text, []), text);
  assert.equal(resolveSingleAnswer(text, null), text);
});

test("字母超出选项范围时原样返回，不猜也不崩", () => {
  assert.equal(toOptionText("E", OPTIONS), "E", "只有 4 个选项，E 越界");
  assert.equal(toOptionText("Z", OPTIONS), "Z");
  assert.equal(toOptionText("B", null), "B");
});

test("多选答案里的字母逐项展开", () => {
  assert.deepEqual(resolveMultiAnswer('["A","C"]', OPTIONS), [OPTIONS[0], OPTIONS[2]]);
});

test("多选答案本来就是全文时保持原样", () => {
  const raw = JSON.stringify([OPTIONS[1], OPTIONS[3]]);
  assert.deepEqual(resolveMultiAnswer(raw, OPTIONS), [OPTIONS[1], OPTIONS[3]]);
});

test("多选答案不是 JSON 时返回空数组而不是抛错", () => {
  assert.deepEqual(parseAnswerTerms("A,C"), []);
  assert.deepEqual(resolveMultiAnswer("", OPTIONS), []);
});

test("集合相等忽略顺序，但数量必须一致", () => {
  assert.equal(sameTerms(["A", "B"], ["B", "A"]), true);
  assert.equal(sameTerms(["A"], ["A", "B"]), false);
  assert.equal(sameTerms([], []), true);
});

test("同一道题：存字母和存全文，判分结果必须一致", () => {
  const byLetter = resolveSingleAnswer("B", OPTIONS);
  const byText = resolveSingleAnswer(OPTIONS[1], OPTIONS);
  assert.equal(byLetter, byText);
  // 用户点选的也是选项全文，两边相等才算答对
  assert.equal(OPTIONS[1] === byLetter, true);
});
