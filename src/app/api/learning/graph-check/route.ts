import { getSupabaseServerClient } from "../../../../lib/supabase/server";
import { isSupabaseDataMode } from "../../../../lib/server/runtime-config";
import { AiCallError, callChat } from "../../../../lib/ai-chat";
import { GRAPH_IMAGE_MAX_BYTES } from "../../../../lib/learning/graph";
import { buildGraphCheckMessages, normalizeGraphCheck, validateGraphCheckRequest } from "../../../../lib/learning/graph-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 手绘知识图谱的 AI 检查：只读不改，**不写库**。
 *
 * 为什么不落库（与素材表刻意不同）：
 *   素材表落库，是因为它是**持续编辑的一份内容**——今天写三段、明天补两段，页面上要能接着写。
 *   图谱检查是**一次性判读**：每次输入是一张新照片，产物是「这次缺了什么」的即时反馈。
 *   存下来只会堆一堆再也打不开的记录，而照片本身在他的相册里。
 *   等真的出现「想看一个月前卡在哪」这个需求时再建表，那时候才知道该存什么。
 *
 * 返回的东西也不含任何可以直接贴回图上的结构——四份清单，改不改、补不补由他自己动手。
 * 这条边界是 PRD 第 3 节第 7 条的底线：一旦有了「一键生成本周图谱」，这张图就不再是他画的。
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

  // 先看声明的大小再读 body：图片请求可能几 MB，不预检的话
  // 一份 200MB 的请求会先进内存再被拒，白白吃掉这段时间。
  const declared = Number(request.headers.get("content-length") ?? "0");
  // base64 比二进制大三分之一，再加 JSON 其余字段的余量
  if (Number.isFinite(declared) && declared > GRAPH_IMAGE_MAX_BYTES * 1.5) {
    return Response.json({ error: "这张图太大了，请重新拍一张。" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求内容不是有效的 JSON。" }, { status: 400 });
  }

  const validation = validateGraphCheckRequest(body);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  try {
    const content = await callChat({
      messages: buildGraphCheckMessages(validation.value),
      // 判读要稳定：同一张图跑两次，不该一次说漏了 A、一次说漏了 B
      temperature: 0.1,
      // 图片比纯文字慢，给足预算。留 5 秒给网络与解析
      timeoutMs: 55_000,
      label: "知识图谱检查",
    });
    return Response.json({ check: normalizeGraphCheck(content, validation.value) });
  } catch (error) {
    if (error instanceof AiCallError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("知识图谱检查结果格式错误", error);
    return Response.json({ error: "AI 检查结果格式错误，可以再试一次。" }, { status: 502 });
  }
}
