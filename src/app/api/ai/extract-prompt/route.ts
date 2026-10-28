import { getSupabaseServerClient } from "../../../../lib/supabase/server";
import { isSupabaseDataMode } from "../../../../lib/server/runtime-config";
import {
  buildAiExtractionMessages,
  normalizeExtractedPrompt,
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

  const rawText = (body as { rawText?: unknown } | null)?.rawText;

  if (
    typeof rawText !== "string" ||
    rawText.trim().length < 10 ||
    rawText.length > 30000
  ) {
    return createErrorResponse(
      "请输入 10 至 30000 个字符的提示词内容。",
      400,
    );
  }

  try {
    const content = await callChat({
      messages: buildAiExtractionMessages(rawText),
      temperature: 0.2,
      label: "提示词识别",
    });
    return Response.json({ draft: normalizeExtractedPrompt(content) });
  } catch (error) {
    if (error instanceof AiCallError) {
      return createErrorResponse(error.message, error.status);
    }
    console.error("AI 提示词识别结果格式错误", error);
    return createErrorResponse("AI 识别结果格式错误，请重试。", 502);
  }
}
