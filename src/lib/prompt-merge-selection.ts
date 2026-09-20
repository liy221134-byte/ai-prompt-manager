export const MAX_MERGE_PROMPTS = 5;
export const MIN_MERGE_PROMPTS = 2;

export type PromptMergeSelection = {
  selectedPromptIds: string[];
  targetPromptId: string | null;
};

export function createEmptySelection(): PromptMergeSelection {
  return {
    selectedPromptIds: [],
    targetPromptId: null,
  };
}

export function togglePromptSelection(
  selection: PromptMergeSelection,
  promptId: string,
): PromptMergeSelection {
  const isSelected = selection.selectedPromptIds.includes(promptId);

  if (isSelected) {
    const selectedPromptIds = selection.selectedPromptIds.filter(
      (id) => id !== promptId,
    );

    return {
      selectedPromptIds,
      // 目标被移除时，自动把剩余列表中的第一条作为新目标。
      targetPromptId: selectedPromptIds.includes(selection.targetPromptId ?? "")
        ? selection.targetPromptId
        : (selectedPromptIds[0] ?? null),
    };
  }

  if (selection.selectedPromptIds.length >= MAX_MERGE_PROMPTS) {
    return selection;
  }

  const selectedPromptIds = [...selection.selectedPromptIds, promptId];

  return {
    selectedPromptIds,
    targetPromptId: selection.targetPromptId ?? selectedPromptIds[0],
  };
}

export function setMergeTarget(
  selection: PromptMergeSelection,
  promptId: string,
): PromptMergeSelection {
  if (
    !selection.selectedPromptIds.includes(promptId) ||
    selection.targetPromptId === promptId
  ) {
    return selection;
  }

  return {
    ...selection,
    targetPromptId: promptId,
  };
}

export function canStartMerge(selection: PromptMergeSelection): boolean {
  return (
    selection.selectedPromptIds.length >= MIN_MERGE_PROMPTS &&
    selection.selectedPromptIds.length <= MAX_MERGE_PROMPTS &&
    selection.targetPromptId !== null &&
    selection.selectedPromptIds.includes(selection.targetPromptId)
  );
}
