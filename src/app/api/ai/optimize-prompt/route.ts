import { getSupabaseServerClient } from "../../../../lib/supabase/server";
import { isSupabaseDataMode } from "../../../../lib/server/runtime-config";
import {
  buildAiOptimizeMessages,
  normalizeOptimizedPrompt,
  validateAiOptimizeRequest,
} from "../../../../lib/prompt-ai";
import { AiCallError, callChat } from "../../../../lib/ai-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;


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

  try {
    const content = await callChat({
      messages: buildAiOptimizeMessages(validation.value),
      temperature: 0.2,
      label: "提示词优化",
    });
    return Response.json({
      draft: normalizeOptimizedPrompt(content, {
        originalContent: validation.value.prompt.content,
        allowVariableChanges: validation.value.allowVariableChanges,
      }),
    });
  } catch (error) {
    if (error instanceof AiCallError) {
      return createErrorResponse(error.message, error.status);
    }

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
