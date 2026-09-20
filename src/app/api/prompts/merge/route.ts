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

  const prompts = (body as { prompts?: unknown } | null)?.prompts;

  if (
    !Array.isArray(prompts) ||
    prompts.length > 10000 ||
    !prompts.every(isPromptCard)
  ) {
    return createErrorResponse("待合并的提示词数据不完整。", 400);
  }

  const promptIds = prompts.map((prompt) => prompt.id);

  if (new Set(promptIds).size !== promptIds.length) {
    return createErrorResponse("待合并数据中存在重复的提示词标识。", 400);
  }

  try {
    return Response.json(getPromptDatabase().mergePrompts(prompts));
  } catch (error) {
    console.error("合并提示词失败", error);
    return createErrorResponse("合并提示词失败。", 500);
  }
}
