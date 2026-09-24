import { rejectLocalApiInCloudMode } from "../../../lib/server/local-data-api.ts";
import {
  DocumentScanError,
  scanDocumentDirectory,
} from "../../../lib/server/document-directory-scan.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 只读本机目录，把 Markdown／纯文本读出来当文档草稿；不写任何数据。
// 云端模式读不到用户的本机目录，直接拒绝。
export async function POST(request: Request) {
  const cloudModeError = rejectLocalApiInCloudMode();

  if (cloudModeError) {
    return cloudModeError;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "请求内容不是有效的 JSON。" },
      { status: 400 },
    );
  }

  const directoryPath =
    typeof (body as { path?: unknown } | null)?.path === "string"
      ? ((body as { path: string }).path ?? "")
      : "";

  try {
    return Response.json({
      files: await scanDocumentDirectory({ directoryPath }),
    });
  } catch (error) {
    if (error instanceof DocumentScanError) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    console.error("扫描文档目录失败", error);

    return Response.json(
      { error: "扫描目录失败，请稍后重试。" },
      { status: 500 },
    );
  }
}
