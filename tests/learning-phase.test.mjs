// M2.6 周节奏的单测。纯函数，全部用固定日期。
//
// 重点压在三处：
// 1. `resolvePhase` 的五种边界——段首日、段末日、早于第一段、晚于最后一段、缝里。
//    这几种错法都不会报错，只会让界面显示一句悄悄错掉的话，必须钉死。
// 2. 非法输入一律返回 null 且不抛错——配置坏了不该让今日计划整块挂掉。
// 3. `autoSplitPhases` 切出来的四段必须首尾相接、最后一段收在目标日。
//    这里错一天，用户看到的是「冲刺期少了一天」，但没人会去数。

import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_PHASES,
  PHASE_WEEK_WEIGHTS,
  autoSplitPhases,
  describePhase,
  normalizePhases,
  parsePhases,
  resolvePhase,
} from "../src/lib/learning/phase.ts";

// 四段，首尾相接，每段正好 14 天（2 周）
const PHASES = [
  { key: "kickoff", name: "启动期", start: "2026-10-01", end: "2026-10-14", milestone: null },
  {
    key: "foundation",
    name: "基础期",
    start: "2026-10-15",
    end: "2026-10-28",
    milestone: { date: "2026-10-26", label: "摸底模考" },
  },
  { key: "intensive", name: "强化期", start: "2026-10-29", end: "2026-11-11", milestone: null },
  { key: "sprint", name: "冲刺期", start: "2026-11-12", end: "2026-11-25", milestone: null },
];

// ── 五种边界 ─────────────────────────────────────────────

test("resolvePhase 在段首日给出 inside 与第 1 周", () => {
  const phase = resolvePhase(PHASES, "2026-10-15");
  assert.ok(phase);
  assert.equal(phase.name, "基础期");
  assert.equal(phase.state, "inside");
  assert.equal(phase.weekIndex, 1);
});

test("resolvePhase 在段末日仍算这一段（含首尾），不是下一段", () => {
  const phase = resolvePhase(PHASES, "2026-10-28");
  assert.ok(phase);
  assert.equal(phase.name, "基础期");
  assert.equal(phase.state, "inside");
  // 10-15 起算，10-28 是第 14 天 → 第 2 周
  assert.equal(phase.weekIndex, 2);
  assert.equal(phase.daysLeftInPhase, 1);
});

test("resolvePhase 早于第一段时返回第一段并标 before，不返回 null", () => {
  const phase = resolvePhase(PHASES, "2026-09-20");
  assert.ok(phase);
  assert.equal(phase.name, "启动期");
  assert.equal(phase.state, "before");
  // 9-20 到 10-01 是 11 天
  assert.equal(phase.daysUntilStart, 11);
  // before 时不出现「第 0 周」
  assert.equal(phase.weekIndex, 1);
});

test("resolvePhase 晚于最后一段时返回最后一段并标 after，不返回 null", () => {
  const phase = resolvePhase(PHASES, "2026-12-05");
  assert.ok(phase);
  assert.equal(phase.name, "冲刺期");
  assert.equal(phase.state, "after");
  // 11-25 到 12-05 是 10 天
  assert.equal(phase.daysSinceEnd, 10);
  assert.equal(phase.daysLeftInPhase, 0);
});

test("resolvePhase 落在两段之间的缝里时归到前一段并标 after", () => {
  // 故意造一个有空档的配置：10-14 结束、10-20 才开始下一段
  const gapped = [
    { key: "a", name: "启动期", start: "2026-10-01", end: "2026-10-14", milestone: null },
    { key: "b", name: "基础期", start: "2026-10-20", end: "2026-10-31", milestone: null },
  ];
  const phase = resolvePhase(gapped, "2026-10-17");
  assert.ok(phase);
  // 归到前一段，不是后一段——后一段还没开始，说「第 1 周」是假的
  assert.equal(phase.name, "启动期");
  assert.equal(phase.state, "after");
  assert.equal(phase.daysSinceEnd, 3);
});

// ── 非法输入 ─────────────────────────────────────────────

test("resolvePhase 对空数组、null、非数组都返回 null 且不抛错", () => {
  assert.equal(resolvePhase([], "2026-10-20"), null);
  assert.equal(resolvePhase(null, "2026-10-20"), null);
  // parsePhases 挡住非数组
  assert.equal(parsePhases("不是数组"), null);
  assert.equal(parsePhases(null), null);
  assert.equal(parsePhases([1, 2, 3]), null);
});

test("parsePhases 丢掉缺字段与起止颠倒的那一段，其余保留", () => {
  const parsed = parsePhases([
    { key: "a", name: "好的", start: "2026-10-01", end: "2026-10-14", milestone: null },
    // 缺 end
    { key: "b", name: "缺结束", start: "2026-10-15" },
    // 起大于止
    { key: "c", name: "颠倒", start: "2026-11-01", end: "2026-10-01" },
    { key: "d", name: "也行", start: "2026-10-20", end: "2026-10-31", milestone: null },
  ]);
  assert.ok(parsed);
  assert.equal(parsed.length, 2);
  assert.deepEqual(
    parsed.map((phase) => phase.name),
    ["好的", "也行"],
  );
});

test("parsePhases 把没有名字的一段标成未命名，不整份丢掉", () => {
  const parsed = parsePhases([{ start: "2026-10-01", end: "2026-10-14" }]);
  assert.ok(parsed);
  assert.equal(parsed[0].name, "未命名阶段");
});

test("parsePhases 只保留有日期也有说明的里程碑", () => {
  const withDateOnly = parsePhases([
    {
      name: "基础期",
      start: "2026-10-01",
      end: "2026-10-14",
      milestone: { date: "2026-10-10" },
    },
  ]);
  assert.ok(withDateOnly);
  // 只有日期、没有「要达成什么」，这条没信息量
  assert.equal(withDateOnly[0].milestone, null);

  const full = parsePhases([
    {
      name: "基础期",
      start: "2026-10-01",
      end: "2026-10-14",
      milestone: { date: "2026-10-10", label: "摸底模考" },
    },
  ]);
  assert.ok(full);
  assert.deepEqual(full[0].milestone, { date: "2026-10-10", label: "摸底模考" });
});

test("parsePhases 段数超过上限时截断而不是拒绝", () => {
  const many = Array.from({ length: MAX_PHASES + 4 }, (_, index) => ({
    key: `p${index}`,
    name: `第${index}段`,
    start: "2026-10-01",
    end: "2026-10-02",
    milestone: null,
  }));
  const parsed = parsePhases(many);
  assert.ok(parsed);
  assert.equal(parsed.length, MAX_PHASES);
});

// ── 保存归一化 ────────────────────────────────────────────

test("normalizePhases 按开始日排序，不改日期本身", () => {
  const result = normalizePhases([
    { name: "冲刺期", start: "2026-11-12", end: "2026-11-25" },
    { name: "启动期", start: "2026-10-01", end: "2026-10-14" },
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.phases.map((phase) => phase.name),
    ["启动期", "冲刺期"],
  );
});

test("normalizePhases 对起止颠倒拒绝保存并指出第几行，不静默调换", () => {
  const result = normalizePhases([
    { name: "启动期", start: "2026-10-01", end: "2026-10-14" },
    { name: "基础期", start: "2026-11-01", end: "2026-10-01" },
  ]);
  assert.equal(result.ok, false);
  if (result.ok) return;
  // 行号按用户看到的顺序（1 起），不是排序后的位置
  assert.match(result.error, /第 2 行/);
});

test("normalizePhases 对缺名字、缺日期分别给出不同的提示", () => {
  const noName = normalizePhases([{ start: "2026-10-01", end: "2026-10-14" }]);
  assert.equal(noName.ok, false);
  if (!noName.ok) assert.match(noName.error, /起名字/);

  const noDate = normalizePhases([{ name: "启动期", start: "2026-10-01" }]);
  assert.equal(noDate.ok, false);
  if (!noDate.ok) assert.match(noDate.error, /起止日期/);
});

test("normalizePhases 允许存空数组（等于清空阶段）", () => {
  const result = normalizePhases([]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.phases.length, 0);
});

// ── 自动切分 ─────────────────────────────────────────────

test("autoSplitPhases 首尾相接、无缝隙、最后一段收在目标日", () => {
  const phases = autoSplitPhases("2027-05-22", "2026-10-29");
  assert.ok(phases);
  assert.equal(phases.length, 4);

  // 第一段从起点开始
  assert.equal(phases[0].start, "2026-10-29");
  // 最后一段收在目标日
  assert.equal(phases[3].end, "2027-05-22");

  // 段间无缝隙：前一段结束的次日就是后一段开始
  for (let index = 0; index < phases.length - 1; index += 1) {
    const cur = phases[index];
    const next = phases[index + 1];
    const [y, m, d] = cur.end.split("-").map(Number);
    const nextDay = new Date(Date.UTC(y, m - 1, d + 1));
    const expected = `${nextDay.getUTCFullYear()}-${String(nextDay.getUTCMonth() + 1).padStart(2, "0")}-${String(nextDay.getUTCDate()).padStart(2, "0")}`;
    assert.equal(next.start, expected, `第 ${index + 1} 段与第 ${index + 2} 段之间有缝`);
  }
});

test("autoSplitPhases 按 8:8:9:5 的比例分，总天数守恒", () => {
  const phases = autoSplitPhases("2027-05-22", "2026-10-29");
  assert.ok(phases);

  const totalWeight = PHASE_WEEK_WEIGHTS.reduce((sum, w) => sum + w, 0);
  // 每段的实际天数应当接近「总天数 × 权重占比」，误差不超过 1 天（取整）
  const spans = phases.map((phase) => {
    const [sy, sm, sd] = phase.start.split("-").map(Number);
    const [ey, em, ed] = phase.end.split("-").map(Number);
    return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000) + 1;
  });
  const totalDays = spans.reduce((sum, span) => sum + span, 0);

  spans.forEach((span, index) => {
    const expected = (totalDays * PHASE_WEEK_WEIGHTS[index]) / totalWeight;
    assert.ok(
      Math.abs(span - expected) <= 1.5,
      `第 ${index + 1} 段 ${span} 天，按比例应约 ${expected.toFixed(1)} 天`,
    );
  });
});

test("autoSplitPhases 没有目标日期时返回 null，不猜一个日期出来", () => {
  assert.equal(autoSplitPhases(null, "2026-10-29"), null);
  assert.equal(autoSplitPhases("", "2026-10-29"), null);
});

test("autoSplitPhases 目标日不在起点之后时返回 null", () => {
  assert.equal(autoSplitPhases("2026-10-01", "2026-10-29"), null);
  assert.equal(autoSplitPhases("2026-10-29", "2026-10-29"), null);
});

test("autoSplitPhases 接受 Date 作为起点", () => {
  const phases = autoSplitPhases("2027-05-22", new Date(2026, 9, 29));
  assert.ok(phases);
  assert.equal(phases[0].start, "2026-10-29");
});

// ── 文案 ─────────────────────────────────────────────────

test("describePhase 进行中给出周序号与里程碑倒计时", () => {
  const phase = resolvePhase(PHASES, "2026-10-20");
  assert.ok(phase);
  const text = describePhase(phase);
  assert.match(text, /基础期/);
  assert.match(text, /第 1 周 \/ 共 2 周/);
  // 10-20 到 10-26 是 6 天
  assert.match(text, /距「摸底模考」还有 6 天/);
});

test("describePhase 在里程碑当天说「今天是」，不说「还有 0 天」", () => {
  const phase = resolvePhase(PHASES, "2026-10-26");
  assert.ok(phase);
  assert.match(describePhase(phase), /今天是「摸底模考」/);
});

test("describePhase 在里程碑已过时不再提它，也不说「晚了几天」", () => {
  const phase = resolvePhase(PHASES, "2026-10-28");
  assert.ok(phase);
  const text = describePhase(phase);
  assert.equal(text.includes("摸底模考"), false);
});

test("describePhase 对 before / after 换措辞，不显示周序号", () => {
  const before = resolvePhase(PHASES, "2026-09-20");
  assert.ok(before);
  const beforeText = describePhase(before);
  assert.match(beforeText, /还没开始，还有 11 天/);
  assert.equal(beforeText.includes("第 1 周"), false);

  const after = resolvePhase(PHASES, "2026-12-05");
  assert.ok(after);
  assert.match(describePhase(after), /已过 10 天/);
});
