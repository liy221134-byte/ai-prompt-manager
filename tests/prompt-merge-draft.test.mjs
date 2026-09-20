import assert from "node:assert/strict";
import test from "node:test";

import {
  createMergeVersion,
  getMergeErrorMessage,
  normalizeMergeDraft,
} from "../src/lib/prompt-merge-draft.ts";

const target = {
  id: "prompt-a",
  title: "提示词 A",
  category: "AI效能",
  tags: ["测试"],
  content: "请处理 {{内容}}",
  useCase: "测试合并。",
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
  deletedAt: null,
  deletedReason: null,
  mergedIntoPromptId: null,
};

test("合并恢复快照保留目标、来源和 30 天过期时间", () => {
  const version = createMergeVersion({
    target,
    sourcePromptIds: ["prompt-a", "prompt-b"],
    createdAt: "2026-09-20T01:00:00.000Z",
  });

  assert.match(version.versionId, /^version-/);
  assert.equal(version.promptId, "prompt-a");
  assert.deepEqual(version.sourcePromptIds, ["prompt-a", "prompt-b"]);
  assert.equal(version.expiresAt, "2026-10-20T01:00:00.000Z");
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
