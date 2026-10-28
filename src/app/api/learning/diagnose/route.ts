import { getSupabaseServerClient } from "../../../../lib/supabase/server";
import { isSupabaseDataMode } from "../../../../lib/server/runtime-config";
import { AiCallError, callChat } from "../../../../lib/ai-chat";
import {
  buildDiagnosticMessages,
  normalizeDiagnosticAdvice,
  validateDiagnosticRequest,
} from "../../../../lib/learning/diagnostic-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 诊断归因：整卷答完后调一次。
 *
 * 为什么整卷一次而不是每模块一次：六个模块各调一次，换来的是六段彼此不知道对方存在的
 * 结论，还得再拼一次。一次给全部错题，模型能看出「三个模块都错在把输入当输出」这种
 * 跨模块的共同问题——那才是归因有价值的地方。
 *
 * 这个路由**不写库**：结论由前端拿到人在界面上确认/修改后再保存。
 * 把写库放在这里意味着「AI 说什么就存什么」，而 AI 的归因恰恰是允许人否掉的。
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

  const validation = validateDiagnosticRequest(body);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  try {
    const content = await callChat({
      messages: buildDiagnosticMessages(validation.value),
      // 归因要的是稳定而不是创意：同一份作答跑两次，结论不该大变
      temperature: 0.2,
      label: "诊断归因",
    });
    const advice = normalizeDiagnosticAdvice(
      content,
      validation.value.modules.map((module) => module.moduleId),
    );
    return Response.json({ advice });
  } catch (error) {
    if (error instanceof AiCallError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("诊断归因结果格式错误", error);
    return Response.json({ error: "AI 归因结果格式错误，可以先用规则结论。" }, { status: 502 });
  }
}
