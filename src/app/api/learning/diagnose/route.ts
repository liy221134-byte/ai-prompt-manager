import { getSupabaseServerClient } from "../../../../lib/supabase/server";
import { isSupabaseDataMode } from "../../../../lib/server/runtime-config";
import {
  buildDiagnosticMessages,
  normalizeDiagnosticAdvice,
  validateDiagnosticRequest,
} from "../../../../lib/learning/diagnostic-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

function createErrorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

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
      return createErrorResponse("登录状态已失效，请重新登录。", 401);
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createErrorResponse("请求内容不是有效的 JSON。", 400);
  }

  const validation = validateDiagnosticRequest(body);
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
        // 归因要的是稳定而不是创意：同一份作答跑两次，结论不该大变
        temperature: 0.2,
        messages: buildDiagnosticMessages(validation.value),
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      console.error("诊断归因调用 AI 失败", response.status);
      return createErrorResponse("AI 服务调用失败，请稍后重试。", 502);
    }

    const responseBody = (await response.json()) as ChatCompletionResponse;
    content = responseBody.choices?.[0]?.message?.content;
  } catch (error) {
    console.error("诊断归因调用异常", error);
    return createErrorResponse("AI 归因超时或网络连接失败。", 502);
  } finally {
    clearTimeout(timeout);
  }

  if (!content) {
    return createErrorResponse("AI 没有返回可用内容。", 502);
  }

  try {
    const advice = normalizeDiagnosticAdvice(
      content,
      validation.value.modules.map((module) => module.moduleId),
    );
    return Response.json({ advice });
  } catch (error) {
    console.error("诊断归因结果格式错误", error);
    return createErrorResponse("AI 归因结果格式错误，可以先用规则结论。", 502);
  }
}
