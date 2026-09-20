export function rejectLocalApiInCloudMode() {
  if (process.env.NEXT_PUBLIC_DATA_MODE !== "supabase") {
    return null;
  }

  return Response.json(
    { error: "云端模式不支持本机数据接口。" },
    { status: 404 },
  );
}
