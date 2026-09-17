import { isPromptCard } from "../../../../lib/prompt-storage.ts";
import { getPromptDatabase } from "../../../../lib/server/prompt-database.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function createErrorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return createErrorResponse("请求内容不是有效的 JSON。", 400);
  }

  const prompt = (body as { prompt?: unknown } | null)?.prompt;

  if (!isPromptCard(prompt) || prompt.id !== id) {
    return createErrorResponse("提示词数据不完整或标识不一致。", 400);
  }

  try {
    const database = getPromptDatabase();

    if (!database.updatePrompt(prompt)) {
      return createErrorResponse("没有找到要更新的提示词。", 404);
    }

    return Response.json(database.getLibrarySnapshot());
  } catch (error) {
    console.error("更新提示词失败", error);
    return createErrorResponse("更新提示词失败。", 500);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const database = getPromptDatabase();

    if (!database.deletePrompt(id)) {
      return createErrorResponse("没有找到要删除的提示词。", 404);
    }

    return Response.json(database.getLibrarySnapshot());
  } catch (error) {
    console.error("删除提示词失败", error);
    return createErrorResponse("删除提示词失败。", 500);
  }
}
