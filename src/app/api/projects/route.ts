import { isProjectData } from "@/data/projects";

import { rejectLocalApiInCloudMode } from "../../../lib/server/local-data-api";
import { getPromptDatabase } from "../../../lib/server/prompt-database";

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
    return Response.json({
      projects: getPromptDatabase().listProjects(),
    });
  } catch (error) {
    console.error("读取项目失败", error);
    return createErrorResponse("本机项目服务暂时不可用。", 500);
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

  const project = (body as { project?: unknown } | null)?.project;

  if (!isProjectData(project)) {
    return createErrorResponse("项目数据不完整。", 400);
  }

  try {
    const database = getPromptDatabase();

    if (!database.createProject(project)) {
      return createErrorResponse("这个项目已经存在。", 409);
    }

    return Response.json(
      { projects: database.listProjects() },
      { status: 201 },
    );
  } catch (error) {
    console.error("创建项目失败", error);
    return createErrorResponse("创建项目失败。", 500);
  }
}
