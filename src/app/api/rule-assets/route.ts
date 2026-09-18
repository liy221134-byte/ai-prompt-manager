import type { RuleAssetData } from "../../../data/rule-assets.ts";
import { isRuleAssetData } from "../../../lib/rule-validation.ts";
import { getRuleDatabase } from "../../../lib/server/rule-database.ts";
import {
  getCloudRuleUser,
  listCloudRuleAssets,
  saveCloudRuleAsset,
} from "../../../lib/server/rule-store.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isCloudMode() {
  return process.env.NEXT_PUBLIC_DATA_MODE === "supabase";
}

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function GET() {
  try {
    if (isCloudMode()) {
      const user = await getCloudRuleUser();

      if (!user) {
        return errorResponse("登录状态已失效，请重新登录。", 401);
      }

      return Response.json({ assets: await listCloudRuleAssets(user) });
    }

    return Response.json({ assets: getRuleDatabase().listRuleAssets() });
  } catch (error) {
    console.error("读取规则资产失败", error);
    return errorResponse("读取规则资产失败。", 500);
  }
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse("请求内容不是有效的 JSON。", 400);
  }

  const asset = (body as { asset?: unknown } | null)?.asset;

  if (!isRuleAssetData(asset)) {
    return errorResponse("规则资产数据不完整。", 400);
  }

  try {
    if (isCloudMode()) {
      const user = await getCloudRuleUser();

      if (!user) {
        return errorResponse("登录状态已失效，请重新登录。", 401);
      }

      await saveCloudRuleAsset(user, asset);
      return Response.json({ assets: await listCloudRuleAssets(user) });
    }

    const database = getRuleDatabase();
    database.saveRuleAsset(asset as RuleAssetData);
    return Response.json({ assets: database.listRuleAssets() });
  } catch (error) {
    console.error("保存规则资产失败", error);
    return errorResponse("保存规则资产失败。", 500);
  }
}
