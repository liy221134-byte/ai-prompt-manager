import { getPromptDatabase } from "../../../../lib/server/prompt-database.ts";
import { getRuntimeConfigurationError, isSupabaseDataMode } from "../../../../lib/server/runtime-config.ts";
import {
  checkSourcePackageDraftLimit,
  type SourcePackageDraft,
} from "../../../../lib/source-package-draft.ts";
import {
  planSourcePackageCreation,
  type SourcePackageCreationPlan,
  type SourcePackageProjectChoice,
  type SourcePackageUploadRef,
} from "../../../../lib/source-package-confirm.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createErrorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readUploads(value: unknown): SourcePackageUploadRef[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const uploads: SourcePackageUploadRef[] = [];

  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.uploadId !== "string" ||
      typeof item.filename !== "string" ||
      typeof item.storedPath !== "string" ||
      typeof item.byteSize !== "number"
    ) {
      return null;
    }

    uploads.push({
      uploadId: item.uploadId,
      filename: item.filename,
      storedPath: item.storedPath,
      byteSize: item.byteSize,
    });
  }

  return uploads;
}

function readDraft(value: unknown): SourcePackageDraft | null {
  if (!isRecord(value) || !isRecord(value.project) || !Array.isArray(value.items)) {
    return null;
  }

  const items = value.items.filter(isRecord).map((item, index) => ({
    id: typeof item.id === "string" ? item.id : `draft-${index + 1}`,
    sourceFilename:
      typeof item.sourceFilename === "string" ? item.sourceFilename : "未命名文件",
    assetType: item.assetType,
    title: typeof item.title === "string" ? item.title : "",
    summary: typeof item.summary === "string" ? item.summary : "",
    content: typeof item.content === "string" ? item.content : "",
    reason: typeof item.reason === "string" ? item.reason : "",
  })) as SourcePackageDraft["items"];

  if (
    items.some(
      (item) =>
        !item.title.trim() ||
        !item.content.trim() ||
        !["prompt", "rule", "document"].includes(item.assetType),
    )
  ) {
    return null;
  }

  return {
    project: {
      name: typeof value.project.name === "string" ? value.project.name : "导入的项目",
      goal: typeof value.project.goal === "string" ? value.project.goal : "",
    },
    items,
    skipped: [],
  };
}

function readProjectChoice(value: unknown): SourcePackageProjectChoice | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.mode === "existing" && typeof value.projectId === "string") {
    return { mode: "existing", projectId: value.projectId };
  }

  if (value.mode === "new" && typeof value.name === "string") {
    return {
      mode: "new",
      name: value.name,
      goal: typeof value.goal === "string" ? value.goal : "",
    };
  }

  return null;
}

// 用户在预览里确认后才走到这里：项目、来源包、资产一次性创建。
export async function POST(request: Request) {
  const configurationError = getRuntimeConfigurationError();

  if (configurationError) {
    return createErrorResponse(configurationError, 503);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return createErrorResponse("请求内容不是有效的 JSON。", 400);
  }

  const value = isRecord(body) ? body : {};
  const uploads = readUploads(value.uploads);
  const draft = readDraft(value.draft);
  const project = readProjectChoice(value.project);
  const importBatchId =
    typeof value.importBatchId === "string" && value.importBatchId.trim()
      ? value.importBatchId
      : null;

  if (!uploads) {
    return createErrorResponse("没有可创建的上传记录。", 400);
  }

  if (!draft) {
    return createErrorResponse("草稿内容不完整，请检查标题、正文和资产类型。", 400);
  }

  if (!project) {
    return createErrorResponse("请选择要导入的项目。", 400);
  }

  if (!importBatchId) {
    return createErrorResponse("缺少导入批次编号。", 400);
  }

  const limitError = checkSourcePackageDraftLimit(draft);

  if (limitError) {
    return createErrorResponse(limitError, 400);
  }

  const plan = planSourcePackageCreation({
    draft,
    uploads,
    importBatchId,
    project,
  });

  // 云端走登录会话写库（行级安全按账号隔离），本地走 SQLite。
  if (isSupabaseDataMode()) {
    return createSourcePackageInCloud(plan, project);
  }

  try {
    const created = getPromptDatabase().createSourcePackageImport(plan);
    const projectId = plan.project
      ? plan.project.id
      : project.mode === "existing"
        ? project.projectId
        : null;

    return Response.json(
      { created, projectId },
      { status: 201 },
    );
  } catch (error) {
    console.error("创建导入资产失败", error);

    return createErrorResponse(
      error instanceof Error && error.message.includes("已经存在")
        ? error.message
        : "创建导入资产失败。",
      409,
    );
  }
}

async function createSourcePackageInCloud(
  plan: SourcePackageCreationPlan,
  project: SourcePackageProjectChoice,
) {
  const { getSupabaseServerClient } = await import(
    "../../../../lib/supabase/server.ts"
  );
  const { createSupabasePromptDataSource } = await import(
    "../../../../lib/prompt-source.ts"
  );
  const client = await getSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return createErrorResponse("请先登录再导入文档包。", 401);
  }

  const source = createSupabasePromptDataSource(client);

  try {
    if (plan.project) {
      await source.createProject(plan.project);
    }

    for (const asset of plan.sourcePackages) {
      await source.createAsset({
        asset,
        versionId: asset.currentVersionId,
        changeReason: "导入文档包",
        versionReason: "initial",
      });
    }

    for (const item of plan.assets) {
      await source.createAsset({
        asset: item.asset,
        versionId: item.version.versionId,
        changeReason: "导入文档包",
        versionReason: "initial",
      });
    }
  } catch (error) {
    console.error("创建导入资产失败（云端）", error);

    return createErrorResponse(
      error instanceof Error ? error.message : "创建导入资产失败。",
      409,
    );
  }

  const projectId = plan.project
    ? plan.project.id
    : project.mode === "existing"
      ? project.projectId
      : null;

  return Response.json(
    {
      created: {
        projects: plan.project ? 1 : 0,
        sourcePackages: plan.sourcePackages.length,
        assets: plan.assets.length,
      },
      projectId,
    },
    { status: 201 },
  );
}
