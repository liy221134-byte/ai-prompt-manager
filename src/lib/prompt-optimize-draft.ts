import type { PromptDraft } from "../data/prompts.ts";
import { normalizeTags } from "./prompt-utils.ts";

export function createOptimizeVersionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `version-${crypto.randomUUID()}`;
  }

  return `version-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeOptimizeDraft(draft: PromptDraft): PromptDraft {
  return {
    title: draft.title.trim(),
    category: draft.category.trim(),
    tags: normalizeTags(draft.tags),
    content: draft.content.trim(),
    useCase: draft.useCase.trim(),
  };
}
