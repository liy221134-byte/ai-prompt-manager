// M5 一页素材表的 AI 检查：拼提示词 + 校验返回。
//
// 这条提示词最难的地方不是「让模型说点什么」，而是**让它闭嘴**：
// 模型天然想帮你把段落写通顺、把概念补全。一旦它写出了成段的文字，
// 这张纸就不再是「我写的」，而 PRD 第 7 条恰恰禁止这个。
//
// 两道闸：
//   1. 返回结构里**没有放改写结果的地方**——只有 gaps / wrong / suggest 三个字符串数组。
//   2. 代码里再挡一次：`wrong` 必须引用学生写过的原话，引用不到就丢掉。
//      这条挡的是模型编一个「你写错了」出来（它没看过讲义正文，很容易瞎猜）。
//
// 为什么不给讲义正文：给了它就会把讲义抄成「建议」，与「不代写」直接冲突。
// 代价是遗漏判断粗一些——这一版先要一个「能提醒我漏了什么」的镜子，不追求判得准。

import { normalizeForCompare } from "./probe.ts";
import { SHEET_SECTIONS, type SheetSections } from "./sheet.ts";

export type SheetReviewInput = {
  moduleName: string;
  sections: SheetSections;
  /** 这个模块的知识点名，用来约束 gaps 别自己编概念 */
  knowledgePoints: string[];
  /** 这个模块错过的题目标题，让模型知道哪些坑已经踩过 */
  wrongQuestionTitles: string[];
};

export type SheetReview = {
  /** 讲义里有、他没写到的概念。可以空 */
  gaps: string[];
  /** 与讲义不一致的地方。每条必须引用他写过的原话。可以空 */
  wrong: string[];
  /** 建议补什么。可以空 */
  suggest: string[];
};

export function validateSheetReviewRequest(
  body: unknown,
): { ok: true; value: SheetReviewInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "请求内容不是对象。" };

  const source = body as Record<string, unknown>;
  const moduleName = textOr(source.moduleName, 120);
  if (!moduleName) return { ok: false, error: "缺少模块名。" };

  if (!source.sections || typeof source.sections !== "object") {
    return { ok: false, error: "缺少素材表内容。" };
  }

  const rawSections = source.sections as Record<string, unknown>;
  const sections = {} as SheetSections;
  for (const section of SHEET_SECTIONS) {
    const value = rawSections[section.key];
    sections[section.key] = typeof value === "string" ? textOr(value, 20_000) : "";
  }

  // 一个字都没写就别调模型了：没有可检查的内容，返回的只会是空话，还白花钱
  if (SHEET_SECTIONS.every((section) => sections[section.key].trim().length === 0)) {
    return { ok: false, error: "六段都还空着，先写几句再让 AI 检查。" };
  }

  const knowledgePoints = Array.isArray(source.knowledgePoints)
    ? source.knowledgePoints
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0)
        .slice(0, 60)
        .map((item) => textOr(item, 80))
    : [];

  const wrongQuestionTitles = Array.isArray(source.wrongQuestionTitles)
    ? source.wrongQuestionTitles
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0)
        .slice(0, 20)
        .map((item) => textOr(item, 160))
    : [];

  return { ok: true, value: { moduleName, sections, knowledgePoints, wrongQuestionTitles } };
}

const SYSTEM_PROMPT = `你是一名软考（系统集成项目管理工程师）辅导老师，正在检查学生自己写的一页复习纸。

这张纸上的每一个字都是学生自己写的。你的工作是当一面镜子：指出**漏了什么、哪里写错了**。
你不是编辑，不是代笔，也不是老师讲评。

硬规则，违反任何一条这次检查就作废：
1. **不许改写他的话。** 不要输出「建议改成……」，不要给整段范文，不要替他补写段落。
   你只要说「哪里缺」「哪里不对」。
2. **不许讲课。** 不要解释概念是什么，不要展开知识点。
   他不知道的，他自己会去翻；你讲了，他就只会读你的话。
3. 「漏了什么」只能从给你的候选概念里挑。名单里没有的，不许自己编一个出来。
4. 「哪里写错了」必须**引用他写的原话**（几个字即可），并指出错在哪。
   引用不到具体原话的，不要写——你没看过讲义正文，很多「错误」其实是你想多了。
5. 不要评价（不说「写得不错」「有待加强」），不要鼓励语，不要分点套话。
6. 每条控制在 40 字以内。三项都可以是空数组——他没有漏也没有错，就返回空的。
7. 只输出 JSON，不要 markdown 围栏，不要任何解释文字。`;

const SHAPE = `输出结构：
{
  "gaps": ["名单里他没写到的概念"],
  "wrong": ["他写的「原话」——错在哪"],
  "suggest": ["建议补什么，一句具体的动作"]
}`;

export function buildSheetReviewMessages(input: SheetReviewInput): Array<{
  role: "system" | "user";
  content: string;
}> {
  const sectionBlocks = SHEET_SECTIONS.map((section) => {
    const text = input.sections[section.key].trim();
    return `## ${section.label}（${section.prompt}）\n${text || "（空着）"}`;
  }).join("\n\n");

  const candidates =
    input.knowledgePoints.length > 0
      ? input.knowledgePoints.join("、")
      : "（这个模块没有知识点清单，gaps 返回空数组）";

  const wrongTitles =
    input.wrongQuestionTitles.length > 0
      ? input.wrongQuestionTitles.map((title) => `- ${title}`).join("\n")
      : "（这个模块还没有做错过题）";

  const userContent = [
    `模块：${input.moduleName}`,
    "",
    "他写的六段：",
    sectionBlocks,
    "",
    `这个模块的候选概念：${candidates}`,
    "",
    "他做错过的题：",
    wrongTitles,
    "",
    SHAPE,
  ].join("\n");

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];
}

const ITEM_MAX = 60;
const MAX_PER_LIST = 8;

/**
 * 校验并规整模型返回。
 *
 * 两处比诊断更严，理由都是「这道闸挡住的东西会直接降低这张纸的价值」：
 *   - `gaps` 必须落在候选概念里，否则丢掉：编出来的概念会让人去查一个不存在的东西。
 *   - `wrong` 必须引用到他写过的原话（连续 4 个字以上），引用不到就丢掉：
 *     模型没看过讲义，最容易出的话就是凭感觉说「这里理解有偏差」。
 */
export function normalizeSheetReview(raw: string, input: SheetReviewInput): SheetReview {
  const parsed = safeParse(raw);
  if (!parsed || typeof parsed !== "object") throw new Error("AI 返回的结构不对。");

  const source = parsed as Record<string, unknown>;
  const written = SHEET_SECTIONS.map((section) => input.sections[section.key]).join("\n");

  const gaps = asTextArray(source.gaps, MAX_PER_LIST).filter((item) =>
    input.knowledgePoints.length === 0
      ? false
      : input.knowledgePoints.some(
          (name) => normalizeForCompare(item).includes(normalizeForCompare(name)) ||
            normalizeForCompare(name).includes(normalizeForCompare(item)),
        ),
  );

  const wrong = asTextArray(source.wrong, MAX_PER_LIST).filter((item) =>
    quotesWrittenText(item, written),
  );

  const suggest = asTextArray(source.suggest, MAX_PER_LIST);

  return { gaps, wrong, suggest };
}

/** 这条意见里有没有引用到他写过的原话（连续 4 个字以上） */
function quotesWrittenText(item: string, written: string): boolean {
  const itemText = normalizeForCompare(item);
  const writtenText = normalizeForCompare(written);
  if (itemText.length < 4 || writtenText.length < 4) return false;

  // 滑窗找公共片段。4 是下限：「因为」「所以」这种两字词到处都有，挡不住瞎编。
  const WINDOW = 4;
  for (let start = 0; start + WINDOW <= itemText.length; start += 1) {
    if (writtenText.includes(itemText.slice(start, start + WINDOW))) return true;
  }
  return false;
}

function safeParse(raw: string): unknown {
  if (typeof raw !== "string" || !raw.trim()) throw new Error("AI 返回内容为空。");
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("AI 返回里找不到 JSON 对象。");
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new Error("AI 返回的不是有效 JSON。");
  }
}

function textOr(value: unknown, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > max ? text.slice(0, max) : text;
}

function asTextArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0)
    .slice(0, max)
    .map((item) => (item.length > ITEM_MAX ? `${item.slice(0, ITEM_MAX - 1)}…` : item));
}
