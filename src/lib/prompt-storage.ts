import { promptCards, type PromptCardData } from "../data/prompts.ts";

export const PROMPT_STORAGE_KEY = "ai-prompt-manager:prompts";
export const PROMPT_STORAGE_VERSION = 1;

type StoredPromptLibrary = {
  version: number;
  prompts: PromptCardData[];
};

function isPromptCard(value: unknown): value is PromptCardData {
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
    typeof prompt.createdAt === "string" &&
    typeof prompt.updatedAt === "string"
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
  const storedValue = window.localStorage.getItem(PROMPT_STORAGE_KEY);

  if (!storedValue) {
    return createInitialPrompts();
  }

  const parsedValue = JSON.parse(storedValue) as Partial<StoredPromptLibrary>;

  if (
    parsedValue.version !== PROMPT_STORAGE_VERSION ||
    !Array.isArray(parsedValue.prompts) ||
    !parsedValue.prompts.every(isPromptCard)
  ) {
    throw new Error("本地提示词数据格式无法识别。");
  }

  return parsedValue.prompts;
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
