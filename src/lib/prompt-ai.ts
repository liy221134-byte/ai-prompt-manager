import type { PromptDraft } from "../data/prompts.ts";
import { normalizeTags } from "./prompt-utils.ts";

type ExtractionResult = {
  title?: unknown;
  category?: unknown;
  tags?: unknown;
  content?: unknown;
  useCase?: unknown;
};

export const aiExtractionSystemPrompt = `
你是一个 AI 提示词结构化助手。请把用户提供的原始内容整理成可以在提示词资产库中保存的数据。

必须遵守：
1. 保留原始意图，不添加原文没有的重要约束。
2. 正文使用 Markdown，只保留对提示词使用有帮助的结构。
3. 将可替换内容统一整理为 {{变量名}}。
4. 标题简洁，最多 60 个字符。
5. 分类使用一个简短分类名称。
6. 标签最多 8 个，每个标签最多 20 个字符。
7. 适用场景说明这条提示词适合解决什么问题。
8. 只输出 JSON，不要输出 Markdown 代码围栏或额外说明。

输出格式：
{
  "title": "标题",
  "category": "分类",
  "tags": ["标签1", "标签2"],
  "content": "Markdown 正文",
  "useCase": "适用场景"
}
`.trim();

export function buildAiExtractionMessages(rawText: string) {
  return [
    {
      role: "system",
      content: aiExtractionSystemPrompt,
    },
    {
      role: "user",
      content: rawText.trim(),
    },
  ] as const;
}

function extractJsonObject(content: string) {
  const trimmedContent = content.trim();

  try {
    return JSON.parse(trimmedContent) as ExtractionResult;
  } catch {
    const firstBrace = trimmedContent.indexOf("{");
    const lastBrace = trimmedContent.lastIndexOf("}");

    if (firstBrace < 0 || lastBrace <= firstBrace) {
      throw new Error("AI 返回内容中没有可识别的 JSON。");
    }

    try {
      return JSON.parse(
        trimmedContent.slice(firstBrace, lastBrace + 1),
      ) as ExtractionResult;
    } catch {
      throw new Error("AI 返回的 JSON 无法解析。");
    }
  }
}

export function normalizeExtractedPrompt(content: string): PromptDraft {
  const parsedContent = extractJsonObject(content);

  if (
    typeof parsedContent.content !== "string" ||
    !parsedContent.content.trim()
  ) {
    throw new Error("AI 没有返回有效的提示词正文。");
  }

  const rawTags = Array.isArray(parsedContent.tags)
    ? parsedContent.tags.filter((tag): tag is string => typeof tag === "string")
    : [];

  return {
    title:
      typeof parsedContent.title === "string" && parsedContent.title.trim()
        ? parsedContent.title.trim().slice(0, 60)
        : "未命名提示词",
    category:
      typeof parsedContent.category === "string" &&
      parsedContent.category.trim()
        ? parsedContent.category.trim().slice(0, 30)
        : "未分类",
    tags: normalizeTags(rawTags).slice(0, 8),
    content: parsedContent.content.trim().slice(0, 30000),
    useCase:
      typeof parsedContent.useCase === "string" &&
      parsedContent.useCase.trim()
        ? parsedContent.useCase.trim().slice(0, 240)
        : "待补充适用场景",
  };
}
