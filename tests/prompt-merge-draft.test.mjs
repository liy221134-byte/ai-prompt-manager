import assert from "node:assert/strict";
import test from "node:test";

import {
  createMergeVersionId,
  getMergeErrorMessage,
  normalizeMergeDraft,
} from "../src/lib/prompt-merge-draft.ts";

test("合并提交使用客户端生成的稳定版本标识", () => {
  assert.match(createMergeVersionId(), /^version-/);
});

test("保存合并草稿前会统一去除首尾空格并规范化标签", () => {
  assert.deepEqual(
    normalizeMergeDraft({
      title: "  通用审查助手  ",
      category: " 软件开发 ",
      tags: ["代码审查", " 代码审查 ", "", "安全"],
      content: "  请审查 {{代码}}  ",
      useCase: " 提交代码前检查风险。 ",
    }),
    {
      title: "通用审查助手",
      category: "软件开发",
      tags: ["代码审查", "安全"],
      content: "请审查 {{代码}}",
      useCase: "提交代码前检查风险。",
    },
  );
});

test("合并流程把原生网络和解析错误映射成中文提示", () => {
  assert.equal(
    getMergeErrorMessage(
      new SyntaxError("Unexpected token"),
      "默认错误",
    ),
    "AI 返回内容无法识别，请稍后重试。",
  );
  assert.equal(
    getMergeErrorMessage(
      new TypeError("Failed to fetch"),
      "默认错误",
    ),
    "网络连接失败，请稍后重试。",
  );
  assert.equal(
    getMergeErrorMessage(new Error("目标提示词不存在。"), "默认错误"),
    "目标提示词不存在。",
  );
});
