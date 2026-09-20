import type {
  PromptCardData,
  PromptDraft,
  PromptVersionData,
} from "../data/prompts.ts";
import { getTrashExpiresAt } from "./prompt-lifecycle.ts";
import { normalizeTags } from "./prompt-utils.ts";

function createVersionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `version-${crypto.randomUUID()}`;
  }

  return `version-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createMergeVersion(input: {
  target: PromptCardData;
  sourcePromptIds: string[];
  createdAt: string;
}): PromptVersionData {
  return {
    versionId: createVersionId(),
    promptId: input.target.id,
    title: input.target.title,
    category: input.target.category,
    tags: [...input.target.tags],
    content: input.target.content,
    useCase: input.target.useCase,
    createdAt: input.createdAt,
    versionReason: "merge_before",
    sourcePromptIds: [...input.sourcePromptIds],
    restoredAt: null,
    expiresAt: getTrashExpiresAt(input.createdAt),
  };
}

export function normalizeMergeDraft(draft: PromptDraft): PromptDraft {
  return {
    title: draft.title.trim(),
    category: draft.category.trim(),
    tags: normalizeTags(draft.tags),
    content: draft.content.trim(),
    useCase: draft.useCase.trim(),
  };
}

export function getMergeErrorMessage(
  error: unknown,
  fallback: string,
) {
  if (error instanceof SyntaxError) {
    return "AI 返回内容无法识别，请稍后重试。";
  }

  if (
    error instanceof TypeError ||
    (error instanceof Error &&
      /failed to fetch|networkerror|load failed|abort/i.test(
        error.message,
      ))
  ) {
    return "网络连接失败，请稍后重试。";
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}
