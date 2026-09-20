import { rejectLocalApiInCloudMode } from "../../../../lib/server/local-data-api.ts";
import { getPromptDatabase } from "../../../../lib/server/prompt-database.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createErrorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function createTrashSnapshot() {
  const database = getPromptDatabase();

  return {
    version: database.getLibraryVersion(),
    prompts: database.listTrash(),
  };
}

export async function GET() {
  const cloudModeError = rejectLocalApiInCloudMode();

  if (cloudModeError) {
    return cloudModeError;
  }

  try {
    return Response.json(createTrashSnapshot());
  } catch (error) {
    console.error("读取提示词垃圾箱失败", error);
    return createErrorResponse("本机数据服务暂时不可用。", 500);
  }
}

export async function DELETE() {
  const cloudModeError = rejectLocalApiInCloudMode();

  if (cloudModeError) {
    return cloudModeError;
  }

  try {
    const database = getPromptDatabase();

    database.emptyTrash();

    return Response.json(database.getLibrarySnapshot());
  } catch (error) {
    console.error("清空提示词垃圾箱失败", error);
    return createErrorResponse("清空垃圾箱失败。", 500);
  }
}
