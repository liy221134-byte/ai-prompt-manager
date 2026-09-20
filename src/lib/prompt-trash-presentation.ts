import type {
  PromptCardData,
  PromptVersionData,
} from "../data/prompts.ts";

export function getDeletedReasonLabel(
  reason: "manual" | "merge",
) {
  if (reason === "manual") {
    return "手动删除";
  }

  return "AI 合并";
}

export function getTrashSummary(input: {
  prompts: PromptCardData[];
  records: PromptVersionData[];
}) {
  return `${input.prompts.length} 条提示词，${input.records.length} 条合并恢复记录`;
}
