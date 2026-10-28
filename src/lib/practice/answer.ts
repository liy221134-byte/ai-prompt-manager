/**
 * 答案归一化：让「字母答案」与「选项全文答案」这两种存量口径都判得对。
 *
 * 背景：题库里本来就存在两套 answer 写法。
 *   - 早期主题（AI 提示词那批）把整段选项文本直接存进 answer；
 *   - 中项主题包按 A/B/C/D 存字母。
 * 判分组件原先只认前者（`selectedSingle === answer`），于是中项 84 道单选题
 * 无论选哪个都判错——选项被选中时传的是选项全文，跟字母永远不相等。
 *
 * 这里不写库、不改数据，只在判分前把答案统一成「选项文本」：
 * 单个大写字母按位置取选项，其余原样返回。这样两批数据共用一套判分。
 *
 * 为什么不反过来把字母写进库：选项文本是判分的真凭据，
 * 字母只是它的简写。留在库里的是文本，字母在读取时展开——改动范围最小。
 */

/** 把单个答案项规范成选项文本。字母按位置取，越界或非字母原样返回。 */
export function toOptionText(
  term: string,
  options: readonly string[] | null | undefined,
): string {
  const trimmed = term.trim();
  // 只处理 A—E 这类单字母。多字母（如 "AB"）不猜，原样返回，免得误判
  if (/^[A-Z]$/.test(trimmed) && Array.isArray(options)) {
    const index = trimmed.charCodeAt(0) - 65;
    if (index >= 0 && index < options.length) {
      return options[index];
    }
  }
  return term;
}

/** 多选答案解析：answer 约定为 JSON 数组字符串。解析失败给空数组，不抛。 */
export function parseAnswerTerms(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** 单选答案 → 选项文本。 */
export function resolveSingleAnswer(
  raw: string,
  options: readonly string[] | null | undefined,
): string {
  return toOptionText(raw, options);
}

/** 多选答案 → 选项文本数组。 */
export function resolveMultiAnswer(
  raw: string,
  options: readonly string[] | null | undefined,
): string[] {
  return parseAnswerTerms(raw).map((term) => toOptionText(term, options));
}

/** 无序比较两组文本是否集合相等。 */
export function sameTerms(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((item) => set.has(item));
}
