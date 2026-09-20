import type { PromptDraft } from "../data/prompts.ts";
import { normalizeTags } from "./prompt-utils.ts";

export function createMergeVersionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `version-${crypto.randomUUID()}`;
  }

  return `version-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
