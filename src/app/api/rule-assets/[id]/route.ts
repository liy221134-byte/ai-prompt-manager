import { getRuleDatabase } from "../../../../lib/server/rule-database.ts";
import {
  deleteCloudRuleAsset,
  getCloudRuleUser,
} from "../../../../lib/server/rule-store.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    if (process.env.NEXT_PUBLIC_DATA_MODE === "supabase") {
      const user = await getCloudRuleUser();

      if (!user) {
        return Response.json(
          { error: "登录状态已失效，请重新登录。" },
          { status: 401 },
        );
      }

      await deleteCloudRuleAsset(user, id);
      return Response.json({ success: true });
    }

    const deleted = getRuleDatabase().deleteRuleAsset(id);

    return deleted
      ? Response.json({ success: true })
      : Response.json({ error: "没有找到规则资产。" }, { status: 404 });
  } catch (error) {
    console.error("删除规则资产失败", error);
    return Response.json({ error: "删除规则资产失败。" }, { status: 500 });
  }
}
