import type {
  PromptCardData,
  PromptVersionData,
} from "../data/prompts.ts";
import { getTrashExpiresAt } from "./prompt-lifecycle.ts";

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
