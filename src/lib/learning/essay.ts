// M7 论文批改：类型、校验与统计。不碰网络、不碰 React。
//
// 这件事的定位（设计文档第三节）：
//   **不问「写得怎么样」，只答「题目问的 4 件事你答了哪几件、答到哪一层」。**
//
// 为什么整份文件里没有任何 score 字段：
//   分数是模型的猜测，他拿到 58 分既不知道扣在哪，也无法验证下一次有没有涨。
//   「切合题意：基本切合，因为子问题(3)未找到对应段落」是能核的，改完能自己确认。
//   这条边界写进了验收标准（v4-m7.md 第 3 条），不是随口承诺。
//
// 为什么字数只统计、不判达标：
//   核实时查到三个互相矛盾的口径（2000—3000 / 2500—3000 / 不足 1200 扣分），
//   官方没有硬性数字。没有依据的判据留着比空着更糟——空着他知道没查，假判据他会当真。
//   详见设计文档第二节「第三档 · 存疑」。

/** 三条直接不及格的硬线，与提示词里的一一对应 */
export type HardLineKind = "fabricated" | "textbook" | "outdated";

export const HARD_LINE_LABELS: Record<HardLineKind, string> = {
  fabricated: "可能虚构",
  textbook: "像在抄书本",
  outdated: "内容或项目水准偏低",
};

/** 五个评分维度的静态定义。`weight` 只用于说明占比，**不参与任何计算** */
export type DimensionKey = "relevance" | "depth" | "practice" | "expression" | "analysis";

export const DIMENSIONS: Array<{
  key: DimensionKey;
  label: string;
  /** 百分制权重，如 0.3。界面上写成「30%」，作用是告诉他哪块最该重视 */
  weight: number;
  /** 这个维度的档位名，用来校验模型有没有答到点子上 */
  grades: string[];
}> = [
  {
    key: "relevance",
    label: "切合题意",
    weight: 0.3,
    grades: ["非常切合", "较好地切合", "基本上切合"],
  },
  {
    key: "depth",
    label: "应用深度与水平",
    weight: 0.2,
    grades: ["很强", "较强", "一般", "较差"],
  },
  {
    key: "practice",
    label: "实践性",
    weight: 0.2,
    grades: ["大量实践", "良好实践", "一般", "初步实践"],
  },
  {
    key: "expression",
    label: "表达能力",
    weight: 0.15,
    grades: ["清晰严谨", "基本清楚", "条理不清"],
  },
  {
    key: "analysis",
    label: "综合能力与分析",
    weight: 0.15,
    grades: ["很强", "比较强", "一般"],
  },
];

/** 引不出原文时的统一话术。界面与提示词共用同一个字符串，避免两处措辞不一致 */
export const NO_EVIDENCE = "未找到对应段落";

/** 一个子问题的对照结论 */
export type SubQuestionCheck = {
  /** 子问题在说什么，一句话 */
  question: string;
  /** 题目里带的硬要求，如「写出 3 个」「给出计算方法」。没有就是空串 */
  requirement: string;
  /** 答了没 */
  answered: boolean;
  /** 有没有落到他叙述的那个项目上，而不是泛泛讲理论 */
  groundedInProject: boolean;
  /** 有没有具体到指标名 / 工具名 / 计算公式 / 数字 */
  hasSpecifics: boolean;
  /** 依据：从他论文里引的原句；引不出来就是 NO_EVIDENCE */
  evidence: string;
};

/** 一条硬线疑点。只报可疑处，不下「你虚构了」的结论 */
export type HardLineSuspect = {
  kind: HardLineKind;
  /** 哪里可疑，一句话 */
  concern: string;
  /** 引原句 */
  evidence: string;
};

/** 一个维度的档位判定 */
export type DimensionVerdict = {
  key: DimensionKey;
  /** 档位文字。必须是 DIMENSIONS 里那几档之一 */
  grade: string;
  /** 判成这一档的依据。必须指向子问题表或原文 */
  basis: string;
};

/** 一次批改的全部产出。四块，顺序即界面上的顺序 */
export type EssayReview = {
  /** ① 子问题对照表 —— 核心产物 */
  subQuestions: SubQuestionCheck[];
  /** ② 三条硬线的疑点，可能是空数组 */
  hardLineSuspects: HardLineSuspect[];
  /** ③ 五维度档位 */
  dimensions: DimensionVerdict[];
  /** ④ 如果只改一处，改哪里。空串表示「这次没挑出明显该改的」 */
  topFix: string;
};

export function emptyEssayReview(): EssayReview {
  return { subQuestions: [], hardLineSuspects: [], dimensions: [], topFix: "" };
}

// ── 字数 ─────────────────────────────────────────────────────────

/**
 * 数正文字数：去掉所有空白字符后的长度。
 *
 * 为什么去掉空白而不是按「词」数：中文写作里空格不是分隔符，按词数会得出
 * 「2500 字」这种明显荒谬的结果。去空白后一个汉字算一个字符，与他自己数出来的接近。
 *
 * **与考试系统的计数口径未必一致**（软考系统怎么数标点、数不数空格，没有公开说明）。
 * 所以这个数字只用来比「这一稿比上一稿多了多少」，界面上一律写「约 N 字」，
 * 不写「达标」「不足」。
 */
export function countEssayChars(text: string): number {
  if (typeof text !== "string") return 0;
  return text.replace(/\s+/g, "").length;
}

// ── 请求校验 ─────────────────────────────────────────────────────

/** 题目下限。低于这个基本不是完整题目（多半只贴了标题，没贴子问题） */
const PROMPT_MIN = 10;
/** 题目上限。够放一道带三个子问题的真题，多出来的多半是贴错了整页文档 */
const PROMPT_MAX = 4_000;
/** 正文下限。低于这个还没到能批的程度 */
const ESSAY_MIN = 100;
/** 正文上限。超了直接拒，**不静默截断**——截断等于替他删掉了后半篇 */
const ESSAY_MAX = 30_000;
/** 稿次标签上限 */
const DRAFT_LABEL_MAX = 20;

export type EssayReviewInput = {
  promptText: string;
  essayText: string;
  /** 「第 2 稿」这种。可空 */
  draftLabel: string;
};

/**
 * 校验请求体。
 *
 * 错误话术按「他该做什么」分开写：缺题目、缺正文、正文太长，三种情况动作不同
 * （去翻题目 / 先把正文写完 / 检查是不是贴错了内容）。合成一句「内容不完整」
 * 等于让他自己猜。
 *
 * **不接受「只批文不批题」**：判切合题意的唯一依据是题目里的子问题清单，
 * 没有题目就只剩空洞的文笔评价，那不是这个功能要做的事。
 */
export function validateEssayReviewRequest(
  body: unknown,
): { ok: true; value: EssayReviewInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "请求内容不是对象。" };
  }
  const source = body as Record<string, unknown>;

  const promptText = typeof source.promptText === "string" ? source.promptText.trim() : "";
  if (promptText.length < PROMPT_MIN) {
    return {
      ok: false,
      error: "先把题目原文贴进来——连子问题一起贴。没有题目就没法判切不切题。",
    };
  }
  if (promptText.length > PROMPT_MAX) {
    return { ok: false, error: "题目超过了 4000 字，是不是把整份资料贴进来了？" };
  }

  const essayText = typeof source.essayText === "string" ? source.essayText.trim() : "";
  if (essayText.length < ESSAY_MIN) {
    return { ok: false, error: "正文还太短，先写完再批。" };
  }
  if (essayText.length > ESSAY_MAX) {
    return { ok: false, error: "正文超过了 3 万字，检查一下是不是贴错了内容。" };
  }

  const draftLabel =
    typeof source.draftLabel === "string" ? source.draftLabel.trim().slice(0, DRAFT_LABEL_MAX) : "";

  return { ok: true, value: { promptText, essayText, draftLabel } };
}

// ── 结果统计 ─────────────────────────────────────────────────────

/** 答到了几个子问题 */
export function countAnswered(review: EssayReview): number {
  return review.subQuestions.filter((item) => item.answered).length;
}

/**
 * 对照表的一句话小结。
 *
 * 不写「覆盖率 75%」：4 条里答了 3 条说成百分比，听起来像个分数，
 * 而他需要知道的是「还差哪一条」。
 */
export function describeCoverage(review: EssayReview): string {
  const total = review.subQuestions.length;
  if (total === 0) return "没从题目里读出子问题";
  const answered = countAnswered(review);
  if (answered === total) return `${total} 个子问题都答到了`;
  return `${total} 个子问题里答到 ${answered} 个`;
}

/** 有没有挑出任何东西。四块全空时界面要说一句「这次没挑出明显问题」 */
export function isCleanReview(review: EssayReview): boolean {
  return (
    review.subQuestions.every((item) => item.answered) &&
    review.hardLineSuspects.length === 0 &&
    review.topFix.trim().length === 0
  );
}
