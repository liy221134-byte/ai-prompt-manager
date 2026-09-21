import { isProjectData } from "@/data/projects";

import { rejectLocalApiInCloudMode } from "../../../../lib/server/local-data-api";
import { getPromptDatabase } from "../../../../lib/server/prompt-database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function createErrorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function PUT(request: Request, context: RouteContext) {
  const cloudModeError = rejectLocalApiInCloudMode();

  if (cloudModeError) {
    return cloudModeError;
  }

  const { id } = await context.params;
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return createErrorResponse("请求内容不是有效的 JSON。", 400);
  }

  const project = (body as { project?: unknown } | null)?.project;

  if (!isProjectData(project) || project.id !== id) {
    return createErrorResponse("项目数据不完整。", 400);
  }

  try {
    const database = getPromptDatabase();

    if (!database.updateProject(project)) {
      return createErrorResponse("项目不存在。", 404);
    }

    return Response.json({ projects: database.listProjects() });
  } catch (error) {
    console.error("更新项目失败", error);
    return createErrorResponse("更新项目失败。", 500);
  }
}
