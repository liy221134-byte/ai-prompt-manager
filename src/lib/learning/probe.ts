// 学习系统 M5 的追问：会话状态机。纯函数，不碰网络、不碰 React，方便单测。
//
// 这一模块只回答三个问题，别的都不管：
//   1. 现在该让模型做什么——再问一句，还是收尾出结论？
//   2. 模型这一句问得算不算数——是不是泛泛的「再详细说说」？
//   3. 会话该不该结束？
//
// 为什么「问得泛」要写成代码判定，而不是只写在提示词里：
//   提示词里写「不要问空话」，模型会时不时照犯，而人看不出来——因为「能再具体说说吗」
//   听起来并不刺耳。三轮回合如果都是这种，追问问了个寂寞，还花了三次调用。
//   判据用一条可机检的规则：**追问里必须出现我上一轮回答里的某个具体词**。
//   这不是修辞要求，是「你到底有没有在听我说话」的检验。

/** 一次会话里「我」最多回答几轮。第一问 + 两次追问 + 收尾。 */
export const MAX_PROBE_ROUNDS = 3;

/** 追问里必须引用的片段最短多长。一个汉字太容易撞（「是」「的」），两个字起。 */
const MIN_QUOTE_LEN = 2;

/** 引用片段最长取到多长。再长就成了复述整句，没有追问的意思。 */
const MAX_QUOTE_LEN = 6;

/**
 * 这些片段即使在我上一轮回答里出现过，也不算「引用」——
 * 它们是任何一句话都会有的填空词，引用了等于没引用。
 */
const FILLER_FRAGMENTS = new Set([
  "这个", "那个", "什么", "怎么", "为什", "我们", "你们", "他们",
  "就是", "但是", "所以", "因为", "时候", "一个", "可以", "没有",
  "还是", "不是", "其实", "应该", "觉得", "知道", "意思", "具体",
  "详细", "说说", "再想", "想想", "可能", "或者", "而且", "如果",
  "然后", "这样", "那样", "有点", "比较", "大概", "应该", "一定",
]);

export type TranscriptEntry = {
  role: "ai" | "me";
  text: string;
};

/**
 * 模型一次只能返回这两种之一。
 *
 * 注意 `ask` 分支里**没有放讲解的位置**——这是故意的。PRD 第 7 条要求 AI 不代替人思考，
 * 靠提示词写「不要讲解」模型会绕着走；把返回结构里的字段删掉，它就没有地方写。
 */
export type ProbeTurn =
  | { kind: "ask"; question: string }
  | { kind: "verdict"; verdict: ProbeVerdict };

export type ProbeVerdict = {
  /** 卡在哪个概念，一句话，具体到动作或概念 */
  stuck: string;
  /** 只能从候选知识点里选；选不到就是 null，不许自己编一个名字 */
  knowledgePointId: string | null;
  /** 下一步做什么，当天能执行 */
  next: string;
};

/** 该让模型做什么。route 只按这个结果分支，不自己数回合。 */
export type ProbePlan = {
  phase: "ask" | "verdict";
  /** 这是第几问。1 是第一问，2、3 是追问；出结论时为 0 */
  round: number;
  /** 这一问之后就必须收尾了（提示词里要提醒模型：问完这个别再问） */
  lastChance: boolean;
};

/** 我回答了几轮。只数 me，不数 ai——模型说了几句不算数。 */
export function countMyAnswers(transcript: TranscriptEntry[]): number {
  return transcript.filter((entry) => entry.role === "me" && entry.text.trim() !== "").length;
}

/**
 * 下一步做什么。
 *
 * 回答满 MAX_PROBE_ROUNDS 轮就收尾。为什么是 3 而不是「一直问到答不上来」：
 * 单题超过 10 分钟人就不做了，这一版要的是定位一个概念，不是彻底盘问。
 */
export function planNextTurn(transcript: TranscriptEntry[]): ProbePlan {
  const answered = countMyAnswers(transcript);

  if (answered >= MAX_PROBE_ROUNDS) {
    return { phase: "verdict", round: 0, lastChance: false };
  }

  return {
    phase: "ask",
    round: answered + 1,
    // 这一问是我能回答的最后一轮 ⇒ 模型问完就该收尾
    lastChance: answered + 1 === MAX_PROBE_ROUNDS,
  };
}

/** 会话是否该结束（我答满了轮数）。 */
export function isFinished(transcript: TranscriptEntry[]): boolean {
  return countMyAnswers(transcript) >= MAX_PROBE_ROUNDS;
}

/** 上一次模型问的话。第一次问时为 null。 */
export function lastAiQuestion(transcript: TranscriptEntry[]): string | null {
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    if (transcript[i].role === "ai") return transcript[i].text;
  }
  return null;
}

/** 我上一轮说了什么。没说过就是空串。 */
export function lastMyAnswer(transcript: TranscriptEntry[]): string {
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    if (transcript[i].role === "me") return transcript[i].text;
  }
  return "";
}

/** 去掉空白与常见标点、统一小写。比较用，不用于展示。 */
export function normalizeForCompare(text: string): string {
  return text
    .replace(/[\s\u3000]/g, "")
    .replace(/[，。、；：！？""''（）《》…—·,.;:!?"'()<>[\]{}\-~`]/g, "")
    .toLowerCase();
}

/**
 * 找出追问里引用的、来自我上一轮回答的具体片段。
 * 找到返回那一段（用于给人看「它在问哪句」），找不到返回 null。
 *
 * 取最长匹配：从长到短试，第一个命中的就是最具体的那个词。
 */
export function findQuotedFragment(question: string, answer: string): string | null {
  const q = normalizeForCompare(question);
  const a = normalizeForCompare(answer);
  if (!q || !a) return null;

  const upper = Math.min(MAX_QUOTE_LEN, q.length);
  for (let len = upper; len >= MIN_QUOTE_LEN; len -= 1) {
    for (let start = 0; start + len <= q.length; start += 1) {
      const piece = q.slice(start, start + len);
      if (FILLER_FRAGMENTS.has(piece)) continue;
      if (a.includes(piece)) return piece;
    }
  }
  return null;
}

export type FollowUpCheck =
  | { ok: true; quoted: string }
  | { ok: false; reason: "empty" | "too-short" | "repeated" | "generic" };

/**
 * 这一句追问算不算数。
 *
 * 四种不算数：空的、太短的（「为什么？」）、跟前面问过的一模一样、
 * 以及没有引用我上一轮任何具体词的（「能再详细说说吗」）。
 * 最后一种是重点——它听起来最像追问，实际最没用。
 */
export function checkFollowUp(question: string, transcript: TranscriptEntry[]): FollowUpCheck {
  const text = (question ?? "").trim();
  if (!text) return { ok: false, reason: "empty" };

  const normalized = normalizeForCompare(text);
  // 「为什么？」「还有呢？」这类短问句，长度不够承载一个具体对象
  if (normalized.length < 6) return { ok: false, reason: "too-short" };

  const previous = lastAiQuestion(transcript);
  if (previous) {
    const prev = normalizeForCompare(previous);
    // 完全相同，或一句把另一句整个包含进去（模型换个语序重复问）
    if (prev === normalized) return { ok: false, reason: "repeated" };
    const [shorter, longer] = prev.length <= normalized.length ? [prev, normalized] : [normalized, prev];
    if (shorter.length >= 12 && longer.includes(shorter)) {
      return { ok: false, reason: "repeated" };
    }
  }

  const answer = lastMyAnswer(transcript);
  const quoted = findQuotedFragment(text, answer);
  if (!quoted) return { ok: false, reason: "generic" };

  return { ok: true, quoted };
}

/**
 * 给「重问一次」用的追加指令。
 *
 * 不把具体哪句判为无效告诉用户，只让模型重来——用户看到的是「AI 在追问」，
 * 中间那次被拦下的句子没必要展示，展示了反而像系统在挑刺。
 */
export function repairHint(reason: FollowUpCheck & { ok: false }): string {
  switch (reason.reason) {
    case "empty":
      return "你上一轮没有输出问题。只输出一个具体的问题。";
    case "too-short":
      return "你上一轮问得太短，没有指向任何具体内容。把上一个回答里的某个词原样引出来再问。";
    case "repeated":
      return "你上一轮问的和之前问过的一样。换一个角度，针对上一个回答里另一个具体的点。";
    case "generic":
      return "你上一轮的问题没有引用上一个回答里的任何内容，属于空泛追问。原样引用上一个回答里的一个具体词，再针对它提问。";
    default:
      return "重新问一个具体的问题。";
  }
}

/**
 * 收尾结论的最小校验：三句话都得有内容。
 * 知识点归属不在这里管——它要跟候选列表比对，属于提示词那层的事。
 */
export function isUsableVerdict(verdict: ProbeVerdict | null | undefined): boolean {
  if (!verdict) return false;
  return Boolean(verdict.stuck?.trim()) && Boolean(verdict.next?.trim());
}

// ── 从库里读回一次追问 ──────────────────────────────────
//
// 放在这里而不是放在抽屉组件里：解析 jsonb 是纯逻辑，跟 React 无关。
// 放在 .tsx 里既没法单测，也会让「库里的形状不可信」这件事被界面代码掩盖。

/** learning_probes 的一行。transcript / verdict 是 jsonb，读的时候一律当未知处理 */
export type ProbeRow = {
  id: string;
  question_id: string;
  transcript: unknown;
  verdict: unknown;
  created_at: string;
};

export type ProbePrevious = {
  transcript: TranscriptEntry[];
  verdict: ProbeVerdict | null;
  createdAt: string;
};

/**
 * 把库里的一行读成可展示的上次记录。
 *
 * 为什么要有这一步：追问记录存下来如果不读，等于只写不看的日志。
 * 打开抽屉时带出上一次，人才看得到「我上次是怎么说的」——
 * 那也是这道题最该复习的部分（当时怎么想的、错在哪）。
 */
export function readStoredProbe(row: ProbeRow | null | undefined): ProbePrevious | null {
  if (!row) return null;

  const transcript: TranscriptEntry[] = Array.isArray(row.transcript)
    ? row.transcript.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const record = entry as Record<string, unknown>;
        const role = record.role;
        const text = typeof record.text === "string" ? record.text.trim() : "";
        if ((role !== "ai" && role !== "me") || !text) return [];
        return [{ role, text }];
      })
    : [];

  const verdict = readVerdict(row.verdict);

  // 只有结论没有对话、或只有对话没有结论的记录，都不值得展示成「上次追问」
  if (transcript.length === 0 && !verdict) return null;

  return { transcript, verdict, createdAt: row.created_at };
}

function readVerdict(raw: unknown): ProbeVerdict | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const stuck = typeof record.stuck === "string" ? record.stuck.trim() : "";
  const next = typeof record.next === "string" ? record.next.trim() : "";
  if (!stuck && !next) return null;
  return {
    stuck,
    next,
    knowledgePointId:
      typeof record.knowledgePointId === "string" && record.knowledgePointId
        ? record.knowledgePointId
        : null,
  };
}
