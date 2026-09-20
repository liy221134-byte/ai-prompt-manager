import { getSupabaseServiceClient } from "../../../../lib/supabase/service";
import {
  getRuntimeConfigurationError,
  isSupabaseDataMode,
} from "../../../../lib/server/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const configurationError = getRuntimeConfigurationError();

  if (configurationError) {
    return Response.json({ error: configurationError }, { status: 503 });
  }

  if (!isSupabaseDataMode()) {
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

    // 清理失败只记录日志，不把每日心跳整体判定为失败。
    const { error: purgeError } = await supabase.rpc(
      "purge_expired_prompt_versions",
    );

    if (purgeError) {
      console.error("清理过期提示词恢复数据失败", purgeError);
    }

    return Response.json({ ok: true, mode: "supabase" });
  } catch (error) {
    console.error("Supabase 心跳检查失败", error);
    return Response.json({ error: "数据库心跳检查失败。" }, { status: 500 });
  }
}
