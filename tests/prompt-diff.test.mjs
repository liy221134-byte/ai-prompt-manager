import assert from "node:assert/strict";
import test from "node:test";

import { diffPromptLines } from "../src/lib/prompt-diff.ts";

test("没有变化时全部标记为相同", () => {
  assert.deepEqual(diffPromptLines("第一行\n第二行", "第一行\n第二行"), [
    { type: "same", text: "第一行" },
    { type: "same", text: "第二行" },
  ]);
});

test("新增行标记为 added", () => {
  assert.deepEqual(diffPromptLines("第一行", "第一行\n第二行"), [
    { type: "same", text: "第一行" },
    { type: "added", text: "第二行" },
  ]);
});

test("删除行标记为 removed", () => {
  assert.deepEqual(diffPromptLines("第一行\n第二行", "第一行"), [
    { type: "same", text: "第一行" },
    { type: "removed", text: "第二行" },
  ]);
});

test("修改行会同时出现删除和新增", () => {
  assert.deepEqual(diffPromptLines("标题\n旧内容", "标题\n新内容"), [
    { type: "same", text: "标题" },
    { type: "removed", text: "旧内容" },
    { type: "added", text: "新内容" },
  ]);
});

test("补全小节标题时保留原有内容", () => {
  const diff = diffPromptLines(
    "你是分析师。\n请分析行业。",
    "## 角色\n你是一名分析师。\n## 任务\n请分析行业。",
  );

  assert.ok(diff.some((line) => line.type === "added" && line.text === "## 角色"));
  assert.ok(
    diff.some((line) => line.type === "removed" && line.text === "你是分析师。"),
  );
  assert.ok(
    diff.some((line) => line.type === "added" && line.text === "你是一名分析师。"),
  );
});
