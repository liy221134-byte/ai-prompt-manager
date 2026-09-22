import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { PromptDatabase } from "../src/lib/server/prompt-database.ts";

function createPrompt(overrides = {}) {
  return {
    id: "prompt-expired",
    title: "过期提示词",
    category: "AI效能",
    tags: [],
    content: "内容",
    useCase: "测试清理。",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    deletedAt: null,
    deletedReason: null,
    mergedIntoPromptId: null,
    mergeVersionId: null,
    ...overrides,
  };
}

function createTempDatabase() {
  const directory = mkdtempSync(join(tmpdir(), "prompt-cleanup-"));
  const databasePath = join(directory, "prompts.sqlite");

  return {
    databasePath,
    cleanup() {
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test("过期垃圾箱会被清理", () => {
  const context = createTempDatabase();
  const database = new PromptDatabase(context.databasePath);

  try {
    database.createPrompt(createPrompt());
    database.deletePrompt("prompt-expired");

    const rawDatabase = new DatabaseSync(context.databasePath);
    rawDatabase
      // 2.1.0 起垃圾箱状态存在统一资产表。
      .prepare("UPDATE assets SET deleted_at = ? WHERE id = ?")
      .run("2026-08-01T00:00:00.000Z", "prompt-expired");
    rawDatabase.close();

    database.purgeExpiredTrash(new Date("2026-10-01T00:00:00.000Z"));

    assert.equal(database.listTrash().length, 0);
  } finally {
    database.close();
    context.cleanup();
  }
});

test("数据库初始化会清理已过期的垃圾箱", () => {
  const context = createTempDatabase();
  const firstDatabase = new PromptDatabase(context.databasePath);

  firstDatabase.createPrompt(createPrompt());
  firstDatabase.deletePrompt("prompt-expired");
  firstDatabase.close();

  const rawDatabase = new DatabaseSync(context.databasePath);
  rawDatabase
    .prepare("UPDATE assets SET deleted_at = ? WHERE id = ?")
    .run("2026-08-01T00:00:00.000Z", "prompt-expired");
  rawDatabase.close();

  const reopenedDatabase = new PromptDatabase(context.databasePath);

  try {
    assert.equal(reopenedDatabase.listTrash().length, 0);
    assert.ok(
      reopenedDatabase
        .listPrompts()
        .some((prompt) => prompt.id === "prompt-expired") === false,
    );
  } finally {
    reopenedDatabase.close();
    context.cleanup();
  }
});

test("导入不会恢复已经进入垃圾箱的提示词", () => {
  const context = createTempDatabase();
  const database = new PromptDatabase(context.databasePath);

  try {
    database.createPrompt(
      createPrompt({ id: "prompt-deleted", title: "已删除" }),
    );
    database.deletePrompt("prompt-deleted");

    const result = database.mergePrompts([
      createPrompt({
        id: "prompt-deleted",
        title: "备份中的已删除项",
        updatedAt: "2026-09-20T00:00:00.000Z",
      }),
    ]);

    assert.equal(result.addCount, 0);
    assert.equal(result.updateCount, 0);
    assert.equal(result.skipCount, 1);
    assert.equal(
      database
        .listPrompts()
        .some((prompt) => prompt.id === "prompt-deleted"),
      false,
    );
    assert.equal(database.listTrash().length, 1);
  } finally {
    database.close();
    context.cleanup();
  }
});
