import { isSupabaseDataMode } from "../../../../lib/server/runtime-config.ts";
import { buildSourcePackageMessages } from "../../../../lib/prompt-ai.ts";
import { normalizeSourcePackageDraft } from "../../../../lib/source-package-draft.ts";
import {
  extractSourcePackageText,
  limitSourcePackageText,
} from "../../../../lib/source-package-text.ts";
import { validateSourcePackageFile } from "../../../../lib/source-package-upload.ts";
import { AiCallError, callChat } from "../../../../lib/ai-chat.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;


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

  try {
    const content = await callChat({
      messages: buildSourcePackageMessages(documents),
      temperature: 0.2,
      label: "文档包识别",
    });
    return Response.json({
      draft: normalizeSourcePackageDraft(content),
      files: documents.map((document) => document.filename),
    });
  } catch (error) {
    if (error instanceof AiCallError) {
      return createErrorResponse(error.message, error.status);
    }

    if (error instanceof Error && /JSON|草稿|识别出/.test(error.message)) {
      return createErrorResponse(error.message, 502);
    }

    console.error("AI 文档包识别失败", error);
    return createErrorResponse("AI 识别超时或网络连接失败。", 502);
  }
}
