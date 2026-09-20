import type { PromptVersionData } from "../../../../data/prompts.ts";
import { isPromptCard } from "../../../../lib/prompt-storage.ts";
import { rejectLocalApiInCloudMode } from "../../../../lib/server/local-data-api.ts";
import { getPromptDatabase } from "../../../../lib/server/prompt-database.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function createErrorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function isValidDateString(value: unknown) {
  return (
    typeof value === "string" && !Number.isNaN(new Date(value).getTime())
  );
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isPromptVersionData(value: unknown): value is PromptVersionData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const version = value as Partial<PromptVersionData>;

  return (
    typeof version.versionId === "string" &&
    version.versionId.length > 0 &&
    typeof version.promptId === "string" &&
    typeof version.title === "string" &&
    typeof version.category === "string" &&
    Array.isArray(version.tags) &&
    version.tags.every((tag) => typeof tag === "string") &&
    typeof version.content === "string" &&
    typeof version.useCase === "string" &&
    isValidDateString(version.createdAt) &&
    version.versionReason === "merge_before" &&
    isStringArray(version.sourcePromptIds) &&
    (version.restoredAt === null ||
      typeof version.restoredAt === "string") &&
    isValidDateString(version.expiresAt)
  );
}

function getCommitErrorStatus(message: string) {
  if (
    message.includes("合并来源数量") ||
    message.includes("合并来源存在重复") ||
    message.includes("目标提示词必须包含") ||
    message.includes("恢复快照与目标")
  ) {
    return 400;
  }

  if (
    message.includes("目标提示词不存在") ||
    message.includes("合并来源不存在")
  ) {
    return 404;
  }

  return 500;
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

  const input = (body as { input?: unknown } | null)?.input;

  if (!input || typeof input !== "object") {
    return createErrorResponse("AI 合并请求数据不完整。", 400);
  }

  const {
    prompt,
    sourcePromptIds,
    version,
  } = input as {
    prompt?: unknown;
    sourcePromptIds?: unknown;
    version?: unknown;
  };

  if (
    !isPromptCard(prompt) ||
    !isStringArray(sourcePromptIds) ||
    !isPromptVersionData(version)
  ) {
    return createErrorResponse("AI 合并请求数据不完整。", 400);
  }

  if (
    sourcePromptIds.length < 2 ||
    sourcePromptIds.length > 5 ||
    new Set(sourcePromptIds).size !== sourcePromptIds.length ||
    !sourcePromptIds.includes(prompt.id) ||
    version.promptId !== prompt.id ||
    JSON.stringify(version.sourcePromptIds) !==
      JSON.stringify(sourcePromptIds)
  ) {
    return createErrorResponse("AI 合并请求的来源或目标不合法。", 400);
  }

  try {
    return Response.json(
      getPromptDatabase().commitPromptMerge({
        prompt,
        sourcePromptIds,
        version,
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI 合并失败。";

    console.error("提交 AI 合并失败", error);
    return createErrorResponse(message, getCommitErrorStatus(message));
  }
}
