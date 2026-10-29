import { getSupabaseServerClient } from "../../../../lib/supabase/server";
import { isSupabaseDataMode } from "../../../../lib/server/runtime-config";
import { AiCallError, callChat } from "../../../../lib/ai-chat";
import { countEssayChars, validateEssayReviewRequest } from "../../../../lib/learning/essay";
import { buildEssayReviewMessages, normalizeEssayReview } from "../../../../lib/learning/essay-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 请求体上限。3 万字正文加上 JSON 转义与题目，100KB 上下；留 5 倍余量挡住贴错的整份文档 */
const BODY_MAX_BYTES = 500 * 1024;

/**
 * 论文批改：只判不存，落库在客户端做（与素材表一致）。
 *
 * 为什么不在服务端落库：
 *   服务端落库要在这里再读一次用户、topic、kp，三份查询只为了写一行；
 *   而客户端本来就要把结果渲染出来，顺手写库少一次往返。
 *   更重要的是——批改结果是**他自己要保存的东西**，不是系统自动记的日志。
 *   M6 的图谱检查连库都没有，M5 的追问是服务端不写、客户端写，这里沿用后者。
 *
 * 耗时是这个接口的真风险：2500 字输入 + 结构化输出接近 60 秒上限。
 * 先按单次调用做，`timeoutMs` 留 5 秒给网络与解析。
 * **实测常超时再拆成两次短调用——拆的判据是实测，不是预判。**
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

  // 先看声明的大小再读 body：贴错整份 PDF 转出来的文本可能几 MB，
  // 不预检的话会先进内存再被拒，白白吃掉这段时间。
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > BODY_MAX_BYTES) {
    return Response.json({ error: "贴进来的内容太长了，检查一下是不是贴错了文档。" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "请求内容不是有效的 JSON。" }, { status: 400 });
  }

  const validation = validateEssayReviewRequest(body);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  const { promptText, essayText, draftLabel } = validation.value;

  try {
    const content = await callChat({
      messages: buildEssayReviewMessages({
        promptText,
        essayText,
        draftLabel,
        charCount: countEssayChars(essayText),
      }),
      // 批改要稳定：同一篇跑两次，不该一次说漏子问题(3)、一次说漏(4)
      temperature: 0.2,
      // 长篇输入 + 结构化输出，给足预算。留 5 秒给网络与解析
      timeoutMs: 55_000,
      label: "论文批改",
    });
    return Response.json({ review: normalizeEssayReview(content) });
  } catch (error) {
    if (error instanceof AiCallError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("论文批改结果格式错误", error);
    return Response.json({ error: "AI 批改结果格式错误，可以再试一次。" }, { status: 502 });
  }
}
