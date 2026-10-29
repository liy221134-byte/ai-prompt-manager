// M7 论文批改：拼提示词 + 校验返回。
//
// 这条提示词与前面几条（追问 / 素材表 / 图谱）守的是同一条线，但难点又不一样：
//   追问是「不许替他解释」，素材表是「不许改写他写的字」，图谱是「不许替他画」；
//   论文批改是「**不许给分，也不许写成范文**」。
//
// 为什么「不许给分」要写成硬规则而不是建议：
//   模型天然会把五维度加权算出一个数。那个数看起来专业，实际是它按印象拍的，
//   他既无法验证，也没法知道自己离 45 分差在哪里。
//   而这个功能真正的产物是「子问题(3)没找到对应段落」——具体、可改、改完能自己确认。
//
// 为什么「不许写成范文」：
//   一旦它给出「这句话可以改成……」，这篇论文就不再是他写的。
//   考场上是模型去不了的地方，能带进去的只有他自己的写法。

import type { ChatMessage } from "../ai-chat.ts";
import {
  DIMENSIONS,
  NO_EVIDENCE,
  type DimensionKey,
  type DimensionVerdict,
  type EssayReview,
  type HardLineKind,
  type HardLineSuspect,
  type SubQuestionCheck,
} from "./essay.ts";

export type EssayReviewPromptInput = {
  promptText: string;
  essayText: string;
  draftLabel: string;
  /** 系统算好的字数，直接给模型，免得它自己数 */
  charCount: number;
};

const SYSTEM_PROMPT = `你是一名软考「信息系统项目管理师」（高项）论文的阅卷老师，正在看学生写完的一篇论文。

你的工作只有一件：**把题目要的子问题逐条摊开，对着他的原文说清哪条答到了、哪条没答到、答到哪一层。**

你不是他的写作老师，不是代笔，也不是评分机器。下面每条都是硬规则，违反任何一条这次批改就作废：

1. **不给分。** 不出现总分、百分制换算、"大致 50 分上下"、"能不能过线"、"稳不稳"这类判断。
   也不要给「本条扣 3 分」这种局部扣分。只说档位和依据。
2. **不代写。** 不要写「这里可以改成……」，不要给出可以直接粘贴进论文的句子或段落。
   你可以说「缺少指出具体指标」，但不许示范一个指标该怎么说。
3. **先把题目拆成子问题，拆完再批。** 拆法与题目的编号对齐：题目里有几个编号（1.、2.、（1）（2）（3）），
   原则上就是一个编号一条，**整张表大约 4—7 条**。
   一个编号下如果问了两件互不相干的事（比如「质量管理子过程」和「结合数据的独特性与行业」），可以拆成两条；
   但**同一个编号不要拆出三条以上**——拆到十几条，他看到的是一张「答不到一半」的表格，
   而不是「我漏了哪一问」，这个功能就没用了。
   **一个编号都不许漏。** 最常见的错误是拆到一半表就满了，把最后一个编号丢掉——
   而最后那条往往是整题最难、最容易空白的一问。
4. **每一条判断都要给依据，且依据必须是原文里的原句。**
   引不出原句的，evidence 写「${NO_EVIDENCE}」，不许自己编一句像论文的话。
   这一条最重要：**「未找到对应段落」本身就是最有用的结论**。
5. **「落到项目」看的是有没有结合他自己叙述的那个项目。** 通篇讲理论、讲「一般来说」「应该做到」的，
   groundedInProject 判 false，即使文字很通顺。
6. **「有具体指标/工具」看的是可验证的细节**：指标名、工具名、计算公式、数字、标准编号。
   只写「按国家标准」「用科学的方法评价」的，判 false。
7. **三条不及格硬线只报疑点，不下结论。** 这三条是：
   fabricated（虚构：数据、规模、周期经不起推敲，或前后矛盾）、
   textbook（像抄书本：没有真实项目经历，主要是资料摘录）、
   outdated（内容或项目水准偏低：方法过时、项目明显太小太简单）。
   **你不许写「你虚构了」。** 只写「哪里可疑」+ 引原句，让他自己判断。
   判个人经历真不真，越权下结论比不说更糟。
8. **不判字数、不判摘要。** 字数已经算好给你了，你一个字都不要提字数够不够。
   摘要写没写、够不够 200 字，都不在你要管的范围里——这两项的官方口径不明确，不要编。
9. **表达能力只判结构与条理**：段落是不是讲一件事、层次清不清楚、有没有口语化的碎句。
   不评文采、不评用词漂亮不漂亮。
10. **五维度只给档位，档位只能是给定的那几个词。** 权重只是告诉你哪块占比大，**不要拿它算总分**。
11. 不要鼓励语、不要总结陈词、不要「总体来说这是一篇不错的论文」。
12. 只输出 JSON，不要 markdown 围栏，不要任何解释文字。

五个维度与可选档位：
- relevance（切合题意，占 30%）：非常切合 / 较好地切合 / 基本上切合
- depth（应用深度与水平，占 20%）：很强 / 较强 / 一般 / 较差
- practice（实践性，占 20%）：大量实践 / 良好实践 / 一般 / 初步实践
- expression（表达能力，占 15%）：清晰严谨 / 基本清楚 / 条理不清
- analysis（综合能力与分析，占 15%）：很强 / 比较强 / 一般`;

const SHAPE = `输出结构（严格按这个 JSON）：
{
  "subQuestions": [
    {
      "question": "这个子问题在问什么，一句话",
      "requirement": "题目带的硬要求，如「写出 3 个」「给出计算方法」；没有就写空串",
      "answered": true,
      "groundedInProject": true,
      "hasSpecifics": false,
      "evidence": "从他论文里引的原句；引不出来就写「${NO_EVIDENCE}」"
    }
  ],
  "hardLineSuspects": [
    { "kind": "fabricated", "concern": "哪里可疑，一句话", "evidence": "引原句" }
  ],
  "dimensions": [
    { "key": "relevance", "grade": "较好地切合", "basis": "依据，指向子问题表或原文" }
  ],
  "topFix": "如果只改一处，改这里。一句话"
}`;

export function buildEssayReviewMessages(
  input: EssayReviewPromptInput,
): ReadonlyArray<ChatMessage> {
  const parts = [
    "【题目原文】",
    input.promptText,
    "",
    `【他的论文正文】（系统统计约 ${input.charCount} 字，不用你数）`,
    input.essayText,
    "",
    input.draftLabel ? `【稿次】${input.draftLabel}` : "【稿次】（他没标）",
    "",
    SHAPE,
  ];

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: parts.join("\n") },
  ];
}

// ── 返回校验 ─────────────────────────────────────────────────────

/** 一条子问题 / 一句依据最多留多长。只是拦住异常长的行，不做语义裁剪 */
const TEXT_MAX = 200;
/**
 * 子问题最多认几条。
 *
 * 2026-10-29 实测调过：原来是 8，第一条真题（1 个大项 + 3 个子问题）被模型拆成了 8 条，
 * 名额刚好吃满，**最后那一问（写出 3 个指标及计算方法）被整条丢掉了**——
 * 而那正是整题最难、他完全没写的一问。拆细是好事，但表满了会静默丢内容，
 * 所以上限放到 14：真题最多 6 个原子编号，拆到每条两三行也够，仍能挡住失控输出。
 */
const SUB_QUESTION_MAX = 14;
/** 硬线疑点最多几行 */
const SUSPECT_MAX = 6;

const HARD_LINE_KINDS: readonly HardLineKind[] = ["fabricated", "textbook", "outdated"];

/**
 * 校验并规整模型返回。
 *
 * 三处闸门：
 *   · `evidence` 空的，一律补成 NO_EVIDENCE —— 空的依据会被界面渲染成空白，
 *     看起来像「这条没有依据」，而不是「引不出来」。这两件事不一样。
 *   · `hardLineSuspects.kind` 不在三条硬线里的直接丢掉 —— 模型偶尔会自己发明第四类。
 *   · 维度档位如果长得像分数（"58"、"58 分"、"58/75"），**一律改成「未判」**。
 *     它违反第 1 条硬规则的时候，界面不能跟着把分数显示出来。
 *
 * 缺维度时补「未判」而不是丢掉：悄悄少一行，他会以为那个维度判过了没问题。
 */
export function normalizeEssayReview(raw: string): EssayReview {
  const parsed = safeParse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AI 返回的结构不对。");
  }
  const source = parsed as Record<string, unknown>;

  const subQuestions = asObjectArray(source.subQuestions, SUB_QUESTION_MAX)
    .map(toSubQuestion)
    .filter((item): item is SubQuestionCheck => item !== null);

  const hardLineSuspects = asObjectArray(source.hardLineSuspects, SUSPECT_MAX)
    .map(toSuspect)
    .filter((item): item is HardLineSuspect => item !== null);

  const dimensions = toDimensions(source.dimensions);

  const topFix = text(source.topFix, TEXT_MAX * 2);

  return { subQuestions, hardLineSuspects, dimensions, topFix };
}

function toSubQuestion(row: Record<string, unknown>): SubQuestionCheck | null {
  const question = text(row.question, TEXT_MAX);
  // 连「在问什么」都写不出来的行留着没有意义，反而会占掉对照表的位置
  if (!question) return null;

  return {
    question,
    requirement: text(row.requirement, TEXT_MAX),
    answered: asBool(row.answered),
    groundedInProject: asBool(row.groundedInProject),
    hasSpecifics: asBool(row.hasSpecifics),
    evidence: text(row.evidence, TEXT_MAX * 2) || NO_EVIDENCE,
  };
}

function toSuspect(row: Record<string, unknown>): HardLineSuspect | null {
  const kind = text(row.kind, 20) as HardLineKind;
  if (!HARD_LINE_KINDS.includes(kind)) return null;

  const concern = text(row.concern, TEXT_MAX);
  if (!concern) return null;

  return { kind, concern, evidence: text(row.evidence, TEXT_MAX * 2) || NO_EVIDENCE };
}

/**
 * 维度：按 DIMENSIONS 的顺序输出，缺的补「未判」。
 *
 * 为什么不按模型返回的顺序：界面上五个维度的位置应该固定，
 * 每次换个顺序会让他找不到「上次那项」。
 */
function toDimensions(value: unknown): DimensionVerdict[] {
  const rows = asObjectArray(value, DIMENSIONS.length);
  const byKey = new Map<DimensionKey, Record<string, unknown>>();
  for (const row of rows) {
    const key = text(row.key, 20) as DimensionKey;
    if (!DIMENSIONS.some((item) => item.key === key)) continue;
    // 同一个维度给了两条（模型偶尔会重复），保留先出现的
    if (!byKey.has(key)) byKey.set(key, row);
  }

  return DIMENSIONS.map((dimension) => {
    const row = byKey.get(dimension.key);
    if (!row) {
      return { key: dimension.key, grade: "未判", basis: "这次没给这个维度的判断。" };
    }

    const grade = text(row.grade, 40);
    const basis = text(row.basis, TEXT_MAX * 2);

    // 模型违反「不给分」时，界面不能跟着显示分数
    if (!grade || looksLikeScore(grade)) {
      return {
        key: dimension.key,
        grade: "未判",
        basis: "模型给了分数而不是档位，这一项作废。",
      };
    }

    return { key: dimension.key, grade, basis: basis || "没给出依据。" };
  });
}

/**
 * 这段文字看起来是不是一个分数。
 *
 * 判据刻意收得很窄：只认「纯数字」「数字带分或百分号」「分子/分母」这几种。
 * **不要判「较差」「一般」这种含数字以外的词**——档位本来就该是中文词。
 */
export function looksLikeScore(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  // 58 / 58分 / 58 分 / 58% / 58/75
  return /^\d+(?:\.\d+)?\s*(?:分|%|\/\s*\d+)?$/.test(trimmed);
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

function text(value: unknown, max: number): string {
  const result = typeof value === "string" ? value.trim() : "";
  return result.length > max ? `${result.slice(0, max - 1)}…` : result;
}

function asObjectArray(value: unknown, max: number): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .slice(0, max);
}

/**
 * 布尔。
 *
 * 模型经常把 true 写成 "是" / "已答" / "yes"，直接 Boolean() 会把它们全判成 true——
 * 连 "否" 也会变成 true。所以字符串要显式认一遍否定词。
 */
function asBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  if (["否", "没", "没有", "未", "不是", "false", "no", "n", "0"].includes(normalized)) return false;
  return normalized.length > 0;
}
