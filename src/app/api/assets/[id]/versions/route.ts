import { rejectLocalApiInCloudMode } from "../../../../../lib/server/local-data-api";
import { getPromptDatabase } from "../../../../../lib/server/prompt-database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const cloudModeError = rejectLocalApiInCloudMode();

  if (cloudModeError) {
    return cloudModeError;
  }

  const { id } = await context.params;

  try {
    return Response.json({
      versions: getPromptDatabase().listAssetVersions(id),
    });
  } catch (error) {
    console.error("读取资产版本失败", error);
    return Response.json(
      { error: "本机资产版本服务暂时不可用。" },
      { status: 500 },
    );
  }
}
