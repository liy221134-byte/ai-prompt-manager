// 今日计划的单测。纯函数，全部用固定日期，不依赖真实时间。
//
// 重点压在三处容易错的地方：
// 1. 「完成」以最新一次作答为准——做错过又做对，不该还挂在错题里；
// 2. 配额会算出很大的数时必须有上限，否则落后的人一晚上面对 40 道题；
// 3. 「没设终点」「没设每周投入」不能混进「时间够」。

import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_DAILY_QUESTIONS,
  allocateModuleDays,
  buildDailyPlan,
  latestAttempts,
} from "../src/lib/learning/daily-plan.ts";

const NOW = new Date(2026, 9, 28); // 2026-10-28 本地时间

// 两个模块各 90 小时，跟中项主题包的实际结构同形
const MODULES = [
  { id: "S1", name: "项目管理基础", order_index: 1, planned_hours: 90 },
  { id: "S3", name: "信息技术基础", order_index: 2, planned_hours: 90 },
];

const QUESTIONS = [
  { id: "Q1", module_id: "S1", level: 1 },
  { id: "Q2", module_id: "S1", level: 1 },
  { id: "Q3", module_id: "S1", level: 2 },
  { id: "Q4", module_id: "S3", level: 1 },
];

const BASE = {
  modules: MODULES,
  questions: QUESTIONS,
  attempts: [],
  totalHours: 180,
  startedAt: "2026-10-28",
  endsAt: "2027-05-22",
  weeklyHours: 13,
  now: NOW,
};

test("全新开始时，计划位置与实际位置都在第一个模块", () => {
  const plan = buildDailyPlan(BASE);
  assert.equal(plan.dayIndex, 1);
  assert.equal(plan.totalDays, 206);
  assert.equal(plan.daysLeft, 206);
  assert.equal(plan.plannedModuleId, "S1");
  assert.equal(plan.actualModuleId, "S1");
  assert.equal(plan.doneQuestions, 0);
  assert.equal(plan.remainingQuestions, 4);
});

test("今日建议取第一个模块里最低还有题的层，从第一道没做过的开始", () => {
  const plan = buildDailyPlan(BASE);
  assert.equal(plan.focus?.moduleId, "S1");
  assert.equal(plan.focus?.level, 1);
  assert.deepEqual(plan.focus?.questionIds, ["Q1"]);
  assert.equal(plan.focus?.hasWrongOnes, false);
});

test("配额按模块剩余题除以模块剩余天数算，正常节奏下每天一两道就够", () => {
  // S1 共 3 道题，占计划第 1—103 天，今天第 1 天 → 剩 103 天摊 3 道
  const plan = buildDailyPlan(BASE);
  assert.equal(plan.dailyQuota, 1);
});

test("配额有上限：落后很多时也不会一次甩出几十道", () => {
  const many = Array.from({ length: 40 }, (_, i) => ({
    id: `Q${String(i).padStart(2, "0")}`,
    module_id: "S1",
    level: 1,
  }));
  const plan = buildDailyPlan({
    ...BASE,
    questions: many,
    // 起点很早、终点很近：S1 的日历窗口已经走完，剩余全压到今天
    startedAt: "2026-10-01",
    endsAt: "2026-11-01",
  });
  assert.equal(plan.dailyQuota, MAX_DAILY_QUESTIONS);
  assert.equal(plan.focus?.questionIds.length, MAX_DAILY_QUESTIONS);
});

test("做对一题只算完成一题，同一层还有没做的就继续这一层", () => {
  const plan = buildDailyPlan({
    ...BASE,
    attempts: [{ question_id: "Q1", is_correct: true, created_at: "2026-10-28T09:00:00Z" }],
  });
  assert.equal(plan.doneQuestions, 1);
  assert.equal(plan.remainingQuestions, 3);
  assert.equal(plan.focus?.level, 1);
  assert.deepEqual(plan.focus?.questionIds, ["Q2"]);
});

test("做过的题做错了，仍留在今天建议里，且排在没做过的题前面", () => {
  const plan = buildDailyPlan({
    ...BASE,
    attempts: [
      { question_id: "Q2", is_correct: false, created_at: "2026-10-28T09:00:00Z" },
      { question_id: "Q1", is_correct: true, created_at: "2026-10-28T09:10:00Z" },
    ],
    // 配额压到 1 才能看出排在前面的确实是错题
    endsAt: "2027-05-22",
  });
  // S1 剩 2 道、窗口 103 天 → 配额 1
  assert.equal(plan.dailyQuota, 1);
  assert.deepEqual(plan.focus?.questionIds, ["Q2"]);
  assert.equal(plan.focus?.hasWrongOnes, true);
});

test("做错过之后重做对了，以最新一次为准，不再是错题", () => {
  const plan = buildDailyPlan({
    ...BASE,
    attempts: [
      { question_id: "Q2", is_correct: false, created_at: "2026-10-28T09:00:00Z" },
      { question_id: "Q2", is_correct: true, created_at: "2026-10-28T10:00:00Z" },
      { question_id: "Q1", is_correct: true, created_at: "2026-10-28T09:10:00Z" },
    ],
  });
  assert.equal(plan.doneQuestions, 2);
  assert.equal(plan.focus?.hasWrongOnes, false);
});

test("第一个模块做完后，练习位置推进到下一个模块", () => {
  const plan = buildDailyPlan({
    ...BASE,
    attempts: ["Q1", "Q2", "Q3"].map((id) => ({
      question_id: id,
      is_correct: true,
      created_at: "2026-10-28T09:00:00Z",
    })),
  });
  assert.equal(plan.actualModuleId, "S3");
  assert.deepEqual(plan.focus?.questionIds, ["Q4"]);
  // 计划位置还在 S1——日历才第 1 天，这说明练得比日历快，不是落后
  assert.equal(plan.plannedModuleId, "S1");
});

test("全部做完时不给建议，也不留一个空配额", () => {
  const plan = buildDailyPlan({
    ...BASE,
    attempts: QUESTIONS.map((q) => ({
      question_id: q.id,
      is_correct: true,
      created_at: "2026-10-28T09:00:00Z",
    })),
  });
  assert.equal(plan.status, "finished");
  assert.equal(plan.focus, null);
  assert.equal(plan.dailyQuota, 0);
  assert.equal(plan.remainingQuestions, 0);
});

test("没题可做也没有终点时，不假装「已完成」", () => {
  const plan = buildDailyPlan({ ...BASE, questions: [], endsAt: null, totalHours: null });
  assert.equal(plan.status, "no-deadline");
  assert.equal(plan.focus, null);
});

test("没设终点日：状态是「没有终点」，不是「时间够」", () => {
  const plan = buildDailyPlan({ ...BASE, endsAt: null });
  assert.equal(plan.status, "no-deadline");
  assert.equal(plan.daysLeft, null);
  assert.equal(plan.hoursAvailable, null);
});

test("有终点但没设每周投入：状态是「判断不了」，不是默认够", () => {
  const plan = buildDailyPlan({ ...BASE, weeklyHours: null });
  assert.equal(plan.status, "no-hours-set");
  assert.equal(plan.hoursAvailable, null);
  assert.equal(plan.hoursNeeded, 180);
});

test("时间够与时间紧分别报出来，差值算清楚", () => {
  // 206 天 ≈ 29.4 周；每周 13 小时 → 约 383 小时，需要 180 小时
  const enough = buildDailyPlan(BASE);
  assert.equal(enough.status, "on-track");
  assert.equal(enough.hoursAvailable, 383);
  assert.equal(enough.hoursNeeded, 180);

  // 每周 2 小时 → 约 59 小时，不够。要赶上得每周约 7 小时（180 ÷ 29.4 周）
  const tight = buildDailyPlan({ ...BASE, weeklyHours: 2 });
  assert.equal(tight.status, "tight");
  assert.equal(tight.hoursAvailable, 59);
  assert.equal(tight.weeklyHoursNeeded, 7);
  assert.match(tight.headline, /差 121 小时/);
  assert.match(tight.headline, /每周得投约 7 小时/);
});

test("终点已过：明确说已过几天，并催补齐剩余题", () => {
  const plan = buildDailyPlan({ ...BASE, endsAt: "2026-10-20" });
  assert.equal(plan.status, "overdue");
  assert.equal(plan.daysLeft, -8);
  assert.match(plan.headline, /终点已过 8 天/);
});

test("练得比日历慢时，计划位置已经跑到实际位置前面", () => {
  // 起点 100 天前、终点 50 天后：日历落在第 2 个模块，但一道题都没做
  const plan = buildDailyPlan({
    ...BASE,
    startedAt: "2026-07-20",
    endsAt: "2026-12-17",
    now: NOW,
  });
  assert.equal(plan.plannedModuleId, "S3");
  assert.equal(plan.actualModuleId, "S1");
});

test("模块没有题时跳过它，不让空模块占住「今天在哪个模块」", () => {
  const plan = buildDailyPlan({
    ...BASE,
    modules: [
      { id: "S1", name: "空模块", order_index: 1, planned_hours: 90 },
      { id: "S3", name: "有题模块", order_index: 2, planned_hours: 90 },
    ],
    // S1 一道题都没有——题库还没出满时的真实情况
    questions: [{ id: "Q4", module_id: "S3", level: 1 }],
  });
  assert.equal(plan.actualModuleId, "S3");
  assert.deepEqual(plan.focus?.questionIds, ["Q4"]);
});

test("没标层级或层级越界的题不进口袋，但也不算已完成", () => {
  const plan = buildDailyPlan({
    ...BASE,
    questions: [
      { id: "Q1", module_id: "S1", level: null },
      { id: "Q2", module_id: "S1", level: 9 },
      { id: "Q3", module_id: null, level: 1 },
    ],
  });
  assert.equal(plan.focus, null);
  assert.equal(plan.remainingQuestions, 3);
});

// ── 天数分配 ────────────────────────────────────────────

test("模块天数按工时占比摊，累加正好铺满全程不留缝", () => {
  const days = allocateModuleDays(
    [
      { id: "A", name: "A", order_index: 1, planned_hours: 90 },
      { id: "B", name: "B", order_index: 2, planned_hours: 30 },
    ],
    120,
  );
  assert.deepEqual(days.get("A"), { start: 1, end: 90 });
  assert.deepEqual(days.get("B"), { start: 91, end: 120 });
});

test("只要有一个模块没写工时，就整体按模块数均分", () => {
  const days = allocateModuleDays(
    [
      { id: "A", name: "A", order_index: 1, planned_hours: 90 },
      { id: "B", name: "B", order_index: 2, planned_hours: null },
    ],
    100,
  );
  assert.deepEqual(days.get("A"), { start: 1, end: 50 });
  assert.deepEqual(days.get("B"), { start: 51, end: 100 });
});

test("总天数为 0 或负数时不分天数，不返回半个区间", () => {
  assert.equal(allocateModuleDays(MODULES, 0).size, 0);
  assert.equal(allocateModuleDays(MODULES, -5).size, 0);
  assert.equal(allocateModuleDays([], 100).size, 0);
});

test("起点日就是今天时算第 1 天，不是第 0 天", () => {
  assert.equal(buildDailyPlan({ ...BASE, startedAt: "2026-10-28" }).dayIndex, 1);
});

test("开始日还在未来时不出现第 0 天或负数天", () => {
  const plan = buildDailyPlan({ ...BASE, startedAt: "2026-11-05" });
  assert.equal(plan.dayIndex, 1);
});

// ── 最新作答口径 ────────────────────────────────────────

test("同一道题多条记录只留最新一次", () => {
  const latest = latestAttempts([
    { question_id: "Q1", is_correct: false, created_at: "2026-10-01T09:00:00Z" },
    { question_id: "Q1", is_correct: true, created_at: "2026-10-02T09:00:00Z" },
    { question_id: "Q1", is_correct: false, created_at: "2026-10-01T10:00:00Z" },
  ]);
  assert.equal(latest.get("Q1")?.correct, true);
});
