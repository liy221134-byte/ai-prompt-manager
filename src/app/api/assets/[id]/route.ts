import {
  type AssetVersionReason,
  isAssetData,
} from "@/data/assets";

import { rejectLocalApiInCloudMode } from "../../../../lib/server/local-data-api";
import { getPromptDatabase } from "../../../../lib/server/prompt-database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function createErrorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function PUT(request: Request, context: RouteContext) {
  const cloudModeError = rejectLocalApiInCloudMode();

  if (cloudModeError) {
    return cloudModeError;
  }

  const { id } = await context.params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return createErrorResponse("请求内容不是有效的 JSON。", 400);
  }

  const value = body as
    | {
        asset?: unknown;
        versionId?: unknown;
        changeReason?: unknown;
        versionReason?: unknown;
        sourceAssetIds?: unknown;
        restoredAt?: unknown;
        expiresAt?: unknown;
      }
    | null;

  if (
    !value ||
    !isAssetData(value.asset) ||
    value.asset.id !== id ||
    typeof value.versionId !== "string" ||
    !value.versionId.trim() ||
    typeof value.changeReason !== "string" ||
    !value.changeReason.trim()
  ) {
    return createErrorResponse("资产数据不完整。", 400);
  }

  try {
    const database = getPromptDatabase();
    const updated = database.updateAsset({
      asset: value.asset,
      versionId: value.versionId,
      changeReason: value.changeReason,
      versionReason: value.versionReason as AssetVersionReason | undefined,
      sourceAssetIds: value.sourceAssetIds as string[] | undefined,
      restoredAt: value.restoredAt as string | null | undefined,
      expiresAt: value.expiresAt as string | null | undefined,
    });

    if (!updated) {
      return createErrorResponse("资产不存在。", 404);
    }

    return Response.json({
      assets: database.listAssets(value.asset.projectId),
    });
  } catch (error) {
    console.error("更新资产失败", error);
    return createErrorResponse("更新资产失败。", 500);
  }
}
