import { getSupabaseServerClient } from "../../../../lib/supabase/server";
import { isSupabaseDataMode } from "../../../../lib/server/runtime-config";
import {
  buildAiOptimizeMessages,
  normalizeOptimizedPrompt,
  validateAiOptimizeRequest,
} from "../../../../lib/prompt-ai";

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
  if (isSupabaseDataMode()) {
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

  const validation = validateAiOptimizeRequest(body);

  if (!validation.ok) {
    return createErrorResponse(validation.error, 400);
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
        temperature: 0.2,
        messages: buildAiOptimizeMessages(validation.value),
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      console.error("AI 服务返回错误", response.status);
      return createErrorResponse("AI 服务调用失败，请稍后重试。", 502);
    }

    const responseBody = (await response.json()) as ChatCompletionResponse;
    content = responseBody.choices?.[0]?.message?.content;
  } catch (error) {
    console.error("AI 提示词优化调用失败", error);
    return createErrorResponse("AI 优化超时或网络连接失败。", 502);
  } finally {
    clearTimeout(timeout);
  }

  if (!content) {
    return createErrorResponse("AI 没有返回可用内容。", 502);
  }

  try {
    return Response.json({
      draft: normalizeOptimizedPrompt(content, {
        originalContent: validation.value.prompt.content,
        allowVariableChanges: validation.value.allowVariableChanges,
      }),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI 优化结果格式错误。";

    // 变量集合不一致属于「AI 越界」，提示用户重新生成或显式允许调整变量。
    if (message.includes("变量集合")) {
      return createErrorResponse(message, 422);
    }

    console.error("AI 提示词优化结果格式错误", error);
    return createErrorResponse("AI 优化结果格式错误，请重试。", 502);
  }
}
