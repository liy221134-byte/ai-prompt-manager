import { isPromptCard } from "../../../lib/prompt-storage.ts";
import { rejectLocalApiInCloudMode } from "../../../lib/server/local-data-api.ts";
import { getPromptDatabase } from "../../../lib/server/prompt-database.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createErrorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function GET() {
  const cloudModeError = rejectLocalApiInCloudMode();

  if (cloudModeError) {
    return cloudModeError;
  }

  try {
    return Response.json(getPromptDatabase().getLibrarySnapshot());
  } catch (error) {
    console.error("读取提示词数据库失败", error);
    return createErrorResponse("本机数据服务暂时不可用。", 500);
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

  const prompt = (body as { prompt?: unknown } | null)?.prompt;

  if (!isPromptCard(prompt)) {
    return createErrorResponse("提示词数据不完整。", 400);
  }

  try {
    const database = getPromptDatabase();

    if (!database.createPrompt(prompt)) {
      return createErrorResponse("这条提示词已经存在。", 409);
    }

    return Response.json(database.getLibrarySnapshot(), { status: 201 });
  } catch (error) {
    console.error("新增提示词失败", error);
    return createErrorResponse("新增提示词失败。", 500);
  }
}
