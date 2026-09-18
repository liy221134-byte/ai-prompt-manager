import {
  buildRuleExtractionMessages,
  normalizeRuleExtraction,
} from "../../../../lib/rule-ai";
import { getSupabaseServerClient } from "../../../../lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

function createErrorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_DATA_MODE === "supabase") {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return createErrorResponse("登录状态已失效，请重新登录。", 401);
    }
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return createErrorResponse("请求内容不是有效的 JSON。", 400);
  }

  const rawText = (body as { rawText?: unknown } | null)?.rawText;

  if (
    typeof rawText !== "string" ||
    rawText.trim().length < 20 ||
    rawText.length > 50000
  ) {
    return createErrorResponse(
      "请输入 20 至 50000 个字符的开发资产内容。",
      400,
    );
  }

  const apiBaseUrl = process.env.AI_API_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;

  if (!apiBaseUrl || !apiKey || !model) {
    return createErrorResponse(
      "AI 服务尚未配置，请先设置 AI_API_BASE_URL、AI_API_KEY 和 AI_MODEL。",
      503,
    );
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 50000);

  try {
    const response = await fetch(`${apiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: buildRuleExtractionMessages(rawText),
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      console.error("AI 规则提取服务返回错误", response.status);
      return createErrorResponse("AI 规则提取失败，请稍后重试。", 502);
    }

    const responseBody = (await response.json()) as ChatCompletionResponse;
    const content = responseBody.choices?.[0]?.message?.content;

    if (!content) {
      return createErrorResponse("AI 没有返回规则内容。", 502);
    }

    return Response.json({
      extraction: normalizeRuleExtraction(content),
    });
  } catch (error) {
    console.error("AI 规则提取失败", error);
    return createErrorResponse("AI 规则提取超时或网络连接失败。", 502);
  } finally {
    clearTimeout(timeout);
  }
}
