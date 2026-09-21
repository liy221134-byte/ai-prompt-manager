import {
  type AssetVersionReason,
  isAssetData,
} from "@/data/assets";

import { rejectLocalApiInCloudMode } from "../../../lib/server/local-data-api";
import { getPromptDatabase } from "../../../lib/server/prompt-database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createErrorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function readAssetSaveInput(body: unknown) {
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
    typeof value.versionId !== "string" ||
    !value.versionId.trim() ||
    typeof value.changeReason !== "string" ||
    !value.changeReason.trim() ||
    (value.versionReason !== undefined &&
      typeof value.versionReason !== "string") ||
    (value.sourceAssetIds !== undefined &&
      (!Array.isArray(value.sourceAssetIds) ||
        !value.sourceAssetIds.every((item) => typeof item === "string"))) ||
    (value.restoredAt !== undefined &&
      value.restoredAt !== null &&
      typeof value.restoredAt !== "string") ||
    (value.expiresAt !== undefined &&
      value.expiresAt !== null &&
      typeof value.expiresAt !== "string")
  ) {
    return null;
  }

  return {
    asset: value.asset,
    versionId: value.versionId,
    changeReason: value.changeReason,
    versionReason: value.versionReason as AssetVersionReason | undefined,
    sourceAssetIds: value.sourceAssetIds as string[] | undefined,
    restoredAt: value.restoredAt as string | null | undefined,
    expiresAt: value.expiresAt as string | null | undefined,
  };
}

export async function GET(request: Request) {
  const cloudModeError = rejectLocalApiInCloudMode();

  if (cloudModeError) {
    return cloudModeError;
  }

  const projectId =
    new URL(request.url).searchParams.get("projectId") ?? undefined;

  try {
    return Response.json({
      assets: getPromptDatabase().listAssets(projectId),
    });
  } catch (error) {
    console.error("读取资产失败", error);
    return createErrorResponse("本机资产服务暂时不可用。", 500);
  }
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

  const input = readAssetSaveInput(body);

  if (!input) {
    return createErrorResponse("资产数据不完整。", 400);
  }

  try {
    const database = getPromptDatabase();

    if (!database.createAsset(input)) {
      return createErrorResponse("这个资产已经存在。", 409);
    }

    return Response.json(
      { assets: database.listAssets(input.asset.projectId) },
      { status: 201 },
    );
  } catch (error) {
    console.error("创建资产失败", error);
    return createErrorResponse("创建资产失败。", 500);
  }
}
