const SUPABASE_PUBLIC_KEY_ENV_NAMES = [
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

function isVercelDeployment() {
  return Boolean(process.env.VERCEL);
}

function hasSupabasePublicConfig() {
  const hasUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim());
  const hasKey = SUPABASE_PUBLIC_KEY_ENV_NAMES.some((name) =>
    Boolean(process.env[name]?.trim()),
  );

  return hasUrl && hasKey;
}

export function isSupabaseDataMode() {
  return process.env.NEXT_PUBLIC_DATA_MODE?.trim() === "supabase";
}

export function getRuntimeConfigurationError() {
  const dataMode = process.env.NEXT_PUBLIC_DATA_MODE?.trim();

  if (isVercelDeployment() && dataMode !== "supabase") {
    return "线上环境必须使用 Supabase，当前数据模式配置无效，服务已停止。";
  }

  if (dataMode === "supabase" && !hasSupabasePublicConfig()) {
    return "Supabase 公开配置不完整，服务已停止。";
  }

  if (dataMode && dataMode !== "local" && dataMode !== "supabase") {
    return "数据模式配置无效，服务已停止。";
  }

  return null;
}
