import {
  createRuleId,
  type ExtractedRule,
  type RulePriority,
  type RuleType,
} from "../data/rule-assets.ts";

type RuleExtractionPayload = {
  title?: unknown;
  category?: unknown;
  rules?: unknown;
};

const validRuleTypes = new Set<RuleType>([
  "must",
  "must_not",
  "should",
  "workflow",
  "acceptance",
  "technical",
]);

const validPriorities = new Set<RulePriority>(["P0", "P1", "P2"]);

export const ruleExtractionSystemPrompt = `
你是一名开发规范分析专家。请从用户提供的开发资产文档中提取可以被 AI 开发智能体执行的规则。

要求：
1. 只提取文档中能够支持的原意，不自行增加规则。
2. 把规则拆成独立、明确、可执行的条目。
3. 相同含义的规则需要合并，不能重复输出。
4. sourceExcerpt 必须引用原文中的关键片段，不能编造。
5. 如果文档只是介绍或背景，不包含可执行约束，则不要提取成规则。
6. rules 数量控制在 1 至 100 条。
7. 只输出 JSON，不要输出 Markdown 代码围栏或额外说明。

type 只能是：
- must：必须执行
- must_not：禁止执行
- should：建议执行
- workflow：流程要求
- acceptance：验收要求
- technical：技术约束

priority 只能是 P0、P1、P2。

输出格式：
{
  "title": "资产标题",
  "category": "开发规范",
  "rules": [
    {
      "type": "must",
      "priority": "P0",
      "statement": "规则内容",
      "rationale": "规则目的或原因，没有原因时写空字符串",
      "sourceExcerpt": "来源原文片段"
    }
  ]
}
`.trim();

function extractJsonObject(content: string) {
  const trimmedContent = content.trim();

  try {
    return JSON.parse(trimmedContent) as RuleExtractionPayload;
  } catch {
    const firstBrace = trimmedContent.indexOf("{");
    const lastBrace = trimmedContent.lastIndexOf("}");

    if (firstBrace < 0 || lastBrace <= firstBrace) {
      throw new Error("AI 返回内容中没有可识别的规则 JSON。");
    }

    try {
      return JSON.parse(
        trimmedContent.slice(firstBrace, lastBrace + 1),
      ) as RuleExtractionPayload;
    } catch {
      throw new Error("AI 返回的规则 JSON 无法解析。");
    }
  }
}

function normalizeRule(value: unknown): ExtractedRule | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const rule = value as Partial<ExtractedRule>;
  const type = validRuleTypes.has(rule.type as RuleType)
    ? (rule.type as RuleType)
    : "should";
  const priority = validPriorities.has(rule.priority as RulePriority)
    ? (rule.priority as RulePriority)
    : "P1";
  const statement =
    typeof rule.statement === "string" ? rule.statement.trim().slice(0, 300) : "";

  if (!statement) {
    return null;
  }

  return {
    id: typeof rule.id === "string" && rule.id ? rule.id : createRuleId(),
    type,
    priority,
    statement,
    rationale:
      typeof rule.rationale === "string"
        ? rule.rationale.trim().slice(0, 300)
        : "",
    sourceExcerpt:
      typeof rule.sourceExcerpt === "string"
        ? rule.sourceExcerpt.trim().slice(0, 500)
        : "",
    status: "pending",
  };
}

export function normalizeRuleExtraction(content: string) {
  const parsedContent = extractJsonObject(content);

  if (!Array.isArray(parsedContent.rules)) {
    throw new Error("AI 没有返回有效的规则列表。");
  }

  const rules = parsedContent.rules
    .map(normalizeRule)
    .filter((rule): rule is ExtractedRule => Boolean(rule))
    .slice(0, 100);

  if (rules.length === 0) {
    throw new Error("AI 没有从内容中提取到可执行规则。");
  }

  return {
    title:
      typeof parsedContent.title === "string" && parsedContent.title.trim()
        ? parsedContent.title.trim().slice(0, 80)
        : "未命名开发资产",
    category:
      typeof parsedContent.category === "string" &&
      parsedContent.category.trim()
        ? parsedContent.category.trim().slice(0, 30)
        : "开发规范",
    rules,
  };
}

export function buildRuleExtractionMessages(rawText: string) {
  return [
    {
      role: "system",
      content: ruleExtractionSystemPrompt,
    },
    {
      role: "user",
      content: rawText.trim(),
    },
  ] as const;
}

export function exportRulesToMarkdown(
  title: string,
  rules: ExtractedRule[],
) {
  const approvedRules = rules.filter((rule) => rule.status === "approved");

  return [
    `# ${title}`,
    "",
    ...approvedRules.flatMap((rule) => [
      `- **${rule.priority} · ${rule.statement}**`,
      rule.rationale ? `  - 原因：${rule.rationale}` : "",
      "",
    ]),
  ]
    .filter((line) => line !== undefined)
    .join("\n")
    .trim();
}
