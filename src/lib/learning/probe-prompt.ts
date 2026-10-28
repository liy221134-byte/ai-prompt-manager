// M5 追问的提示词拼装 + 返回校验。
//
// 这一层的职责很窄：把「一道错题 + 我说过的话」拼成两段提示词，再把模型吐出来的东西
// 校验成 ProbeTurn。所有规则判断（几轮、问得泛不泛）都不在这里——那在 lib/learning/probe.ts。
//
// 两个刻意的「不给」：
//   1. **不给讲义正文**。给了模型会把讲义当答案念出来，追问立刻变成讲解。
//   2. **不给他题目的现成解析**。理由同上——解析里写的就是「为什么 B 对」，
//      模型看到就会复述。它知道正确答案是哪项就够了（不给就没法判断我错在哪）。
//      代价是它对「这个错法意味着什么」只能靠自己推，但这一版宁可贵一点也不要讲题。

import type { ProbeTurn, ProbeVerdict, TranscriptEntry } from "./probe";

export type ProbeQuestionInput = {
  id: string;
  title: string;
  type: string;
  level: number | null;
  options: string[];
  /** 正确答案，字母或「正确/错误」（单选、多选、判断三种口径） */
  answer: string;
  /** 我选的 */
  selected: string | null;
  /** 知识点 id（KP-xxxx），可为空 */
  knowledgePointId: string | null;
  knowledgePointName: string | null;
};

export type ProbeKnowledgePoint = {
  id: string;
  name: string;
};

export type ProbeRequestInput = {
  phase: "ask" | "verdict";
  question: ProbeQuestionInput;
  /** 同一模块下的知识点候选。结论只能从这里面选，防止模型自己编一个名字 */
  knowledgePoints: ProbeKnowledgePoint[];
  transcript: TranscriptEntry[];
};

/**
 * 校验请求体。
 *
 * 和诊断一样逐字段校验：这里的内容会送进付费调用，前端参数写错时不校验，
 * 得到的是「调用成功但追问胡说」——花钱换一段废话。
 */
export function validateProbeRequest(
  body: unknown,
): { ok: true; value: ProbeRequestInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "请求内容不是对象。" };

  const source = body as Record<string, unknown>;
  const phase = source.phase;
  if (phase !== "ask" && phase !== "verdict") {
    return { ok: false, error: "phase 只能是 ask 或 verdict。" };
  }

  if (!source.question || typeof source.question !== "object") {
    return { ok: false, error: "缺少题目。" };
  }
  const rawQuestion = source.question as Record<string, unknown>;

  const id = textOr(rawQuestion.id, 60);
  if (!id) return { ok: false, error: "题目缺少 id。" };

  const title = textOr(rawQuestion.title, 600);
  if (!title) return { ok: false, error: "题目缺少题干。" };

  const options = Array.isArray(rawQuestion.options)
    ? rawQuestion.options
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0)
        .slice(0, 10)
        .map((item) => textOr(item, 300))
    : [];

  const levelRaw = Number(rawQuestion.level);
  const level = Number.isInteger(levelRaw) && levelRaw >= 1 && levelRaw <= 5 ? levelRaw : null;

  const transcript: TranscriptEntry[] = [];
  if (Array.isArray(source.transcript)) {
    // 状态机最多 3 轮我的回答，正常不会超过 6 条。留 20 条余量，
    // 多余的截掉而不是拒绝——前端传多了一段历史不该让这次追问失败。
    for (const entry of source.transcript.slice(-20)) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const role = record.role;
      if (role !== "ai" && role !== "me") continue;
      const text = textOr(record.text, 1200);
      if (!text) continue;
      transcript.push({ role, text });
    }
  }

  const knowledgePoints: ProbeKnowledgePoint[] = Array.isArray(source.knowledgePoints)
    ? source.knowledgePoints
        .flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const record = item as Record<string, unknown>;
          const kpId = textOr(record.id, 40);
          const name = textOr(record.name, 80);
          if (!kpId || !name) return [];
          return [{ id: kpId, name }];
        })
        .slice(0, 40)
    : [];

  return {
    ok: true,
    value: {
      phase,
      question: {
        id,
        title,
        type: textOr(rawQuestion.type, 20) || "单选",
        level,
        options,
        answer: textOr(rawQuestion.answer, 40),
        selected: textOrNull(rawQuestion.selected, 40),
        knowledgePointId: textOrNull(rawQuestion.knowledgePointId, 40),
        knowledgePointName: textOrNull(rawQuestion.knowledgePointName, 120),
      },
      knowledgePoints,
      transcript,
    },
  };
}

const SYSTEM_PROMPT = `你是一名软考（系统集成项目管理工程师）辅导老师。现在只做一件很窄的事：
通过追问，让学生**自己说出**他错在哪。

学生刚答错了一道题。你要问他当时是怎么想的，听完再问下一个。你的话越少越好。

硬规则，违反任何一条这次追问就作废：
1. **你只能提问，不能讲解。** 不许解释正确答案为什么对，不许说某个选项错在哪，
   不许总结知识点，不许暗示答案，不许说「你应该想到……」。
   学生必须自己想出来；你说出来他就只是在读，没有在思考。
2. **一次只问一个问题。** 一句话里只能有一个问号。
3. **追问必须挂住学生上一句里的具体说法。** 原样引用他说过的词，再针对那个词问。
   反例（这类问句没有对象，学生只会把刚才的话换个说法重复一遍）：
   「能再详细说说吗」「还有其他考虑吗」「为什么会这样呢」「你的思路是什么」。
   正例：「你说『SV 是负的就说明超前』——负的为什么等于超前？」
4. 如果学生答不出任何依据（「我猜的」「记不清了」），不要替他补，
   改问他当时怎么排除另外几个选项的。
5. 不要复述题干，不要评价学生（不说「很好」「不对」），不要鼓励语，不要分点罗列。
6. 每个问题控制在 40 字以内，口语，像真人顺口问一句。
7. 只输出 JSON，不要 markdown 围栏，不要任何解释文字。`;

const ASK_SHAPE = `本轮输出结构：
{"kind":"ask","question":"你要问的那一句话"}
除 question 外不要加任何字段。`;

const VERDICT_SHAPE = (candidates: string) => `学生已经答了三轮，现在收尾，不再提问。给一句结论。

本轮输出结构：
{"kind":"verdict","verdict":{"stuck":"...","knowledgePointId":"... 或 null","next":"..."}}

三个字段的要求：
- stuck：他卡在哪个概念。一句话，必须具体到动作或概念，写成「把 SV 的正负方向记反了」，
  不许写「掌握不牢」「理解不深」「基础薄弱」这类空话。
- knowledgePointId：只能从下面的候选里选一个 id：${candidates}。
  他的问题不属于其中任何一个时返回 null。**不许自己编一个 id 或名字。**
- next：下一步做什么。一句话，今天或本周内能做完的具体动作，
  比如「把挣值分析里 PV/EV/AC 的定义抄一遍，再用这道题的数重算 SV」。
  不许写「加强理解」「多做练习」。`;

/**
 * 拼消息。
 *
 * repair 是「上一句问得不算数」时的追加指令：不重开一段对话，只在同一条消息末尾补一句，
 * 让模型知道要改什么。为什么不把被拦下的句子也给它看——给了它会照着改措辞，
 * 反而更容易变成「换个说法的空话」。
 */
export function buildProbeMessages(
  input: ProbeRequestInput,
  options: { repair?: string } = {},
): Array<{ role: "system" | "user"; content: string }> {
  const question = input.question;
  const optionLines = question.options
    .map((option, index) => `${String.fromCharCode(65 + index)}. ${truncate(option, 160)}`)
    .join("\n");

  const candidates =
    input.knowledgePoints.length > 0
      ? input.knowledgePoints.map((kp) => `${kp.id}（${kp.name}）`).join("、")
      : "（这一块没有知识点清单，knowledgePointId 一律返回 null）";

  const context = [
    `【题目】${truncate(question.title, 600)}`,
    question.type ? `【题型】${question.type}` : "",
    question.level ? `【层级】第${question.level}层` : "",
    optionLines ? `【选项】\n${optionLines}` : "",
    `【正确答案】${question.answer || "（未记录）"}`,
    `【他选了】${question.selected ?? "（未记录）"}`,
    question.knowledgePointName ? `【所属知识点】${question.knowledgePointName}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const dialogue =
    input.transcript.length === 0
      ? "（还没有对话，这是第一问。先问他当时是怎么想的、为什么选这个。）"
      : input.transcript
          .map((entry) => `${entry.role === "ai" ? "你" : "学生"}：${truncate(entry.text, 800)}`)
          .join("\n");

  const phaseInstruction =
    input.phase === "verdict" ? VERDICT_SHAPE(candidates) : ASK_SHAPE;

  const userContent = [
    context,
    "",
    "【对话】",
    dialogue,
    "",
    phaseInstruction,
    options.repair ? `\n上一轮的问题不合要求：${options.repair}` : "",
  ]
    .filter((line, index, all) => !(line === "" && all[index - 1] === ""))
    .join("\n");

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];
}

const QUESTION_MAX = 90;
const VERDICT_ITEM_MAX = 80;

/**
 * 校验并规整模型返回。
 *
 * 策略与诊断归因一致：**结构错了就抛**（上层显示「追问没跑起来」+ 重试），
 * 内容长了就截。另外多做一件事：kind 必须跟请求的 phase 一致——
 * 请求收尾时模型却继续提问，等于会话永远结束不了，必须当成失败重试。
 *
 * 两个重载让调用点拿到确定的形状：请求 ask 就一定是 ask，不用再判一次 kind。
 */
export function normalizeProbeTurn(
  raw: string,
  expected: { phase: "ask"; knowledgePointIds: Iterable<string> },
): { kind: "ask"; question: string };
export function normalizeProbeTurn(
  raw: string,
  expected: { phase: "verdict"; knowledgePointIds: Iterable<string> },
): { kind: "verdict"; verdict: ProbeVerdict };
export function normalizeProbeTurn(
  raw: string,
  expected: { phase: "ask" | "verdict"; knowledgePointIds: Iterable<string> },
): ProbeTurn;
export function normalizeProbeTurn(
  raw: string,
  expected: { phase: "ask" | "verdict"; knowledgePointIds: Iterable<string> },
): ProbeTurn {
  const parsed = safeParse(raw);
  if (!parsed || typeof parsed !== "object") throw new Error("AI 返回的结构不对。");

  const source = parsed as Record<string, unknown>;
  const kind = source.kind;

  if (expected.phase === "ask") {
    if (kind !== "ask") throw new Error("AI 没有继续提问。");
    const question = textOr(source.question, 400);
    if (!question) throw new Error("AI 的问题为空。");
    return { kind: "ask", question: truncate(question, QUESTION_MAX) };
  }

  if (kind !== "verdict") throw new Error("AI 没有给出结论。");
  if (!source.verdict || typeof source.verdict !== "object") throw new Error("AI 的结论是空的。");

  const rawVerdict = source.verdict as Record<string, unknown>;
  const allowed = new Set(expected.knowledgePointIds);
  const claimedId = textOr(rawVerdict.knowledgePointId, 60);

  const verdict: ProbeVerdict = {
    stuck: truncate(textOr(rawVerdict.stuck, 300), VERDICT_ITEM_MAX),
    // 不在候选里就当没选：模型编出来的 id 存进去，以后按知识点统计就全脏了
    knowledgePointId: claimedId && allowed.has(claimedId) ? claimedId : null,
    next: truncate(textOr(rawVerdict.next, 300), VERDICT_ITEM_MAX),
  };

  if (!verdict.stuck) throw new Error("AI 没说卡在哪。");
  if (!verdict.next) throw new Error("AI 没说下一步做什么。");

  return { kind: "verdict", verdict };
}

/** 模型常把 JSON 包在 ```json 围栏里。挖出来 */
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

function textOrNull(value: unknown, max: number): string | null {
  const text = textOr(value, max);
  return text.length > 0 ? text : null;
}

function truncate(text: string, max: number): string {
  const chars = [...text];
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join("")}…`;
}
