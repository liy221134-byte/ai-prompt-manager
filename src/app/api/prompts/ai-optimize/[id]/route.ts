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

// 查询这条提示词最近一次未被消费的优化前快照，界面据此决定是否显示「回到优化前」。
export async function GET(_request: Request, context: RouteContext) {
  const cloudModeError = rejectLocalApiInCloudMode();

  if (cloudModeError) {
    return cloudModeError;
  }

  const { id } = await context.params;

  try {
    return Response.json({
      version: getPromptDatabase().fetchLatestOptimizeVersion(id),
    });
  } catch (error) {
    console.error("读取优化记录失败", error);
    return createErrorResponse("读取优化记录失败。", 500);
  }
}

export async function POST(_request: Request, context: RouteContext) {
  const cloudModeError = rejectLocalApiInCloudMode();

  if (cloudModeError) {
    return cloudModeError;
  }

  const { id } = await context.params;

  try {
    // 回退前快照的编号由服务端生成，客户端只提供提示词标识。
    const restoredLibrary = getPromptDatabase().restorePromptOptimize(id);

    if (!restoredLibrary) {
      return createErrorResponse("没有可以回退的优化记录。", 404);
    }

    return Response.json(restoredLibrary);
  } catch (error) {
    console.error("回到优化前失败", error);
    return createErrorResponse("回到优化前失败。", 500);
  }
}
