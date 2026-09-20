import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { PromptDatabase } from "../src/lib/server/prompt-database.ts";

function createContext() {
  const directory = mkdtempSync(join(tmpdir(), "prompt-trash-"));
  return {
    database: new PromptDatabase(join(directory, "prompts.sqlite")),
    cleanup() {
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

function prompt(overrides = {}) {
  return {
    id: "prompt-a",
    title: "提示词 A",
    category: "AI效能",
    tags: ["测试"],
    content: "请处理 {{内容}}",
    useCase: "测试垃圾箱。",
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
    deletedAt: null,
    deletedReason: null,
    mergedIntoPromptId: null,
    ...overrides,
  };
}

test("删除提示词后进入垃圾箱并可恢复", () => {
  const context = createContext();

  try {
    context.database.createPrompt(prompt());
    assert.equal(context.database.deletePrompt("prompt-a"), true);
    assert.equal(context.database.listPrompts().length, 3);
    assert.equal(context.database.listTrash().length, 1);
    assert.equal(context.database.restorePrompt("prompt-a"), true);
    assert.equal(context.database.listTrash().length, 0);
    assert.equal(context.database.listPrompts().length, 4);
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("AI 合并会更新目标、归档来源并保存恢复快照", () => {
  const context = createContext();

  try {
    context.database.createPrompt(prompt());
    context.database.createPrompt(prompt({ id: "prompt-b", title: "提示词 B" }));
    const version = {
      versionId: "version-1",
      promptId: "prompt-a",
      title: "提示词 A",
      category: "AI效能",
      tags: ["测试"],
      content: "请处理 {{内容}}",
      useCase: "测试垃圾箱。",
      createdAt: "2026-09-20T01:00:00.000Z",
      versionReason: "merge_before",
      sourcePromptIds: ["prompt-a", "prompt-b"],
      restoredAt: null,
      expiresAt: "2026-10-20T01:00:00.000Z",
    };

    context.database.commitPromptMerge({
      prompt: prompt({
        title: "合并后的提示词",
        updatedAt: "2026-09-20T01:00:00.000Z",
      }),
      sourcePromptIds: ["prompt-b"],
      version,
    });

    assert.equal(context.database.listPrompts().length, 4);
    assert.equal(context.database.listTrash().length, 1);
    assert.equal(context.database.listMergeRecoveryRecords().length, 1);
  } finally {
    context.database.close();
    context.cleanup();
  }
});
