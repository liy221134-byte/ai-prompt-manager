import { getSupabaseServerClient } from "../../../../lib/supabase/server";
import { isSupabaseDataMode } from "../../../../lib/server/runtime-config";
import { AiCallError, callChat } from "../../../../lib/ai-chat";
import {
  buildSheetReviewMessages,
  normalizeSheetReview,
  validateSheetReviewRequest,
} from "../../../../lib/learning/sheet-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  try {
    const content = await callChat({
      messages: buildSheetReviewMessages(validation.value),
      // 检查要稳定：同一份内容跑两次，不该一次说漏了 A、一次说漏了 B
      temperature: 0.2,
      label: "素材表检查",
    });
    return Response.json({ review: normalizeSheetReview(content, validation.value) });
  } catch (error) {
    if (error instanceof AiCallError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("素材表检查结果格式错误", error);
    return Response.json({ error: "AI 检查结果格式错误，可以再试一次。" }, { status: 502 });
  }
}
