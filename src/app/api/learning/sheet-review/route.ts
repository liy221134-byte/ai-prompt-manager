import { getSupabaseServerClient } from "../../../../lib/supabase/server";
import { isSupabaseDataMode } from "../../../../lib/server/runtime-config";
import {
  buildSheetReviewMessages,
  normalizeSheetReview,
  validateSheetReviewRequest,
} from "../../../../lib/learning/sheet-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

/**
 * 一页素材表的 AI 检查：只读不改。
 *
 * 这个路由**不写库**，也不返回任何可以直接替换原文的东西——返回的就是三份清单。
 * 界面把清单摆在旁边，改不改由人在输入框里自己动手。这条边界是 PRD 第 7 条的底线：
 * 一旦有了「一键采纳」，一页纸就变成 AI 写的，这张纸也就失去「检验我会不会」的作用。
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

  const validation = validateSheetReviewRequest(body);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  const apiBaseUrl = process.env.AI_API_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;

  if (!apiBaseUrl || !apiKey || !model) {
    return Response.json(
      { error: "AI 服务尚未配置，请先设置 AI_API_BASE_URL、AI_API_KEY 和 AI_MODEL。" },
      { status: 503 },
    );
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 50_000);
  let content: string | undefined;

  try {
    const response = await fetch(`${apiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        // 检查要稳定：同一份内容跑两次，不该一次说漏了 A、一次说漏了 B
        temperature: 0.2,
        messages: buildSheetReviewMessages(validation.value),
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      console.error("素材表检查调用 AI 失败", response.status);
      return Response.json({ error: "AI 服务调用失败，请稍后重试。" }, { status: 502 });
    }

    const responseBody = (await response.json()) as ChatCompletionResponse;
    content = responseBody.choices?.[0]?.message?.content;
  } catch (error) {
    console.error("素材表检查调用异常", error);
    return Response.json({ error: "AI 检查超时或网络连接失败。" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }

  if (!content) {
    return Response.json({ error: "AI 没有返回可用内容。" }, { status: 502 });
  }

  try {
    const review = normalizeSheetReview(content, validation.value);
    return Response.json({ review });
  } catch (error) {
    console.error("素材表检查结果格式错误", error);
    return Response.json({ error: "AI 检查结果格式错误，可以再试一次。" }, { status: 502 });
  }
}
