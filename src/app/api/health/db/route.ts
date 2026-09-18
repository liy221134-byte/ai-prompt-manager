import { getSupabaseServiceClient } from "../../../../lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (process.env.NEXT_PUBLIC_DATA_MODE !== "supabase") {
    return Response.json({ ok: true, mode: "local" });
  }

  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!cronSecret) {
    return Response.json(
      { error: "定时任务密钥尚未配置。" },
      { status: 500 },
    );
  }

  if (authorization !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "未授权。" }, { status: 401 });
  }

  try {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase.from("health_checks").upsert({
      id: "heartbeat",
      last_seen_at: new Date().toISOString(),
    });

    if (error) {
      throw error;
    }

    return Response.json({ ok: true, mode: "supabase" });
  } catch (error) {
    console.error("Supabase 心跳检查失败", error);
    return Response.json({ error: "数据库心跳检查失败。" }, { status: 500 });
  }
}
