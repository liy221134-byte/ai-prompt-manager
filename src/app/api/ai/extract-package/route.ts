import { isSupabaseDataMode } from "../../../../lib/server/runtime-config.ts";
import { buildSourcePackageMessages } from "../../../../lib/prompt-ai.ts";
import { normalizeSourcePackageDraft } from "../../../../lib/source-package-draft.ts";
import {
  extractSourcePackageText,
  limitSourcePackageText,
} from "../../../../lib/source-package-text.ts";
import { validateSourcePackageFile } from "../../../../lib/source-package-upload.ts";

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

// 识别只产出草稿：这里不写任何正式资产，创建要等用户确认。
export async function POST(request: Request) {
  if (isSupabaseDataMode()) {
    // 云端才需要校验登录态；按需引入，避免本地路径加载 next/headers
    const { getSupabaseServerClient } = await import(
      "../../../../lib/supabase/server.ts"
    );
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return createErrorResponse("登录状态已失效，请重新登录。", 401);
    }
  }

  let form: FormData;

  try {
    form = await request.formData();
  } catch {
    return createErrorResponse("请求内容不是有效的文件上传。", 400);
  }

  const file = form.get("file");

  if (!(file instanceof File)) {
    return createErrorResponse("没有收到文件。", 400);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateSourcePackageFile({
    filename: file.name,
    byteSize: bytes.byteLength,
    head: bytes.slice(0, 4),
  });

  if (!validation.ok) {
    return createErrorResponse(validation.message, 400);
  }

  let documents;

  try {
    documents = limitSourcePackageText(
      extractSourcePackageText({
        filename: validation.filename,
        bytes,
      }),
    );
  } catch (error) {
    return createErrorResponse(
      error instanceof Error ? error.message : "读取文档包失败。",
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
        temperature: 0.2,
        messages: buildSourcePackageMessages(documents),
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      console.error("AI 服务返回错误", response.status);
      return createErrorResponse("AI 服务调用失败，请稍后重试。", 502);
    }

    const responseBody = (await response.json()) as ChatCompletionResponse;
    const content = responseBody.choices?.[0]?.message?.content;

    if (!content) {
      return createErrorResponse("AI 没有返回可用内容。", 502);
    }

    return Response.json({
      draft: normalizeSourcePackageDraft(content),
      files: documents.map((document) => document.filename),
    });
  } catch (error) {
    if (error instanceof Error && /JSON|草稿|识别出/.test(error.message)) {
      return createErrorResponse(error.message, 502);
    }

    console.error("AI 文档包识别失败", error);
    return createErrorResponse("AI 识别超时或网络连接失败。", 502);
  } finally {
    clearTimeout(timeout);
  }
}
