import { getSupabaseServerClient } from "../../../../lib/supabase/server";
import { isSupabaseDataMode } from "../../../../lib/server/runtime-config";
import {
  AI_NOT_CONFIGURED_MESSAGE,
  AiCallError,
  callChat,
  readChatConfig,
} from "../../../../lib/ai-chat";
import {
  buildProbeMessages,
  normalizeProbeTurn,
  validateProbeRequest,
  type ProbeRequestInput,
} from "../../../../lib/learning/probe-prompt";
import {
  checkFollowUp,
  countMyAnswers,
  repairHint,
  type ProbeTurn,
} from "../../../../lib/learning/probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 整次请求的预算。一次追问最多三次模型调用（问 → 重问 → 收尾），共用这个预算 */
const TOTAL_BUDGET_MS = 50_000;
/** 单次调用最多给这么久；剩下的时间留给可能的补问 */
const CALL_TIMEOUT_MS = 25_000;

/**
 * 对话式追问：一次请求处理一个回合。
 *
 * 这个路由**不写库**——和诊断归因同一个理由：结论要人在界面上确认/修改后才存，
 * 把写库放这里等于「AI 说什么就存什么」，而追问结论恰恰是允许人否掉的。
 *
 * 为什么一个路由管两段（提问 / 收尾）而不是两个路由：
 * 两段共用同一份上下文拼装（题目、选项、正确答案、对话历史），拆开就要么复制一遍，
 * 要么再抽一层只被调用两次的公共函数。
 */
export async function POST(request: Request) {
  if (isSupabaseDataMode()) {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "登录状态已失效，请重新登录。" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求内容不是有效的 JSON。" }, { status: 400 });
  }

  const validation = validateProbeRequest(body);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  if (!readChatConfig()) {
    return Response.json({ error: AI_NOT_CONFIGURED_MESSAGE }, { status: 503 });
  }

  const deadline = Date.now() + TOTAL_BUDGET_MS;

  try {
    const result = await runTurn(validation.value, deadline);
    return Response.json(result);
  } catch (error) {
    if (error instanceof AiCallError) {
      return Response.json({ error: `追问没跑起来：${error.message}` }, { status: error.status });
    }
    const reason = error instanceof Error ? error.message : "未知原因";
    console.error("追问失败", reason);
    return Response.json({ error: `追问没跑起来：${reason}` }, { status: 502 });
  }
}

type TurnResult = {
  turn: ProbeTurn;
  /**
   * 给界面的一句说明。目前只有一种：模型连续两次问得空泛，提前收尾了。
   * 不写这个字段界面会突然冒出结论，人不知道发生了什么。
   */
  note: string | null;
};

async function runTurn(input: ProbeRequestInput, deadline: number): Promise<TurnResult> {
  const knowledgePointIds = input.knowledgePoints.map((kp) => kp.id);
  // 追问要的是「顺着我这句话往下问」，不是创意写作。温度高了会开始发挥解释
  const turnTemperature = 0.3;

  const ask = (messages: ReturnType<typeof buildProbeMessages>) =>
    callChat({
      messages,
      temperature: turnTemperature,
      timeoutMs: CALL_TIMEOUT_MS,
      deadline,
      label: "追问",
    });

  // ── 收尾段：直接要结论 ────────────────────────────────
  if (input.phase === "verdict") {
    const content = await ask(buildProbeMessages(input));
    return {
      turn: normalizeProbeTurn(content, { phase: "verdict", knowledgePointIds }),
      note: null,
    };
  }

  const first = await ask(buildProbeMessages(input));
  const turn = normalizeProbeTurn(first, { phase: "ask", knowledgePointIds });

  // 第一问没有「上一轮回答」可引用，不参与「问得泛」的判定——
  // 第一问本来就该是「你当时怎么想的」，那是正确形态，不是空话。
  if (countMyAnswers(input.transcript) === 0) {
    return { turn, note: null };
  }

  const check = checkFollowUp(turn.question, input.transcript);
  if (check.ok) return { turn, note: null };

  // 问得空泛：给模型一次改正的机会。不把被拦下的句子告诉用户——
  // 用户看到的是「AI 在追问」，中间那一下没必要展示，展示了像系统在挑刺。
  console.warn("追问被判定为空泛，重问一次", check.reason);
  const repairedRaw = await ask(buildProbeMessages(input, { repair: repairHint(check) }));
  const repaired = normalizeProbeTurn(repairedRaw, { phase: "ask", knowledgePointIds });
  const recheck = checkFollowUp(repaired.question, input.transcript);
  if (recheck.ok) return { turn: repaired, note: null };

  // 两次都问不出具体的，就别再耗了：直接收尾出结论。
  // 比强行把一句空话塞给用户强——那会让人以为「追问就这水平」。
  console.warn("连续两次追问空泛，提前收尾", recheck.reason);
  const verdictRaw = await ask(
    buildProbeMessages({ ...input, phase: "verdict" }, { repair: "问不下去了，直接给结论。" }),
  );
  return {
    turn: normalizeProbeTurn(verdictRaw, { phase: "verdict", knowledgePointIds }),
    note: "这一轮没追出更具体的内容，先给结论。",
  };
}
