import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { PromptDatabase } from "../src/lib/server/prompt-database.ts";

function createTestDatabase() {
  const directory = mkdtempSync(join(tmpdir(), "prompt-database-"));
  const databasePath = join(directory, "prompts.sqlite");

  return {
    database: new PromptDatabase(databasePath),
    databasePath,
    cleanup() {
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

function createPrompt(overrides = {}) {
  return {
    id: "prompt-database-test",
    title: "数据库测试提示词",
    category: "AI效能",
    tags: ["数据库", "测试"],
    content: "请处理 {{内容}}",
    useCase: "验证数据库写入和读取。",
    createdAt: "2026-09-17T08:00:00.000Z",
    updatedAt: "2026-09-17T08:00:00.000Z",
    ...overrides,
  };
}

test("数据库首次启动会写入示例提示词", () => {
  const context = createTestDatabase();

  try {
    const snapshot = context.database.getLibrarySnapshot();

    assert.equal(snapshot.prompts.length, 3);
    assert.ok(snapshot.version >= 1);
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("新增、更新和删除提示词会同步保存", () => {
  const context = createTestDatabase();

  try {
    const prompt = createPrompt();

    assert.equal(context.database.createPrompt(prompt), true);
    assert.equal(context.database.createPrompt(prompt), false);
    assert.ok(
      context.database
        .listPrompts()
        .some((item) => item.title === "数据库测试提示词"),
    );

    assert.equal(
      context.database.updatePrompt({
        ...prompt,
        title: "数据库更新后的提示词",
        updatedAt: "2026-09-17T09:00:00.000Z",
      }),
      true,
    );
    assert.ok(
      context.database
        .listPrompts()
        .some((item) => item.title === "数据库更新后的提示词"),
    );

    assert.equal(context.database.deletePrompt(prompt.id), true);
    assert.equal(context.database.deletePrompt(prompt.id), false);
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("关闭并重新打开数据库后数据仍然存在", () => {
  const context = createTestDatabase();
  const prompt = createPrompt();

  try {
    context.database.createPrompt(prompt);
    context.database.close();

    const reopenedDatabase = new PromptDatabase(context.databasePath);

    try {
      assert.ok(
        reopenedDatabase
          .listPrompts()
          .some((item) => item.id === prompt.id),
      );
    } finally {
      reopenedDatabase.close();
    }
  } finally {
    context.cleanup();
  }
});

test("合并导入只新增和更新，不删除数据库已有数据", () => {
  const context = createTestDatabase();

  try {
    const currentPrompts = context.database.listPrompts();
    const importedPrompts = [
      {
        ...currentPrompts[0],
        title: "备份更新后的标题",
        updatedAt: "2026-09-18T08:00:00.000Z",
      },
      createPrompt({
        id: "prompt-imported",
        title: "备份新增提示词",
      }),
    ];

    const result = context.database.mergePrompts(importedPrompts);

    assert.equal(result.addCount, 1);
    assert.equal(result.updateCount, 1);
    assert.equal(result.skipCount, 0);
    assert.equal(result.prompts.length, 4);
    assert.ok(
      result.prompts.some((prompt) => prompt.title === "备份更新后的标题"),
    );
    assert.ok(
      result.prompts.some((prompt) => prompt.title === "备份新增提示词"),
    );
  } finally {
    context.database.close();
    context.cleanup();
  }
});
