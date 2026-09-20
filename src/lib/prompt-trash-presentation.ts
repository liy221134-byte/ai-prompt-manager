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

export function getMergeSourceCount(record: PromptVersionData) {
  return record.sourcePromptIds.filter(
    (promptId) => promptId !== record.promptId,
  ).length;
}

export function getMergeRestoreConfirmation(record: PromptVersionData) {
  const sourceCount = getMergeSourceCount(record);

  return `“${record.title}”将恢复为合并前内容，最多恢复 ${sourceCount} 条来源提示词。状态已改变的来源不会恢复，当前合并结果会被替换。`;
}
