import assert from "node:assert/strict";
import test from "node:test";

import {
  applyVariables,
  buildPromptSearchText,
  extractVariables,
  normalizeTags,
} from "../src/lib/prompt-utils.ts";

test("按顺序提取变量并去重", () => {
  const content = "你好 {{用户}}，请处理 {{ 项目 }}，再次确认 {{用户}}。";

  assert.deepEqual(extractVariables(content), ["用户", "项目"]);
});

test("只替换已经填写的变量，并保留未填写占位符", () => {
  const content = "为 {{项目}} 编写 {{文档类型}}";
  const result = applyVariables(content, {
    项目: "提示词管理工具",
    文档类型: "",
  });

  assert.equal(result, "为 提示词管理工具 编写 {{文档类型}}");
});

test("标签会清理空格、空值和重复项", () => {
  assert.deepEqual(normalizeTags([" 产品 ", "", "产品", "AI效能"]), [
    "产品",
    "AI效能",
  ]);
});

test("搜索文本包含卡片主要字段", () => {
  const searchText = buildPromptSearchText({
    id: "prompt-1",
    title: "代码审查",
    category: "软件开发",
    tags: ["安全", "边界条件"],
    content: "检查实现逻辑",
    useCase: "提交代码之前",
    createdAt: "2026-09-17T00:00:00.000Z",
    updatedAt: "2026-09-17T00:00:00.000Z",
  });

  assert.match(searchText, /代码审查/);
  assert.match(searchText, /安全/);
  assert.match(searchText, /提交代码之前/);
});
