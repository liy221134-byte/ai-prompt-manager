import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MIN_QUESTIONS_FOR_LEVEL,
  buildPracticeMatrix,
  daysUntil,
  upcomingMilestones,
} from "../src/lib/learning/matrix.ts";

// M1 的矩阵是「练习覆盖矩阵」，不是诊断矩阵：只说覆盖了多少、做了多少、对多少，
// 不给「你在第几层」的结论。这一组测试就是把这个边界钉死的地方。

const MODULES = [
  { id: "S1", name: "项目管理框架", order_index: 1, weight: 0.3, expected_gap: 2, planned_hours: 90 },
  { id: "S2", name: "五大过程组实操", order_index: 2, weight: 0.2, expected_gap: 3, planned_hours: 100 },
];

const q = (id, moduleId, level) => ({ id, module_id: moduleId, level });

test("空输入返回每个模块一行空格子，不报错", () => {
  const rows = buildPracticeMatrix(MODULES, [], []);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].cells[1], { total: 0, done: 0, correct: 0, enoughQuestions: false });
  assert.equal(rows[0].totalQuestions, 0);
});

test("题数、已做、答对分别统计到正确的格子里", () => {
  const questions = [q("a", "S1", 1), q("b", "S1", 1), q("c", "S1", 1), q("d", "S1", 2)];
  const attempts = [
    { question_id: "a", is_correct: true, created_at: "2026-10-27T10:00:00Z" },
    { question_id: "b", is_correct: false, created_at: "2026-10-27T10:05:00Z" },
  ];
  const rows = buildPracticeMatrix(MODULES, questions, attempts);
  const s1 = rows[0];

  assert.deepEqual(s1.cells[1], { total: 3, done: 2, correct: 1, enoughQuestions: true });
  assert.deepEqual(s1.cells[2], { total: 1, done: 0, correct: 0, enoughQuestions: false });
  assert.equal(s1.totalQuestions, 4);
  assert.equal(s1.totalDone, 2);
});

test("同一个题做多次，以最新一次为准（先错后对算对）", () => {
  const questions = [q("a", "S1", 1)];
  const attempts = [
    { question_id: "a", is_correct: false, created_at: "2026-10-27T09:00:00Z" },
    { question_id: "a", is_correct: true, created_at: "2026-10-27T11:00:00Z" },
    { question_id: "a", is_correct: false, created_at: "2026-10-27T10:00:00Z" },
  ];
  const rows = buildPracticeMatrix(MODULES, questions, attempts);
  assert.deepEqual(rows[0].cells[1], { total: 1, done: 1, correct: 1, enoughQuestions: false });
});

test("没标层级的题不进任何格子，但被单独计数", () => {
  const questions = [q("a", "S1", 1), q("b", "S1", null)];
  const rows = buildPracticeMatrix(MODULES, questions, []);
  assert.equal(rows[0].cells[1].total, 1);
  assert.equal(rows[0].totalQuestions, 1);
  assert.equal(rows[0].unleveled, 1);
});

test("模块对不上的题被忽略——不许给不存在的模块凭空造行", () => {
  const questions = [q("a", "S9", 1), q("b", null, 1), q("c", "S1", 1)];
  const rows = buildPracticeMatrix(MODULES, questions, []);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].cells[1].total, 1);
  assert.equal(rows[1].totalQuestions, 0);
});

test("层数从 1 到 5 全部给出来，缺的层是空格子而不是 undefined", () => {
  const rows = buildPracticeMatrix(MODULES, [], []);
  for (const lv of [1, 2, 3, 4, 5]) {
    assert.ok(rows[0].cells[lv], `L${lv} 应该存在`);
    assert.equal(rows[0].cells[lv].total, 0);
  }
});

test("题量门槛：低于 3 题的格子会被标出来，因为样本不够不能下结论", () => {
  assert.equal(MIN_QUESTIONS_FOR_LEVEL, 3);
  const questions = [q("a", "S1", 1), q("b", "S1", 1), q("c", "S1", 1), q("d", "S1", 2), q("e", "S1", 2)];
  const rows = buildPracticeMatrix(MODULES, questions, []);
  assert.equal(rows[0].cells[1].enoughQuestions, true, "3 题够");
  assert.equal(rows[0].cells[2].enoughQuestions, false, "2 题不够");
});

test("答题记录里出现已被删掉的题，不会污染统计", () => {
  const questions = [q("a", "S1", 1)];
  const attempts = [
    { question_id: "a", is_correct: true, created_at: "2026-10-27T10:00:00Z" },
    { question_id: "ghost", is_correct: false, created_at: "2026-10-27T10:00:00Z" },
  ];
  const rows = buildPracticeMatrix(MODULES, questions, attempts);
  assert.deepEqual(rows[0].cells[1], {
    total: 1, done: 1, correct: 1, enoughQuestions: false,
  });
});

test("距考试天数按自然日算，不按 24 小时算", () => {
  const now = new Date("2026-10-27T23:30:00+08:00");
  // 次日凌晨距离现在不到 2 小时，但按自然日应该是 1 天
  assert.equal(daysUntil("2026-10-28T00:10:00+08:00", now), 1);
  assert.equal(daysUntil("2026-11-26T00:00:00+08:00", now), 30);
  assert.equal(daysUntil("2026-10-26T00:00:00+08:00", now), -1, "已经过去的节点给负数");
});

test("关键节点按日期升序，并标出是否已过", () => {
  const now = new Date("2026-10-27T12:00:00+08:00");
  const list = [
    { name: "考试", date: "2027-05-22" },
    { name: "报名", date: "2027-03-20" },
    { name: "过去的事", date: "2026-10-01" },
  ];
  const result = upcomingMilestones(list, now);
  assert.deepEqual(result.map((x) => x.milestone.name), ["过去的事", "报名", "考试"]);
  assert.equal(result[0].passed, true);
  assert.equal(result[1].passed, false);
  assert.ok(result[1].daysLeft > 0);
});
