import type {
  PromptCardData,
  PromptContentData,
} from "../data/prompts.ts";
import { isPromptCard } from "./prompt-storage.ts";

export const PROMPT_BACKUP_TYPE = "ai-prompt-manager-backup";
export const PROMPT_BACKUP_VERSION = 1;

export type PromptBackup = {
  type: typeof PROMPT_BACKUP_TYPE;
  version: number;
  exportedAt: string;
  prompts: PromptCardData[];
};

export type ImportAction = "add" | "update" | "skip";

export type ImportPreviewItem = {
  id: string;
  title: string;
  action: ImportAction;
  reason: string;
};

export type PromptImportPlan = {
  backup: PromptBackup;
  items: ImportPreviewItem[];
  mergedPrompts: PromptCardData[];
  addCount: number;
  updateCount: number;
  skipCount: number;
};

function promptToContentData(prompt: PromptCardData): PromptContentData {
  return {
    id: prompt.id,
    title: prompt.title,
    category: prompt.category,
    tags: [...prompt.tags],
    content: prompt.content,
    useCase: prompt.useCase,
    createdAt: prompt.createdAt,
    updatedAt: prompt.updatedAt,
  };
}

function isValidDate(value: string) {
  return !Number.isNaN(new Date(value).getTime());
}

// 备份文件是独立的数据交换格式，必须同时校验类型、版本和每条提示词。
export function parsePromptBackup(content: string): PromptBackup {
  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(content);
  } catch {
    throw new Error("备份文件不是有效的 JSON 文件。");
  }

  if (!parsedValue || typeof parsedValue !== "object") {
    throw new Error("备份文件结构无法识别。");
  }

  const backup = parsedValue as Partial<PromptBackup>;

  if (backup.type !== PROMPT_BACKUP_TYPE) {
    throw new Error("这不是 AI 提示词资产库的备份文件。");
  }

  if (backup.version !== PROMPT_BACKUP_VERSION) {
    throw new Error("当前版本暂不支持这个备份文件。");
  }

  if (
    typeof backup.exportedAt !== "string" ||
    !isValidDate(backup.exportedAt)
  ) {
    throw new Error("备份文件缺少有效的导出时间。");
  }

  if (
    !Array.isArray(backup.prompts) ||
    !backup.prompts.every(isPromptCard)
  ) {
    throw new Error("备份文件中的提示词数据不完整。");
  }

  const promptIds = backup.prompts.map((prompt) => prompt.id);

  if (new Set(promptIds).size !== promptIds.length) {
    throw new Error("备份文件中存在重复的提示词标识。");
  }

  return {
    type: PROMPT_BACKUP_TYPE,
    version: PROMPT_BACKUP_VERSION,
    exportedAt: backup.exportedAt,
    prompts: backup.prompts.map((prompt) => ({
      ...prompt,
      deletedAt: null,
      deletedReason: null,
      mergedIntoPromptId: null,
      mergeVersionId: null,
    })),
  };
}

export function createPromptBackup(
  prompts: PromptCardData[],
  exportedAt = new Date().toISOString(),
) {
  const backupFile = {
    type: PROMPT_BACKUP_TYPE,
    version: PROMPT_BACKUP_VERSION,
    exportedAt,
    prompts: prompts.map(promptToContentData),
  } satisfies Omit<PromptBackup, "prompts"> & {
    prompts: PromptContentData[];
  };

  return JSON.stringify(
    backupFile,
    null,
    2,
  );
}

function promptsAreEqual(
  firstPrompt: PromptCardData,
  secondPrompt: PromptCardData,
) {
  return (
    firstPrompt.title === secondPrompt.title &&
    firstPrompt.category === secondPrompt.category &&
    firstPrompt.useCase === secondPrompt.useCase &&
    firstPrompt.content === secondPrompt.content &&
    firstPrompt.updatedAt === secondPrompt.updatedAt &&
    firstPrompt.createdAt === secondPrompt.createdAt &&
    firstPrompt.tags.length === secondPrompt.tags.length &&
    firstPrompt.tags.every((tag, index) => tag === secondPrompt.tags[index])
  );
}

// 导入只新增、更新或跳过，不删除本机已有提示词。
export function createPromptImportPlan(
  currentPrompts: PromptCardData[],
  backup: PromptBackup,
): PromptImportPlan {
  const currentById = new Map(
    currentPrompts.map((prompt) => [prompt.id, prompt]),
  );
  const importedById = new Map(
    backup.prompts.map((prompt) => [prompt.id, prompt]),
  );
  const items: ImportPreviewItem[] = [];
  const addedPrompts: PromptCardData[] = [];
  let addCount = 0;
  let updateCount = 0;
  let skipCount = 0;

  for (const importedPrompt of backup.prompts) {
    const currentPrompt = currentById.get(importedPrompt.id);

    if (!currentPrompt) {
      addCount += 1;
      addedPrompts.push(importedPrompt);
      items.push({
        id: importedPrompt.id,
        title: importedPrompt.title,
        action: "add",
        reason: "本机不存在这条提示词。",
      });
      continue;
    }

    if (promptsAreEqual(currentPrompt, importedPrompt)) {
      skipCount += 1;
      items.push({
        id: importedPrompt.id,
        title: importedPrompt.title,
        action: "skip",
        reason: "内容与本机版本相同。",
      });
      continue;
    }

    const currentUpdatedAt = new Date(currentPrompt.updatedAt).getTime();
    const importedUpdatedAt = new Date(importedPrompt.updatedAt).getTime();

    if (importedUpdatedAt > currentUpdatedAt) {
      updateCount += 1;
      items.push({
        id: importedPrompt.id,
        title: importedPrompt.title,
        action: "update",
        reason: "备份版本更新时间较新。",
      });
      continue;
    }

    skipCount += 1;
    items.push({
      id: importedPrompt.id,
      title: importedPrompt.title,
      action: "skip",
      reason:
        importedUpdatedAt === currentUpdatedAt
          ? "更新时间相同，保留本机版本。"
          : "本机版本更新时间较新。",
    });
  }

  const updatedPrompts = currentPrompts.map(
    (currentPrompt) =>
      importedById.get(currentPrompt.id) &&
      items.some(
        (item) =>
          item.id === currentPrompt.id && item.action === "update",
      )
        ? importedById.get(currentPrompt.id)!
        : currentPrompt,
  );

  return {
    backup,
    items,
    mergedPrompts: [...updatedPrompts, ...addedPrompts],
    addCount,
    updateCount,
    skipCount,
  };
}
