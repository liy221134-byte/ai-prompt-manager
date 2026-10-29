// 周节奏（阶段与里程碑）：M2.6。
//
// 这一层只做一件事：**把「目标」切成几段，然后回答今天站在哪一段的第几周**。
// 不碰题、不碰配额、不碰模块摊派——那些在 daily-plan.ts 里，两者互不依赖。
//
// 为什么阶段由日期现算而不是存一个「当前在第几段」：
//   存了就得每天维护一次，漏一天就错一天；算出来的永远是对的。
//
// 为什么不做门禁（不到基础期就不让做某个模块的题）：
//   阶段日期是估算，模块工时也是估算，两个估算互相约束只会放大误差；
//   而且它会把「今天有空想多学」变成「系统不让」。计划的语义是建议，不是许可。
//
// 为什么不与模块摊派做强一致校验：
//   阶段是人的外框，模块窗口是按工时分的内框，两者错开是常态。
//   每日弹一条「阶段与模块不一致」等于噪声。产品已经在用「两套位置并列」
//   （plannedModule vs actualModule），这里沿用同一个态度。

import { daysBetween } from "./matrix.ts";

/** 一个里程碑：哪天要做成什么 */
export type PhaseMilestone = {
  date: string;
  label: string;
};

/** 一段。start / end 都是 YYYY-MM-DD */
export type Phase = {
  key: string;
  name: string;
  start: string;
  end: string;
  milestone: PhaseMilestone | null;
};

/** 阶段数上限。数据库侧有同一个上限的约束（见迁移），两边一致 */
export const MAX_PHASES = 8;

/**
 * 四段的比例，共 30 周：8 : 8 : 9 : 5。
 *
 * 这个比例**不是拍脑袋**：2026-10-28 读到的飞书「备考周计划」表就是
 * 8 / 8 / 9 / 4+1 周，共 30 周。替换成别的比例只需改这里一个常量。
 *
 * 但**不照抄那张表的日期**：它是 30 周的高项排布，
 * 中项从现在到 2027-05-22 只有约 28.6 周。抄日期＝把别人的日历套到自己头上。
 * 日期一律由目标日期现算，比例才是可以复用的那部分。
 */
export const PHASE_WEEK_WEIGHTS = [8, 8, 9, 5] as const;

/** 四段的默认名字与 key，与权重一一对应 */
const PHASE_TEMPLATE = [
  { key: "kickoff", name: "启动期" },
  { key: "foundation", name: "基础期" },
  { key: "intensive", name: "强化期" },
  { key: "sprint", name: "冲刺期" },
] as const;

/**
 * 今天在第几段、第几周、离里程碑还有几天。
 *
 * `state` 三种：还没开始 / 正在进行 / 已经过了。
 * **不用「落在任何段之外」这种状态**：那样界面上会有一整行突然消失，
 * 让人以为功能坏了。日期在两端时夹到第一段或最后一段，再用 state 说清。
 */
export type ResolvedPhase = {
  /** 第几段，0 起 */
  index: number;
  name: string;
  start: string;
  end: string;
  /** 本段第几周，1 起。从本段起点算，不从整个目标起点算——
   *  「启动期第 3 周」比「目标第 24 天」好读 */
  weekIndex: number;
  /** 本段共几周 */
  weeksTotal: number;
  /** 本段还剩几天（含今天）。state 为 after 时是 0 */
  daysLeftInPhase: number;
  /** 下一段的起点，最后一段为 null */
  nextPhaseStart: string | null;
  milestone: PhaseMilestone | null;
  /** 距本段里程碑还有几天，负数表示已过。没有里程碑时为 null */
  daysToMilestone: number | null;
  /**
   * 距本段起点还有几天（只在 state 为 before 时有意义）。
   *
   * 不在 describePhase 里现算，是因为那里拿不到「今天」——
   * 传进来一个 today 参数会让这个纯展示函数多一个必填项，
   * 而调用方每次都得记得传，忘了就是 NaN。算在 build 里只算一次。
   */
  daysUntilStart: number;
  /** 本段结束至今过了几天（只在 state 为 after 时有意义） */
  daysSinceEnd: number;
  state: "before" | "inside" | "after";
};

function toYmd(value: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
}

/**
 * 把库里读出来的裸数据收成 `Phase[]`。
 *
 * 返回 null 有两种触发：整个不是数组（含 null），或者一段都收不出来。
 * **收不出来不等于配置坏了**：新目标就是空的，界面整行不渲染即可。
 * 这里返回 null 而不抛错，是因为「没有阶段」是常态，不是异常。
 *
 * 单段脏数据的处理是**丢掉那一段**而不是整份作废：四段里有一段缺日期，
 * 丢三留一还能用；整份作废等于因为他手滑少填一个格子，功能就整个消失了。
 */
export function parsePhases(value: unknown): Phase[] | null {
  if (!Array.isArray(value)) return null;

  const parsed: Phase[] = [];
  for (const item of value.slice(0, MAX_PHASES)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;

    const start = typeof row.start === "string" ? toYmd(row.start) : "";
    const end = typeof row.end === "string" ? toYmd(row.end) : "";
    if (!start || !end) continue;
    // 起止颠倒的一段直接丢：它会让后面所有日期计算变成负数
    if (start > end) continue;

    const name = typeof row.name === "string" ? row.name.trim().slice(0, 20) : "";
    const key = typeof row.key === "string" && row.key.trim() ? row.key.trim().slice(0, 20) : start;

    parsed.push({
      key,
      name: name || "未命名阶段",
      start,
      end,
      milestone: parseMilestone(row.milestone),
    });
  }

  return parsed.length > 0 ? parsed : null;
}

function parseMilestone(value: unknown): PhaseMilestone | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const date = typeof row.date === "string" ? toYmd(row.date) : "";
  const label = typeof row.label === "string" ? row.label.trim().slice(0, 30) : "";
  // 只有日期、没有「要达成什么」，这条里程碑没有信息量
  if (!date || !label) return null;
  return { date, label };
}

/**
 * 保存前的归一化：排序、去空白、校验起止。
 *
 * 三件事只做这三件，**其余一律不猜**：
 *   排序 —— 段序由日期决定，人填乱了按日期摆正，这是整理不是篡改
 *   空白 —— 名字两侧空格
 *   `start > end` —— 拒绝保存并说清哪一行，不静默调换（调换等于替他改内容）
 *
 * 返回 ok:false 时带行号（1 起），界面直接指出「第 2 行」。
 */
export function normalizePhases(
  value: unknown,
): { ok: true; phases: Phase[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) return { ok: false, error: "阶段数据格式不对。" };
  if (value.length > MAX_PHASES) {
    return { ok: false, error: `最多 ${MAX_PHASES} 段。` };
  }

  const rows: Phase[] = [];
  for (const [index, item] of value.entries()) {
    const line = index + 1;
    if (!item || typeof item !== "object") {
      return { ok: false, error: `第 ${line} 行不是有效的阶段。` };
    }
    const row = item as Record<string, unknown>;

    const start = typeof row.start === "string" ? toYmd(row.start) : "";
    const end = typeof row.end === "string" ? toYmd(row.end) : "";
    if (!start || !end) {
      return { ok: false, error: `第 ${line} 行的起止日期没填全。` };
    }
    if (start > end) {
      return { ok: false, error: `第 ${line} 行的开始日晚于结束日。` };
    }

    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!name) return { ok: false, error: `第 ${line} 行还没起名字。` };

    rows.push({
      key: typeof row.key === "string" && row.key.trim() ? row.key.trim().slice(0, 20) : start,
      name: name.slice(0, 20),
      start,
      end,
      milestone: parseMilestone(row.milestone),
    });
  }

  // 按开始日排。ISO 日期串可直接按字典序比
  rows.sort((a, b) => a.start.localeCompare(b.start));
  return { ok: true, phases: rows };
}

/**
 * 今天站在哪一段。
 *
 * 边界口径（三条都写死在测试里）：
 *   · 早于第一段起点 → 返回第一段 + `before`（界面说「还没开始，还有 N 天」）
 *   · 晚于最后一段终点 → 返回最后一段 + `after`（界面说「已过 N 天」）
 *   · 落在段与段的缝里（前一段结束到后一段开始之间）→ 返回**前一段** + `after`
 *
 * 第三条值得说明：归一化只保证按日期排序，**不保证首尾相接**——
 * 因为阶段是人的外框，允许他留空档（比如考完等成绩那两周）。
 * 缝里不返回 null，理由同上：整行消失会被当成 bug。
 */
export function resolvePhase(phases: Phase[] | null, today: Date | string): ResolvedPhase | null {
  if (!phases || phases.length === 0) return null;

  const todayYmd = typeof today === "string" ? toYmd(today) : toYmdFromDate(today);
  if (!todayYmd) return null;

  const first = phases[0];
  const last = phases[phases.length - 1];

  if (todayYmd < first.start) {
    return build(first, 0, phases, "before", todayYmd);
  }
  if (todayYmd > last.end) {
    return build(last, phases.length - 1, phases, "after", todayYmd);
  }

  for (let index = 0; index < phases.length; index += 1) {
    const phase = phases[index];
    if (todayYmd >= phase.start && todayYmd <= phase.end) {
      return build(phase, index, phases, "inside", todayYmd);
    }
  }

  // 落在缝里：归到它前面那一段，标 after
  for (let index = phases.length - 1; index >= 0; index -= 1) {
    if (todayYmd > phases[index].end) {
      return build(phases[index], index, phases, "after", todayYmd);
    }
  }

  // 走到这里说明日期串有异常（比如全是非法日期已被 parse 挡掉）。
  // 不返回 null 之外的任何东西：宁可这一行不显示，也不显示一句假的进度。
  return null;
}

function build(
  phase: Phase,
  index: number,
  phases: Phase[],
  state: ResolvedPhase["state"],
  todayYmd: string,
): ResolvedPhase {
  const span = Math.max(0, daysBetween(phase.start, phase.end)) + 1; // 含首尾
  // 周序号夹在本段范围内：state 为 before / after 时不能算出第 0 周或第 9 周
  const rawWeek = Math.floor(Math.max(0, daysBetween(phase.start, todayYmd)) / 7) + 1;
  const weekIndex = state === "before" ? 1 : Math.min(Math.max(1, rawWeek), Math.ceil(span / 7));
  const daysLeftInPhase = state === "after" ? 0 : Math.max(0, daysBetween(todayYmd, phase.end) + 1);

  return {
    index,
    name: phase.name,
    start: phase.start,
    end: phase.end,
    weekIndex,
    weeksTotal: Math.max(1, Math.ceil(span / 7)),
    daysLeftInPhase,
    nextPhaseStart: phases[index + 1]?.start ?? null,
    milestone: phase.milestone,
    daysToMilestone: phase.milestone ? daysBetween(todayYmd, phase.milestone.date) : null,
    daysUntilStart: Math.max(0, daysBetween(todayYmd, phase.start)),
    daysSinceEnd: Math.max(0, daysBetween(phase.end, todayYmd)),
    state,
  };
}

function toYmdFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 按目标日期自动切四段。
 *
 * 切的是**比例**，不是日期：总天数按 8 : 8 : 9 : 5 分，首尾相接，
 * 最后一段收在 `targetDate` 当天。这样换个人、换个考试日，切出来的都是他自己的节奏。
 *
 * 没有目标日期时返回 null —— **不猜一个日期出来**。
 * 这与今日计划里「都留空时兜底成无终点」是同一条原则：
 * 猜出来的日期会被当成真的，而它只是个瞎猜。
 */
export function autoSplitPhases(targetDate: string | null, startedAt: string | Date): Phase[] | null {
  const end = targetDate ? toYmd(targetDate) : "";
  if (!end) return null;

  const start = typeof startedAt === "string" ? toYmd(startedAt) : toYmdFromDate(startedAt);
  if (!start) return null;

  const totalDays = daysBetween(start, end);
  if (totalDays < 1) return null;

  const totalWeight = PHASE_WEEK_WEIGHTS.reduce((sum, w) => sum + w, 0);

  const phases: Phase[] = [];
  let cursor = 0;
  for (let index = 0; index < PHASE_TEMPLATE.length; index += 1) {
    const weight = PHASE_WEEK_WEIGHTS[index];
    const span = Math.round((weight / totalWeight) * totalDays);

    const phaseStart = addDays(start, cursor);
    // 最后一段一定收在目标日，否则浮点取整会留下一天或几天的缝
    const isLast = index === PHASE_TEMPLATE.length - 1;
    const phaseEnd = isLast ? end : addDays(start, cursor + Math.max(0, span - 1));

    phases.push({
      key: PHASE_TEMPLATE[index].key,
      name: PHASE_TEMPLATE[index].name,
      start: phaseStart,
      end: phaseEnd,
      milestone: null,
    });

    cursor += span;
  }

  return phases;
}

/** 日期加天数。只用 UTC 算，避免夏令时把某一天算成 23 小时 */
function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d);
  const next = new Date(base + days * 86_400_000);
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * 界面上那一行字。
 *
 * 形状：`启动期 · 第 3 周 / 共 8 周 · 距「摸底模考」还有 4 天`
 * 三种 state 换措辞：
 *   before → `启动期 · 还没开始，还有 6 天`
 *   after  → `启动期 · 已过 6 天`
 *   inside → 正常那句
 *
 * 里程碑已过时不再提它（「距某里程碑还有 -3 天」是句废话），
 * 但也不换成「晚了 3 天」——里程碑不是硬截止，晚了不是错。
 */
export function describePhase(phase: ResolvedPhase): string {
  if (phase.state === "before") {
    return `${phase.name} · 还没开始，还有 ${phase.daysUntilStart} 天`;
  }
  if (phase.state === "after") {
    // 段内正常结束与「整段都过完」都说「已过 N 天」：对使用者来说没有区别，
    // 都是「这一段的日子走完了，下一段还没到」
    return `${phase.name} · 已过 ${phase.daysSinceEnd} 天`;
  }

  const parts = [`${phase.name} · 第 ${phase.weekIndex} 周 / 共 ${phase.weeksTotal} 周`];
  if (phase.milestone && phase.daysToMilestone != null) {
    if (phase.daysToMilestone === 0) {
      parts.push(`今天是「${phase.milestone.label}」`);
    } else if (phase.daysToMilestone > 0) {
      parts.push(`距「${phase.milestone.label}」还有 ${phase.daysToMilestone} 天`);
    }
    // 负数（已过）不提：里程碑不是硬截止，晚了不是错，写出来只会让人焦虑
  }
  return parts.join(" · ");
}
