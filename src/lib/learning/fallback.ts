// 保底考试：当前目标没达成时的下一个出口。
//
// 这一层只做一件事：把 learning_goals.fallback 这个 jsonb 解析成稳定形状，
// 解析不了就返回 null。不算倒计时、不排序、不判断「该不该切」——那些是调用方的事。
//
// 为什么要在这一层收口：
//   库里是 jsonb，写法可以很随意（少字段、多字段、类型不对、甚至是数组）。
//   组件层直接读会散成一堆 `?.`，而且同一份容错规则会被写两遍（今日计划一处、
//   目标列表一处），改一处忘一处。
//
// 为什么不给「没有 date」的情况编一个假日期：
//   2027 年下半年那场的官方日期现在没发布（往年 10 月下旬到 11 月上旬都出现过）。
//   编一个精确日期，界面上就会显示「距考试还有 N 天」，那个 N 是假的。
//   宁可只显示「下半年那场」，也不给一个会误导人的倒计时。

export type FallbackExam = {
  /** 考试名称，如「系统集成项目管理工程师（中级）」 */
  exam: string;
  /** 考试日 YYYY-MM-DD；官方日期未发布时为 null */
  date: string | null;
  /** 报名窗口说明，如「2027-08 中旬」；未知时为 null */
  registration: string | null;
  /** 一句说明：什么条件下切过去 */
  note: string | null;
};

/** 只接受 YYYY-MM-DD。格式不对就当没有，不猜 */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function readText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * 解析保底考试。
 *
 * 校验顺序是「先看是不是对象、再看有没有考试名」：
 * 没有 exam 的 jsonb 在界面上无法表述（不知道保底的是哪场考试），
 * 所以整条视为无效，而不是显示一个「保底：未命名」。
 */
export function parseFallbackExam(value: unknown): FallbackExam | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const row = value as Record<string, unknown>;
  const exam = readText(row.exam);
  if (!exam) return null;

  const rawDate = readText(row.date);

  return {
    exam,
    // 日期格式不对当作未定，不把「2027/10/24」这类写法塞进 daysUntil
    date: rawDate && DATE_PATTERN.test(rawDate) ? rawDate : null,
    registration: readText(row.registration),
    note: readText(row.note),
  };
}

/**
 * 一行话描述这个出口，给界面直接用。
 *
 * 例：「保底通道 · 系统集成项目管理工程师（中级）· 下半年那场（报名约 2027-08 中旬）」
 * 为什么不拼日期：日期未发布时不该编，见文件头。
 */
export function describeFallbackExam(fallback: FallbackExam): string {
  const parts = [fallback.exam];
  if (fallback.registration) parts.push(`报名约 ${fallback.registration}`);
  return parts.join(" · ");
}
