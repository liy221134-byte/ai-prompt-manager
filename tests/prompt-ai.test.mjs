import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAiExtractionMessages,
  normalizeExtractedPrompt,
} from "../src/lib/prompt-ai.ts";

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
