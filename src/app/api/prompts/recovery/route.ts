import { rejectLocalApiInCloudMode } from "../../../../lib/server/local-data-api.ts";
import { getPromptDatabase } from "../../../../lib/server/prompt-database.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createErrorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function GET() {
  const cloudModeError = rejectLocalApiInCloudMode();

  if (cloudModeError) {
    return cloudModeError;
  }

  try {
    return Response.json({
      records: getPromptDatabase().listMergeRecoveryRecords(),
    });
  } catch (error) {
    console.error("读取提示词恢复记录失败", error);
    return createErrorResponse("本机数据服务暂时不可用。", 500);
  }
}
