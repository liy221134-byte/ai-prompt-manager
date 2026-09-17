import type { PromptCardData } from "@/data/prompts";

const variablePattern = /\{\{\s*([^{}]+?)\s*\}\}/g;

// 按出现顺序提取唯一变量，避免详情页生成重复输入框。
export function extractVariables(content: string) {
  const variables = Array.from(
    content.matchAll(new RegExp(variablePattern)),
    (match) => match[1].trim(),
  );

  return Array.from(new Set(variables));
}

// 变量为空时保留占位符，方便用户看清哪些内容还没有填写。
export function applyVariables(
  content: string,
  values: Record<string, string>,
) {
  return content.replace(
    new RegExp(/\{\{\s*([^{}]+?)\s*\}\}/g),
    (placeholder, rawName: string) => {
      const name = rawName.trim();
      const value = values[name]?.trim();

      return value ? value : placeholder;
    },
  );
}

export function buildPromptSearchText(prompt: PromptCardData) {
  return [
    prompt.title,
    prompt.category,
    prompt.useCase,
    prompt.content,
    ...prompt.tags,
  ]
    .join(" ")
    .toLocaleLowerCase();
}

export function normalizeTags(tags: string[]) {
  const normalized = tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => tag.slice(0, 20));

  return Array.from(new Set(normalized));
}
