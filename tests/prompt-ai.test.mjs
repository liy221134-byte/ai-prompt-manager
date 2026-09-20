import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAiExtractionMessages,
  buildAiMergeMessages,
  buildAiOptimizeMessages,
  diffPromptVariables,
  normalizeExtractedPrompt,
  normalizeMergedPrompt,
  normalizeOptimizedPrompt,
  validateAiMergeRequest,
  validateAiOptimizeRequest,
} from "../src/lib/prompt-ai.ts";

function sourcePrompt(overrides = {}) {
  return {
    id: "a",
    title: "A",
    category: "AI",
    tags: [],
    content: "内容 A",
    useCase: "场景 A",
    ...overrides,
  };
}

test("可以解析标准 JSON 结果", () => {
  const result = normalizeExtractedPrompt(
    JSON.stringify({
      title: "代码审查助手",
      category: "软件开发",
      tags: ["代码审查", "安全"],
      content: "请审查 {{代码}}",
      useCase: "提交代码前检查风险。",
    }),
  );

  assert.equal(result.title, "代码审查助手");
  assert.deepEqual(result.tags, ["代码审查", "安全"]);
  assert.equal(result.content, "请审查 {{代码}}");
});

test("可以解析带代码围栏的 JSON 结果", () => {
  const result = normalizeExtractedPrompt(`
\`\`\`json
{
  "title": "结构化提示词",
  "category": "AI",
  "tags": ["结构"],
  "content": "处理 {{内容}}",
  "useCase": "整理原始文本。"
}
\`\`\`
`);

  assert.equal(result.title, "结构化提示词");
});

test("缺少正文时会被拒绝", () => {
  assert.throws(
    () =>
      normalizeExtractedPrompt(
        JSON.stringify({
          title: "无正文",
          category: "AI",
          tags: [],
          content: "",
          useCase: "测试",
        }),
      ),
    /正文/,
  );
});

test("提取消息包含系统约束和用户原文", () => {
  const messages = buildAiExtractionMessages("请帮我整理这段提示词");

  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /只输出 JSON/);
  assert.equal(messages[1].content, "请帮我整理这段提示词");
});

test("合并提示词会返回结构化草稿和合并说明", () => {
  const draft = normalizeMergedPrompt(
    JSON.stringify({
      title: "通用代码审查助手",
      category: "软件开发",
      tags: ["代码审查", "风险"],
      content: "请审查 {{代码}}",
      useCase: "提交代码前检查风险。",
      mergeSummary: ["保留安全检查", "合并输出格式"],
    }),
  );

  assert.equal(draft.title, "通用代码审查助手");
  assert.deepEqual(draft.mergeSummary, [
    "保留安全检查",
    "合并输出格式",
  ]);
});

test("合并请求包含两条来源提示词和可选要求", () => {
  const messages = buildAiMergeMessages({
    prompts: [
      {
        id: "a",
        title: "A",
        category: "AI",
        tags: [],
        content: "内容 A",
        useCase: "场景 A",
      },
      {
        id: "b",
        title: "B",
        category: "AI",
        tags: [],
        content: "内容 B",
        useCase: "场景 B",
      },
    ],
    mergeInstruction: "合并成通用版本",
  });

  assert.match(messages[0].content, /只输出 JSON/);
  assert.match(messages[1].content, /合并成通用版本/);
});

test("合并规范化保留变量占位符", () => {
  const draft = normalizeMergedPrompt(
    JSON.stringify({
      title: "合并助手",
      category: "AI",
      tags: [],
      content: "请审查 {{代码}} 并处理 {{需求}}",
      useCase: "测试",
      mergeSummary: ["合并为通用版本"],
    }),
  );

  assert.equal(draft.content, "请审查 {{代码}} 并处理 {{需求}}");
});

test("合并规范化拒绝空合并说明", () => {
  assert.throws(
    () =>
      normalizeMergedPrompt(
        JSON.stringify({
          title: "合并助手",
          category: "AI",
          tags: [],
          content: "请审查 {{代码}}",
          useCase: "测试",
          mergeSummary: [],
        }),
      ),
    /合并说明/,
  );
});

test("合并规范化拒绝缺少正文", () => {
  assert.throws(
    () =>
      normalizeMergedPrompt(
        JSON.stringify({
          title: "合并助手",
          category: "AI",
          tags: [],
          content: "",
          useCase: "测试",
          mergeSummary: ["合并"],
        }),
      ),
    /正文/,
  );
});

test("合并规范化拒绝畸形 JSON", () => {
  assert.throws(() => normalizeMergedPrompt("这不是 JSON"), /JSON/);
});

test("合并输入会拒绝少于两条的请求", () => {
  const result = validateAiMergeRequest({ prompts: [sourcePrompt()] });

  assert.equal(result.ok, false);
  assert.match(result.error, /至少 2 条/);
});

test("合并输入会拒绝超过五条的请求", () => {
  const prompts = Array.from({ length: 6 }, (_, index) =>
    sourcePrompt({ id: `p-${index}` }),
  );
  const result = validateAiMergeRequest({ prompts });

  assert.equal(result.ok, false);
  assert.match(result.error, /最多合并 5 条/);
});

test("合并输入会拒绝缺少正文的提示词", () => {
  const result = validateAiMergeRequest({
    prompts: [
      sourcePrompt(),
      sourcePrompt({ id: "b", content: "" }),
    ],
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /正文/);
});

test("合并输入会拒绝超长的单条正文", () => {
  const result = validateAiMergeRequest({
    prompts: [
      sourcePrompt(),
      sourcePrompt({ id: "b", content: "x".repeat(20001) }),
    ],
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /20000/);
});

test("合并输入会拒绝超长的正文总和", () => {
  const result = validateAiMergeRequest({
    prompts: [
      sourcePrompt({ id: "a", content: "x".repeat(15000) }),
      sourcePrompt({ id: "b", content: "x".repeat(15000) }),
      sourcePrompt({ id: "c", content: "x".repeat(15000) }),
    ],
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /40000/);
});

test("合并输入会拒绝超长的合并要求", () => {
  const result = validateAiMergeRequest({
    prompts: [sourcePrompt(), sourcePrompt({ id: "b" })],
    mergeInstruction: "x".repeat(2001),
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /2000/);
});

test("合并输入会接受恰好达到正文、总和和合并要求上限", () => {
  const singleContentAtLimit = validateAiMergeRequest({
    prompts: [
      sourcePrompt({ content: "x".repeat(20000) }),
      sourcePrompt({ id: "b" }),
    ],
  });
  const totalContentAtLimit = validateAiMergeRequest({
    prompts: [
      sourcePrompt({ id: "a", content: "x".repeat(20000) }),
      sourcePrompt({ id: "b", content: "y".repeat(20000) }),
    ],
  });
  const instructionAtLimit = validateAiMergeRequest({
    prompts: [sourcePrompt(), sourcePrompt({ id: "b" })],
    mergeInstruction: "x".repeat(2000),
  });

  assert.equal(singleContentAtLimit.ok, true);
  assert.equal(totalContentAtLimit.ok, true);
  assert.equal(instructionAtLimit.ok, true);
});

test("合并输入会拒绝超长的元数据", () => {
  const cases = [
    { overrides: { id: "x".repeat(101) }, pattern: /标识/ },
    { overrides: { title: "标".repeat(61) }, pattern: /标题/ },
    { overrides: { category: "类".repeat(31) }, pattern: /分类/ },
    { overrides: { useCase: "用".repeat(241) }, pattern: /适用场景/ },
    {
      overrides: { tags: Array.from({ length: 9 }, (_, index) => `标签${index}`) },
      pattern: /标签/,
    },
    { overrides: { tags: ["超".repeat(21)] }, pattern: /单个标签/ },
  ];

  for (const { overrides, pattern } of cases) {
    const result = validateAiMergeRequest({
      prompts: [sourcePrompt(), sourcePrompt({ id: "b", ...overrides })],
    });

    assert.equal(result.ok, false);
    assert.match(result.error, pattern);
  }
});

test("合并输入会接受合法的请求", () => {
  const result = validateAiMergeRequest({
    prompts: [sourcePrompt(), sourcePrompt({ id: "b" })],
    mergeInstruction: "合并成通用版本",
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.prompts.length, 2);
  assert.equal(result.value.mergeInstruction, "合并成通用版本");
});

test("合并规范化会限制字段长度和数量", () => {
  const draft = normalizeMergedPrompt(
    JSON.stringify({
      title: "标".repeat(61),
      category: "类".repeat(31),
      tags: Array.from({ length: 9 }, (_, index) => `标签${index}`),
      content: "内".repeat(30001),
      useCase: "用".repeat(241),
      mergeSummary: Array.from(
        { length: 7 },
        (_, index) => `说明${index}`.padEnd(241, "字"),
      ),
    }),
  );

  assert.equal(draft.title.length, 60);
  assert.equal(draft.category.length, 30);
  assert.equal(draft.tags.length, 8);
  assert.equal(draft.content.length, 30000);
  assert.equal(draft.useCase.length, 240);
  assert.equal(draft.mergeSummary.length, 6);
  assert.ok(draft.mergeSummary.every((item) => item.length <= 240));
});

function optimizeResult(overrides = {}) {
  return {
    title: "行业分析助手",
    category: "产品设计",
    tags: ["行业分析"],
    content: "## 任务\n请分析 {{行业}} 的情况。",
    useCase: "用于快速了解一个行业。",
    optimizationSummary: ["补全了「任务」小节标题"],
    ...overrides,
  };
}

test("优化结果默认必须保持变量集合不变", () => {
  const original = "请分析 {{行业}} 的 {{指标}}";

  assert.throws(
    () =>
      normalizeOptimizedPrompt(JSON.stringify(optimizeResult()), {
        originalContent: original,
        allowVariableChanges: false,
      }),
    /变量/,
  );
});

test("允许调整变量时可以删除牵强变量并列出变化", () => {
  const original = "请分析 {{行业}} 的 {{指标}}";

  const draft = normalizeOptimizedPrompt(JSON.stringify(optimizeResult()), {
    originalContent: original,
    allowVariableChanges: true,
  });

  assert.equal(draft.content, "## 任务\n请分析 {{行业}} 的情况。");
  assert.deepEqual(draft.variableChanges, [
    { type: "removed", name: "指标" },
  ]);
});

test("优化结果缺少优化说明时判为无效", () => {
  assert.throws(
    () =>
      normalizeOptimizedPrompt(
        JSON.stringify(optimizeResult({ optimizationSummary: [] })),
        { originalContent: "请分析 {{行业}}", allowVariableChanges: false },
      ),
    /优化说明/,
  );
});

test("变量差异报告写法统一、新增和删除三类", () => {
  assert.deepEqual(
    diffPromptVariables("请处理 {{甲}} 和 {{乙}}", "请处理 {{乙}} 和 {{丙}}"),
    [
      { type: "added", name: "丙" },
      { type: "removed", name: "甲" },
    ],
  );
  assert.deepEqual(diffPromptVariables("没有变量", "同样没有变量"), []);
  assert.deepEqual(
    diffPromptVariables("请分析[行业]的规模", "请分析 {{行业}} 的规模"),
    [{ type: "normalized", name: "行业" }],
  );
});

test("非标准占位符统一成变量时不需要放行", () => {
  const draft = normalizeOptimizedPrompt(
    JSON.stringify(
      optimizeResult({
        content: "## 任务\n请分析 {{行业}} 的市场规模。",
      }),
    ),
    { originalContent: "请分析[行业]的市场规模", allowVariableChanges: false },
  );

  assert.deepEqual(draft.variableChanges, [
    { type: "normalized", name: "行业" },
  ]);
});

test("优化请求校验会拒绝缺少正文和超长优化要求", () => {
  const base = {
    prompt: sourcePrompt({ content: "请分析 {{行业}}" }),
    instruction: "统一成 Markdown 小节",
    allowVariableChanges: false,
  };

  assert.equal(validateAiOptimizeRequest(base).ok, true);

  const missingContent = validateAiOptimizeRequest({
    ...base,
    prompt: sourcePrompt({ content: "   " }),
  });

  assert.equal(missingContent.ok, false);
  assert.match(missingContent.error, /正文/);

  const longInstruction = validateAiOptimizeRequest({
    ...base,
    instruction: "要".repeat(2001),
  });

  assert.equal(longInstruction.ok, false);
  assert.match(longInstruction.error, /优化要求/);

  const wrongFlag = validateAiOptimizeRequest({
    ...base,
    allowVariableChanges: "yes",
  });

  assert.equal(wrongFlag.ok, false);
});

test("优化提示词包含白名单、黑名单和变量规则", () => {
  const keepVariables = buildAiOptimizeMessages({
    prompt: sourcePrompt({ content: "请分析 {{行业}}" }),
    allowVariableChanges: false,
  });
  const changeVariables = buildAiOptimizeMessages({
    prompt: sourcePrompt({ content: "请分析 {{行业}}" }),
    allowVariableChanges: true,
  });

  const systemPrompt = keepVariables[0].content;

  assert.match(systemPrompt, /不得新增/);
  assert.match(systemPrompt, /不得删除/);
  assert.match(systemPrompt, /optimizationSummary/);
  assert.match(systemPrompt, /不能新增、删除或改名变量/);
  assert.match(changeVariables[0].content, /允许调整变量/);
});
