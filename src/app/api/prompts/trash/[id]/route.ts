import { rejectLocalApiInCloudMode } from "../../../../../lib/server/local-data-api.ts";
import { getPromptDatabase } from "../../../../../lib/server/prompt-database.ts";

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

export async function POST(_request: Request, context: RouteContext) {
  const cloudModeError = rejectLocalApiInCloudMode();

  if (cloudModeError) {
    return cloudModeError;
  }

  const { id } = await context.params;

  try {
    const database = getPromptDatabase();

    if (!database.restorePrompt(id)) {
      return createErrorResponse("没有找到要恢复的提示词。", 404);
    }

    return Response.json(database.getLibrarySnapshot());
  } catch (error) {
    console.error("恢复提示词失败", error);
    return createErrorResponse("恢复提示词失败。", 500);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const cloudModeError = rejectLocalApiInCloudMode();

  if (cloudModeError) {
    return cloudModeError;
  }

  const { id } = await context.params;

  try {
    const database = getPromptDatabase();

    if (!database.permanentlyDeletePrompt(id)) {
      return createErrorResponse("没有找到要彻底删除的提示词。", 404);
    }

    return Response.json(database.getLibrarySnapshot());
  } catch (error) {
    console.error("彻底删除提示词失败", error);
    return createErrorResponse("彻底删除提示词失败。", 500);
  }
}
