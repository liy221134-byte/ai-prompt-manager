// 今日计划：把「380 小时、206 天、118 道题」换算成「今天做这几道」。
//
// 这一层刻意**不假装知道你今天学了几个小时**。系统能观测到的只有答题记录：
// 哪个模块哪一层做了几道、对了几道。看书、看视频、抄笔记用了多久，它一概不知。
// 所以这里算的不是「已投入 3.2 小时」，而是两条互相独立的位置：
//   · 日历位置——按计划，今天该走到哪个模块；
//   · 练习位置——实际练到哪个模块。
// 两者一对照就知道是落后还是超前，不用编一个假工时。

import { LEVELS, daysBetween, type AttemptInput, type Level, type ModuleInput } from "./matrix.ts";
import { resolvePhase, parsePhases, type ResolvedPhase } from "./phase.ts";

// 一天最多建议这么多道。配额按「模块剩余题 ÷ 模块剩余天数」算，
// 落后时会算出很大的数，但不该让人一晚上面对 40 道题。
export const MAX_DAILY_QUESTIONS = 10;

// 诊断结论最多用这么多天。
//
// 诊断是一张快照，不是永久标签：基线诊断做在备考初期，半年后还按它排题等于
// 「拿三个月前的体检报告决定今天吃什么药」。超过这个天数就回落到从第一层起排，
// 并在页面上说清为什么，而不是悄悄换一套规则。
export const DIAGNOSTIC_TTL_DAYS = 30;

export type DailyQuestion = {
  id: string;
  module_id: string | null;
  level: number | null;
};

/**
 * 诊断结论的排题视图。
 *
 * 只带「每个模块判到第几层」，不带原因、不带错题——今日计划要的只是一个起点，
 * 归因那些是诊断结果卡片的事，混进来会让这个纯函数依赖一堆用不上的字段。
 */
export type DailyDiagnostic = {
  /** 诊断完成时间（ISO 字符串） */
  takenAt: string;
  /** 每模块判到第几层。0 表示第 1 层就没过；键缺哪个模块就是没测到 */
  reached: Record<string, number>;
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
  /** 上次诊断结论。没做过就不传，行为与从前一致 */
  diagnostic?: DailyDiagnostic | null;
  /**
   * 阶段划分（M2.6）。直接传库里读出来的原始 jsonb——解析与校验在 phase.ts，
   * 这一层不重复实现一遍规则。不传或传空数组都等于「没设阶段」。
   *
   * **它只影响展示，不影响排题。** 这条是刻意设计的：
   * 阶段日期是估算，拿估算去改题单，等于让一个猜出来的日期决定今天做几道题。
   */
  phases?: unknown;
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
  /** 被诊断豁免的题数：诊断已证明的层，那些题不计入今日必做 */
  skippedQuestions: number;
  /** 诊断结论这次有没有真的参与排题 */
  diagnosticApplied: boolean;
  /** 诊断与排题的关系，一句话。没有诊断或诊断完全没影响排题时为 null */
  diagnosticNote: string | null;
  /**
   * 今天站在哪个阶段的第几周。没设阶段（或配置坏了）时为 null，界面整行不渲染。
   *
   * 界面不显示「未设置阶段」：未设置是常态，不是异常，不用天天提醒。
   */
  phase: ResolvedPhase | null;
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

  const totalDays = endsAt ? daysBetween(startedAt, endsAt) : null;
  const daysLeft = endsAt ? daysBetween(today, endsAt) : null;
  const dayIndex = Math.max(1, daysBetween(startedAt, today) + 1);

  const latest = latestAttempts(input.attempts);
  const modules = input.modules.slice().sort((a, b) => a.order_index - b.order_index);

  // ── 诊断结论：每个模块今天从哪一层起练 ────────────────
  //
  // 语义：reached = N 表示第 N 层及以下已由诊断证明通过 ⇒ 从 N+1 层起练。
  // 跳过的只是「排题」，不是「事实」——矩阵页的对错统计一概不动，
  // 这里只决定今天把哪几道题递到手上。
  const diagnosticDate = input.diagnostic ? toYmdString(input.diagnostic.takenAt) : null;
  const rawAge = diagnosticDate ? daysBetween(diagnosticDate, today) : null;
  // 日期解析失败会得到 NaN。这里顺手归一成 null，否则后面会写出「已过 NaN 天」。
  const diagnosticAge = rawAge != null && Number.isFinite(rawAge) ? rawAge : null;
  // 日期算出来是负数（时区或手改过系统时间）说明就是刚做的，按生效处理，
  // 不因为差了一天就让整份结论作废。
  const diagnosticApplied =
    Boolean(input.diagnostic) && diagnosticAge != null && diagnosticAge <= DIAGNOSTIC_TTL_DAYS;

  const floors = new Map<string, number>();
  if (diagnosticApplied && input.diagnostic) {
    for (const [moduleId, reached] of Object.entries(input.diagnostic.reached)) {
      // 裁到 1—5：reached=0 时仍是第 1 层（没有可跳的），reached=5 时没有第 6 层
      floors.set(moduleId, Math.min(5, Math.max(1, (Number(reached) || 0) + 1)));
    }
  }

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

  /**
   * 这道题今天算不算「不用做」。
   *
   * 只对诊断已证明的层生效，且题目必须标了层级：没标层级的题归不进任何一层，
   * 宁可多做一道，也不凭空跳过一道——那等于拿「不知道」当「已经会了」。
   */
  const isSkipped = (question: DailyQuestion) => {
    if (!diagnosticApplied || !question.module_id) return false;
    const floor = floors.get(question.module_id);
    if (!floor || floor <= 1) return false;
    if (question.level == null) return false;
    // 答错过的题不豁免。诊断是抽样结论，错题是确凿发生过的事实——
    // 两者冲突时以错题为准：诊断说这层整体过了，但这一道确实错了，
    // 恰恰是没过的地方，把它一起跳掉等于把最该复的题藏起来。
    const attempt = latest.get(question.id);
    if (attempt && !attempt.correct) return false;
    return question.level < floor;
  };

  let doneQuestions = 0;
  let remainingQuestions = 0;
  let skippedQuestions = 0;
  for (const question of input.questions) {
    if (isDone(question.id)) doneQuestions += 1;
    else if (isSkipped(question)) skippedQuestions += 1;
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
  // 第一个还有「真该做」的题的模块。做题顺序从低层到高层，模块做完才往后走。
  // 判的是「未做 且 未被诊断豁免」：整块都被豁免的模块等于今天没活，该往后走。
  let actualModule: ModuleInput | null = null;
  for (const currentModule of modules) {
    const pool = byModule.get(currentModule.id) ?? [];
    if (pool.some((q) => !isDone(q.id) && !isSkipped(q))) {
      actualModule = currentModule;
      break;
    }
  }

  // ── 今日建议 ──────────────────────────────────────────
  let focus: DailyFocus | null = null;
  let dailyQuota = 0;

  if (actualModule) {
    const pool = (byModule.get(actualModule.id) ?? []).slice().sort((a, b) => a.id.localeCompare(b.id));
    const moduleRemaining = pool.filter((q) => !isDone(q.id) && !isSkipped(q)).length;
    const range = dayRanges.get(actualModule.id);
    // 模块的日历窗口已经走完时，按「今天必须补完」算，配额顶到上限
    const daysLeftInModule = range ? Math.max(1, range.end - dayIndex + 1) : Math.max(1, daysLeft ?? 1);
    dailyQuota = Math.min(MAX_DAILY_QUESTIONS, Math.max(1, Math.ceil(moduleRemaining / daysLeftInModule)));

    // 诊断说这一块已经过了几层，就从下一层起找题。
    // 只有「这一块有诊断」才抬高起点，别的模块照旧从第 1 层起。
    const startLevel = floors.get(actualModule.id) ?? 1;

    // 起练层以下还压着答错过的题：它们不豁免（见 isSkipped），
    // 所以焦点得能退回那一层，否则永远是「从第 3 层起找、错题在第 1 层、一辈子轮不到」。
    const owedWrongLevels = pool
      .filter((q) => !isDone(q.id) && q.level != null && q.level < startLevel)
      .filter((q) => {
        const attempt = latest.get(q.id);
        return Boolean(attempt) && !attempt!.correct;
      })
      .map((q) => q.level as number);
    const fromLevel = (owedWrongLevels.length > 0
      ? Math.min(...owedWrongLevels)
      : startLevel) as Level;

    for (const level of LEVELS) {
      if (level < fromLevel) continue;
      // 没标层级的题仍然不进口袋：层号是「今天在练第几层」的唯一依据，
      // 把归不进层级的题混进来，这个层号就说不清是什么了。
      const inLevel = pool.filter((q) => q.level === level);
      if (inLevel.length === 0) continue;

      const wrong = inLevel.filter((q) => {
        const attempt = latest.get(q.id);
        return Boolean(attempt) && !attempt!.correct;
      });
      // 起练层以下只收错题：那一层没做过的题已被诊断豁免，不能顺着一起捞回来
      const fresh = level < startLevel ? [] : inLevel.filter((q) => !latest.has(q.id));
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
    for (const currentModule of modules) {
      const pool = byModule.get(currentModule.id) ?? [];
      const planned = currentModule.planned_hours ?? 0;
      if (planned <= 0 || pool.length === 0) continue;
      const done = pool.filter((q) => isDone(q.id) || isSkipped(q)).length;
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

  // ── 诊断与排题的关系，说清一句 ────────────────────────
  // 只说两种会改变行为的情况：跳题、过期。诊断生效但一层都没跳时不写，
  // 否则每次打开都多一行无信息量的说明。
  let diagnosticNote: string | null = null;
  if (diagnosticApplied && skippedQuestions > 0) {
    diagnosticNote =
      `按 ${diagnosticDate} 的诊断，已通过的层有 ${skippedQuestions} 道没做过的题不再计入今日必做` +
      "（矩阵里照样看得见，想巩固随时能做）。";
  } else if (input.diagnostic && !diagnosticApplied && diagnosticAge != null) {
    diagnosticNote =
      `上次诊断是 ${diagnosticDate}，已经 ${diagnosticAge} 天，排题先回到从第一层起；` +
      "建议做完这一轮再复测一次。";
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
    skippedQuestions,
    diagnosticApplied,
    diagnosticNote,
    // 阶段只回答「今天在第几段的第几周」，不参与上面的任何一步计算。
    // 放在返回值最前面算出来也无妨，但写在这里是为了让「它没影响排题」一眼可见。
    phase: resolvePhase(parsePhases(input.phases), today),
    dailyQuota,
    focus,
    hoursNeeded,
    hoursAvailable,
    weeklyHoursNeeded,
    status,
    headline,
  };
}
