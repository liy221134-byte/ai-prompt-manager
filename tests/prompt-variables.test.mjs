import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_PROMPT_VARIABLES,
  demotePromptVariable,
  insertPromptVariable,
  renamePromptVariable,
  setSelectionAsVariable,
  validatePromptVariables,
  validateVariableName,
} from "../src/lib/prompt-variables.ts";

test("改名会同步替换正文中的全部变量占位符", () => {
  const content = "分析 {{行业}} 的 {{ 行业 }} 趋势，保留 {{行业}}。";

  assert.equal(
    renamePromptVariable(content, "行业", "目标行业"),
    "分析 {{目标行业}} 的 {{目标行业}} 趋势，保留 {{目标行业}}。",
  );
});

test("改名遇到重名时拒绝写入", () => {
  const content = "分析 {{行业}}，输出 {{报告}}。";

  assert.throws(
    () => renamePromptVariable(content, "行业", "报告"),
    /变量名已存在/,
  );
});

test("降级会把占位符语法去掉并保留文字", () => {
  const content = "分析 {{行业}}，再分析 {{ 行业 }}。";

  assert.equal(
    demotePromptVariable(content, "行业"),
    "分析 行业，再分析 行业。",
  );
});

test("选区可以设为变量并返回新的光标位置", () => {
  const content = "请分析项目风险";

  const result = setSelectionAsVariable(content, 3, 7);

  assert.equal(result.content, "请分析{{项目风险}}");
  assert.equal(result.variableName, "项目风险");
  assert.equal(result.selectionStart, result.selectionEnd);
});

test("选区包含花括号时拒绝设为变量", () => {
  assert.throws(
    () => setSelectionAsVariable("保留 {{旧变量}}", 5, 9),
    /不能包含花括号/,
  );
});

test("插入已存在的变量时会提示复用变量名", () => {
  const result = insertPromptVariable(
    "分析 {{行业}}",
    "分析 {{行业}}".length,
    "行业",
  );

  assert.equal(result.content, "分析 {{行业}}{{行业}}");
  assert.equal(result.isExisting, true);
});

test("变量名校验会拦截空名、花括号和超长名称", () => {
  assert.match(validateVariableName("   ", []) ?? "", /不能为空/);
  assert.match(validateVariableName("目标{行业}", []) ?? "", /不能包含花括号/);
  assert.match(
    validateVariableName("变".repeat(31), []),
    /最多 30 个字符/,
  );
});

test("保存前校验会拦截空变量、非法变量和超过上限的变量", () => {
  assert.match(validatePromptVariables("请分析 {{}}") ?? "", /不能为空/);
  assert.match(
    validatePromptVariables("请分析 {{目标{行业}}") ?? "",
    /不能包含花括号/,
  );

  const variables = Array.from(
    { length: MAX_PROMPT_VARIABLES + 1 },
    (_, index) => `{{变量${index + 1}}}`,
  ).join("、");

  assert.match(
    validatePromptVariables(variables) ?? "",
    new RegExp(`最多支持 ${MAX_PROMPT_VARIABLES} 个变量`),
  );
});
