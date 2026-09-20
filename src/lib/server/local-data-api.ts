import {
  getRuntimeConfigurationError,
  isSupabaseDataMode,
} from "./runtime-config";

export function rejectLocalApiInCloudMode() {
  const configurationError = getRuntimeConfigurationError();

  if (configurationError) {
    return Response.json({ error: configurationError }, { status: 503 });
  }

  if (!isSupabaseDataMode()) {
    return null;
  }

  return Response.json(
    { error: "云端模式不支持本机数据接口。" },
    { status: 404 },
  );
}
