import { isPromptCard } from "../../../../lib/prompt-storage.ts";
import { rejectLocalApiInCloudMode } from "../../../../lib/server/local-data-api.ts";
import { getPromptDatabase } from "../../../../lib/server/prompt-database.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createErrorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const cloudModeError = rejectLocalApiInCloudMode();

  if (cloudModeError) {
    return cloudModeError;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return createErrorResponse("请求内容不是有效的 JSON。", 400);
  }

  const input = (body as { input?: unknown } | null)?.input;

  if (!input || typeof input !== "object") {
    return createErrorResponse("保存优化结果的数据不完整。", 400);
  }

  const { prompt, versionId } = input as {
    prompt?: unknown;
    versionId?: unknown;
  };

  if (
    !isPromptCard(prompt) ||
    typeof versionId !== "string" ||
    !versionId.trim()
  ) {
    return createErrorResponse("保存优化结果的数据不完整。", 400);
  }

  try {
    return Response.json(
      getPromptDatabase().commitPromptOptimize({ prompt, versionId }),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "保存优化结果失败。";

    console.error("提交 AI 优化失败", error);

    return createErrorResponse(
      message,
      message.includes("不存在") ? 404 : 500,
    );
  }
}
