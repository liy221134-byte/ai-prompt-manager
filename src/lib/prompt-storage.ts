import { promptCards, type PromptCardData } from "../data/prompts.ts";

export const PROMPT_STORAGE_KEY = "ai-prompt-manager:prompts";
export const PROMPT_STORAGE_VERSION = 1;
export const LAST_BACKUP_STORAGE_KEY = "ai-prompt-manager:last-backup-at";

type StoredPromptLibrary = {
  version: number;
  prompts: PromptCardData[];
};

function isValidDateString(value: unknown) {
  return (
    typeof value === "string" && !Number.isNaN(new Date(value).getTime())
  );
}

// 旧版本地记录只有内容字段，读取时补齐生命周期字段，避免迁移后被误判为无效数据。
function normalizeStoredPrompt(prompt: PromptCardData): PromptCardData {
  return {
    ...prompt,
    tags: [...prompt.tags],
    deletedAt: prompt.deletedAt ?? null,
    deletedReason: prompt.deletedReason ?? null,
    mergedIntoPromptId: prompt.mergedIntoPromptId ?? null,
    mergeVersionId: prompt.mergeVersionId ?? null,
  };
}

export function isPromptCard(value: unknown): value is PromptCardData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const prompt = value as Partial<PromptCardData>;

  return (
    typeof prompt.id === "string" &&
    typeof prompt.title === "string" &&
    typeof prompt.category === "string" &&
    Array.isArray(prompt.tags) &&
    prompt.tags.every((tag) => typeof tag === "string") &&
    typeof prompt.content === "string" &&
    typeof prompt.useCase === "string" &&
    isValidDateString(prompt.createdAt) &&
    isValidDateString(prompt.updatedAt)
  );
}

function createInitialPrompts() {
  return promptCards.map((prompt) => ({
    ...prompt,
    tags: [...prompt.tags],
  }));
}

// 第一次使用时写入示例数据；以后即使删光卡片，也不会重新自动填充。
export function loadPromptLibrary() {
  const storedPrompts = loadStoredPromptLibrary();

  return storedPrompts ?? createInitialPrompts();
}

export function loadStoredPromptLibrary() {
  const storedValue = window.localStorage.getItem(PROMPT_STORAGE_KEY);

  if (!storedValue) {
    return null;
  }

  const parsedValue = JSON.parse(storedValue) as Partial<StoredPromptLibrary>;

  if (
    parsedValue.version !== PROMPT_STORAGE_VERSION ||
    !Array.isArray(parsedValue.prompts) ||
    !parsedValue.prompts.every(isPromptCard)
  ) {
    throw new Error("本地提示词数据格式无法识别。");
  }

  return parsedValue.prompts.map(normalizeStoredPrompt);
}

export function savePromptLibrary(prompts: PromptCardData[]) {
  const storedValue: StoredPromptLibrary = {
    version: PROMPT_STORAGE_VERSION,
    prompts,
  };

  window.localStorage.setItem(
    PROMPT_STORAGE_KEY,
    JSON.stringify(storedValue),
  );
}

export function loadLastBackupAt() {
  return window.localStorage.getItem(LAST_BACKUP_STORAGE_KEY);
}

export function saveLastBackupAt(date: string) {
  window.localStorage.setItem(LAST_BACKUP_STORAGE_KEY, date);
}
