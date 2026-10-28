// M5 一页素材表：六段的定义与归整。纯函数，不碰网络、不碰 React。
//
// 这张纸的定位（PRD 第 7 条）：**由我本人先写，AI 只做检查与补漏**。
// 所以这个文件里没有「生成内容」的函数，只有「把写下来的东西收拢成一份结构」。
//
// 为什么每段都配一个引导问题，而不是只给标题：
//   空标题会让人对着空白页发呆，然后关掉。一个具体到能下笔的问题
//   （「举一个你自己项目里的例子」）比「例子」两个字有用得多。
//
// 为什么**不给示例答案、不预填**：
//   给了就会照着抄，抄完以为自己会了——那比空着更糟。这是这一版最不该越的线。

export type SheetSectionKey =
  | "definition"
  | "concepts"
  | "example"
  | "mistakes"
  | "checklist"
  | "selftest";

export type SheetSection = {
  key: SheetSectionKey;
  label: string;
  /** 引导问题。具体到能下笔，不是「请填写」 */
  prompt: string;
  /** 输入框里的灰字提示，和引导问题不同：引导问题问「写什么」，这里示范「写成什么样」 */
  placeholder: string;
  /** 这段建议写几行。只影响输入框高度，不做字数限制 */
  rows: number;
};

export const SHEET_SECTIONS: SheetSection[] = [
  {
    key: "definition",
    label: "定义",
    prompt: "这个模块解决什么问题？一句话。",
    placeholder: "例：把「要做什么」拆成可执行、可检查的活。",
    rows: 2,
  },
  {
    key: "concepts",
    label: "核心概念",
    prompt: "你记得的 3—5 个，每个一行，用你自己的话写。",
    placeholder: "例：WBS 不是任务清单，是交付物的分解。",
    rows: 4,
  },
  {
    key: "example",
    label: "例子",
    prompt: "举一个你自己项目里的例子。",
    placeholder: "例：上次做气象大屏，我把「数据接入」拆成了三个交付物……",
    rows: 3,
  },
  {
    key: "mistakes",
    label: "常见错",
    prompt: "你已经错过的。可以从错题里抄。",
    placeholder: "例：把 SV 的正负方向记反了。",
    rows: 3,
  },
  {
    key: "checklist",
    label: "检查清单",
    prompt: "考前你会怎么检查自己有没有掌握？",
    placeholder: "例：能不能不看书画出这个模块的流程图。",
    rows: 3,
  },
  {
    key: "selftest",
    label: "5 个自测题",
    prompt: "自己出 5 道。能答上来说明真会了。",
    placeholder: "例：1. 关键路径上的总时差是多少？",
    rows: 6,
  },
];

export const SHEET_SECTION_KEYS: SheetSectionKey[] = SHEET_SECTIONS.map((section) => section.key);

/** 每段最长留多少字。不做产品限制，只是拦住异常大的请求（比如把整篇文档粘进来） */
const SECTION_MAX = 20_000;

export type SheetSections = Record<SheetSectionKey, string>;

/**
 * 把库里的 jsonb 或表单里的一坨东西归整成六段齐全的结构。
 *
 * 缺的段补空串而不是丢弃：界面上六段的顺序固定，少一段会让后面的对不上位置。
 * 多出来的键（比如以后删掉的段）直接扔掉，不往界面上带。
 */
export function normalizeSections(raw: unknown): SheetSections {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const result = {} as SheetSections;
  for (const key of SHEET_SECTION_KEYS) {
    const value = source[key];
    const text = typeof value === "string" ? value : "";
    result[key] = text.length > SECTION_MAX ? text.slice(0, SECTION_MAX) : text;
  }
  return result;
}

/** 空白的六段。新建一张纸时用 */
export function emptySections(): SheetSections {
  return normalizeSections({});
}

/** 写了几段（只数有内容的） */
export function filledSectionCount(sections: SheetSections): number {
  return SHEET_SECTION_KEYS.filter((key) => sections[key].trim().length > 0).length;
}

/** 一个字都没写 */
export function isBlankSheet(sections: SheetSections): boolean {
  return filledSectionCount(sections) === 0;
}

/** 列表上的状态文案。不写「完成度 67%」——这个纸没有「完成」这回事，只说自己写了多少 */
export function describeProgress(sections: SheetSections): string {
  const filled = filledSectionCount(sections);
  if (filled === 0) return "还没写";
  return `写了 ${filled}/${SHEET_SECTIONS.length} 段`;
}
