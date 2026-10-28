// 今日计划：把「380 小时、206 天、118 道题」换算成「今天做这几道」。
//
// 这一层刻意**不假装知道你今天学了几个小时**。系统能观测到的只有答题记录：
// 哪个模块哪一层做了几道、对了几道。看书、看视频、抄笔记用了多久，它一概不知。
// 所以这里算的不是「已投入 3.2 小时」，而是两条互相独立的位置：
//   · 日历位置——按计划，今天该走到哪个模块；
//   · 练习位置——实际练到哪个模块。
// 两者一对照就知道是落后还是超前，不用编一个假工时。

import type { AttemptInput, Level, ModuleInput } from "./matrix";

// 一天最多建议这么多道。配额按「模块剩余题 ÷ 模块剩余天数」算，
// 落后时会算出很大的数，但不该让人一晚上面对 40 道题。
export const MAX_DAILY_QUESTIONS = 10;

export type DailyQuestion = {
  id: string;
  module_id: string | null;
  level: number | null;
};

export type DailyPlanInput = {
  modules: ModuleInput[];
  questions: DailyQuestion[];
  attempts: AttemptInput[];
  /** 主题计划总工时（主题包里的 total_hours） */
  totalHours?: number | null;
  /** 起点日。优先用个人目标的 started_at，其次主题的 start_date */
  startedAt?: string | null;
  /** 终点日。优先用个人目标的 target_date，其次主题的 deadline */
  endsAt?: string | null;
  /** 每周可投入小时。个人安排，没设就没法判断时间来不来得及 */
  weeklyHours?: number | null;
  now?: Date;
};

export type DailyFocus = {
  moduleId: string;
  moduleName: string;
  level: Level;
  /** 今天该做的题，错题排在前 */
  questionIds: string[];
  /** 这批里有没有错题。有的话界面上要说清「先复错题」而不是「做新题」 */
  hasWrongOnes: boolean;
};

/**
 * 时间够不够。刻意分成六种，而不是一个布尔：
 * 「没设终点」「没设每周投入」都不是「时间够」，混进一个 true/false 会误导。
 */
export type DailyPlanStatus =
  | "finished"
  | "overdue"
  | "no-deadline"
  | "no-hours-set"
  | "on-track"
  | "tight";

export type DailyPlan = {
  startedAt: string;
  endsAt: string | null;
  /** 今天是第几天（从起点算，1 起） */
  dayIndex: number;
  /** 起点到终点共几天 */
  totalDays: number | null;
  /** 距终点还有几天，负数表示已过 */
  daysLeft: number | null;
  /** 按日历今天该在的模块 */
  plannedModuleId: string | null;
  plannedModuleName: string | null;
  /** 实际练到的模块（第一个还有未做题的） */
  actualModuleId: string | null;
  actualModuleName: string | null;
  doneQuestions: number;
  remainingQuestions: number;
  /** 今天建议做几道 */
  dailyQuota: number;
  focus: DailyFocus | null;
  /** 剩余还需要多少小时（按练习覆盖折算，不是真实学习时长） */
  hoursNeeded: number | null;
  /** 到终点前还能投入多少小时 */
  hoursAvailable: number | null;
  /** 要赶上进度，每周至少得投多少小时。只在时间紧时才有意义 */
  weeklyHoursNeeded: number | null;
  status: DailyPlanStatus;
  /** 关于时间够不够的一句话结论 */
  headline: string;
};

/** 同一题做多次以最新一次为准。ISO 字符串可直接按字典序比，不必转 Date */
export function latestAttempts(attempts: AttemptInput[]): Map<string, { correct: boolean; at: string }> {
  const latest = new Map<string, { correct: boolean; at: string }>();
  for (const attempt of attempts) {
    const prev = latest.get(attempt.question_id);
    if (!prev || attempt.created_at > prev.at) {
      latest.set(attempt.question_id, { correct: attempt.is_correct, at: attempt.created_at });
    }
  }
  return latest;
}

function toYmdString(value: Date | string): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const date = typeof value === "string" ? new Date(value) : value;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 两个日期差几个自然日。与 matrix.ts 的 daysUntil 同一口径，这里只接受已规范化的日期 */
function diffDays(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/**
 * 把总天数按工时占比摊给各模块，得出每个模块占第几天到第几天。
 *
 * 为什么要摊：模块页上只写「S1 预算 90 小时」，但人看的是日历。
 * 「今天是第 3 天，第 1—49 天都该在 S1」比「S1 还剩 86 小时」更能指导行动。
 *
 * 只要有一个模块没写 planned_hours，就整体退化成按模块数均分——
 * 部分有工时会导致没工时的模块占 0 天，凭空跳过它。
 */
export function allocateModuleDays(
  modules: ModuleInput[],
  totalDays: number,
): Map<string, { start: number; end: number }> {
  const result = new Map<string, { start: number; end: number }>();
  if (totalDays <= 0 || modules.length === 0) return result;

  const sorted = modules.slice().sort((a, b) => a.order_index - b.order_index);
  const allHaveHours = sorted.every((m) => (m.planned_hours ?? 0) > 0);
  const weights = sorted.map((m) => (allHaveHours ? (m.planned_hours as number) : 1));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  let cursor = 0;
  sorted.forEach((module, index) => {
    const share = (weights[index] / totalWeight) * totalDays;
    const start = Math.floor(cursor) + 1;
    cursor += share;
    const isLast = index === sorted.length - 1;
    // 最后一块一定收在 totalDays，否则浮点误差会留一天的缝
    const end = isLast ? totalDays : Math.max(start, Math.floor(cursor));
    result.set(module.id, { start, end });
  });

  return result;
}

export function buildDailyPlan(input: DailyPlanInput): DailyPlan {
  const now = input.now ?? new Date();
  const today = toYmdString(now);
  const startedAt = input.startedAt ? toYmdString(input.startedAt) : today;
  const endsAt = input.endsAt ? toYmdString(input.endsAt) : null;

  const totalDays = endsAt ? diffDays(startedAt, endsAt) : null;
  const daysLeft = endsAt ? diffDays(today, endsAt) : null;
  const dayIndex = Math.max(1, diffDays(startedAt, today) + 1);

  const latest = latestAttempts(input.attempts);
  const modules = input.modules.slice().sort((a, b) => a.order_index - b.order_index);

  // 每题归到哪个模块，以及它算不算「已完成」。
  // 做错过又重做对了，以最新一次为准——错题不是终身标签。
  const byModule = new Map<string, DailyQuestion[]>();
  for (const question of input.questions) {
    if (!question.module_id) continue;
    if (!byModule.has(question.module_id)) byModule.set(question.module_id, []);
    byModule.get(question.module_id)!.push(question);
  }

  const isDone = (questionId: string) => {
    const attempt = latest.get(questionId);
    return Boolean(attempt?.correct);
  };

  let doneQuestions = 0;
  let remainingQuestions = 0;
  for (const question of input.questions) {
    if (isDone(question.id)) doneQuestions += 1;
    else remainingQuestions += 1;
  }

  // ── 日历位置 ──────────────────────────────────────────
  const dayRanges = totalDays ? allocateModuleDays(modules, Math.max(1, totalDays)) : new Map();
  let plannedModule: ModuleInput | null = null;
  if (dayRanges.size > 0) {
    plannedModule =
      modules.find((m) => {
        const range = dayRanges.get(m.id);
        return range ? dayIndex >= range.start && dayIndex <= range.end : false;
      }) ??
      // 超出计划尾声时仍停在最后一个模块，不凭空指向空
      modules[modules.length - 1] ??
      null;
  }

  // ── 练习位置 ──────────────────────────────────────────
  // 第一个还有未做题的模块。做题顺序从低层到高层，模块做完才往后走。
  let actualModule: ModuleInput | null = null;
  for (const module of modules) {
    const pool = byModule.get(module.id) ?? [];
    if (pool.some((q) => !isDone(q.id))) {
      actualModule = module;
      break;
    }
  }

  // ── 今日建议 ──────────────────────────────────────────
  let focus: DailyFocus | null = null;
  let dailyQuota = 0;

  if (actualModule) {
    const pool = (byModule.get(actualModule.id) ?? []).slice().sort((a, b) => a.id.localeCompare(b.id));
    const moduleRemaining = pool.filter((q) => !isDone(q.id)).length;
    const range = dayRanges.get(actualModule.id);
    // 模块的日历窗口已经走完时，按「今天必须补完」算，配额顶到上限
    const daysLeftInModule = range ? Math.max(1, range.end - dayIndex + 1) : Math.max(1, daysLeft ?? 1);
    dailyQuota = Math.min(MAX_DAILY_QUESTIONS, Math.max(1, Math.ceil(moduleRemaining / daysLeftInModule)));

    for (const level of [1, 2, 3, 4, 5] as Level[]) {
      const inLevel = pool.filter((q) => q.level === level);
      if (inLevel.length === 0) continue;

      const wrong = inLevel.filter((q) => {
        const attempt = latest.get(q.id);
        return Boolean(attempt) && !attempt!.correct;
      });
      const fresh = inLevel.filter((q) => !latest.has(q.id));
      if (wrong.length + fresh.length === 0) continue;

      focus = {
        moduleId: actualModule.id,
        moduleName: actualModule.name,
        level,
        // 错题在前：已经错过的题信息量最大，重做一遍比多做一道新题值
        questionIds: [...wrong, ...fresh].slice(0, dailyQuota).map((q) => q.id),
        hasWrongOnes: wrong.length > 0,
      };
      break;
    }
  }

  // ── 时间够不够 ────────────────────────────────────────
  // 已覆盖工时按练习覆盖比例折算。这是估算，不是真实学习时长：
  // 它只用来说明「按现在的推进速度，剩下的时间够不够」。
  let hoursCovered = 0;
  if (input.totalHours) {
    for (const module of modules) {
      const pool = byModule.get(module.id) ?? [];
      const planned = module.planned_hours ?? 0;
      if (planned <= 0 || pool.length === 0) continue;
      const done = pool.filter((q) => isDone(q.id)).length;
      hoursCovered += planned * (done / pool.length);
    }
  }

  const hoursNeeded =
    input.totalHours != null ? Math.max(0, Math.round(input.totalHours - hoursCovered)) : null;
  const hoursAvailable =
    input.weeklyHours != null && input.weeklyHours > 0 && daysLeft != null && daysLeft >= 0
      ? Math.round((input.weeklyHours * daysLeft) / 7)
      : null;

  let status: DailyPlanStatus;
  let headline: string;

  // 要赶上进度每周得投多少小时。只算「还来得及」的情况：
  // 终点已过、没设终点、没设每周投入时，这个数没有解释意义。
  const weeklyHoursNeeded =
    hoursNeeded != null && daysLeft != null && daysLeft > 0
      ? Math.ceil(hoursNeeded / (daysLeft / 7))
      : null;

  if (remainingQuestions === 0 && input.questions.length > 0) {
    status = "finished";
    headline = "这个目标的题都做完了，接下来只复错题、做整套模拟";
  } else if (daysLeft == null) {
    status = "no-deadline";
    headline = "没设终点日期，按模块顺序往下推进";
  } else if (daysLeft < 0) {
    status = "overdue";
    headline = `终点已过 ${-daysLeft} 天，把剩下的 ${remainingQuestions} 道题补齐再定新日期`;
  } else if (hoursNeeded == null || hoursAvailable == null) {
    status = "no-hours-set";
    headline = "还没设每周可投入时间，判断不了到终点前来不来得及";
  } else if (hoursAvailable >= hoursNeeded * 1.1) {
    status = "on-track";
    headline = `时间够：还需约 ${hoursNeeded} 小时，到终点前可投入约 ${hoursAvailable} 小时`;
  } else {
    status = "tight";
    // 只说「差 81 小时」不够用——要给出能改的那个数：每周得投几小时
    headline =
      `时间紧：还需约 ${hoursNeeded} 小时，只剩约 ${hoursAvailable} 小时可投入，差 ${hoursNeeded - hoursAvailable} 小时` +
      (weeklyHoursNeeded != null ? `；要赶上每周得投约 ${weeklyHoursNeeded} 小时` : "");
  }

  return {
    startedAt,
    endsAt,
    dayIndex,
    totalDays,
    daysLeft,
    plannedModuleId: plannedModule?.id ?? null,
    plannedModuleName: plannedModule?.name ?? null,
    actualModuleId: actualModule?.id ?? null,
    actualModuleName: actualModule?.name ?? null,
    doneQuestions,
    remainingQuestions,
    dailyQuota,
    focus,
    hoursNeeded,
    hoursAvailable,
    weeklyHoursNeeded,
    status,
    headline,
  };
}
