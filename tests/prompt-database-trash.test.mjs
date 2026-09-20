import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { PromptDatabase } from "../src/lib/server/prompt-database.ts";

function createContext() {
  const directory = mkdtempSync(join(tmpdir(), "prompt-trash-"));
  const databasePath = join(directory, "prompts.sqlite");

  return {
    database: new PromptDatabase(databasePath),
    databasePath,
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
    mergeVersionId: null,
    ...overrides,
  };
}

function createVersionId(overrides = {}) {
  return { versionId: "version-1", ...overrides }.versionId;
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

    context.database.commitPromptMerge({
      prompt: prompt({
        title: "合并后的提示词",
        updatedAt: "2026-09-20T01:00:00.000Z",
      }),
      sourcePromptIds: ["prompt-a", "prompt-b"],
      versionId: createVersionId(),
    });

    assert.equal(context.database.listPrompts().length, 4);
    assert.equal(context.database.listTrash().length, 1);
    assert.equal(context.database.listMergeRecoveryRecords().length, 1);
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("合并提交拒绝数量不足的来源集合", () => {
  const context = createContext();

  try {
    context.database.createPrompt(prompt());
    context.database.createPrompt(prompt({ id: "prompt-b", title: "提示词 B" }));

    assert.throws(
      () =>
        context.database.commitPromptMerge({
          prompt: prompt({ title: "合并后的提示词" }),
          sourcePromptIds: ["prompt-a"],
          versionId: createVersionId(),
        }),
      /合并来源数量必须是 2 至 5 条/,
    );
    assert.equal(context.database.listMergeRecoveryRecords().length, 0);
    assert.equal(context.database.listTrash().length, 0);
    assert.equal(context.database.listPrompts().length, 5);
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("合并提交拒绝空来源集合并在写入前回滚", () => {
  const context = createContext();

  try {
    context.database.createPrompt(prompt());
    context.database.createPrompt(prompt({ id: "prompt-b", title: "提示词 B" }));

    assert.throws(
      () =>
        context.database.commitPromptMerge({
          prompt: prompt({ title: "合并后的提示词" }),
          sourcePromptIds: [],
          versionId: createVersionId(),
        }),
      /合并来源数量必须是 2 至 5 条/,
    );
    assert.equal(context.database.listMergeRecoveryRecords().length, 0);
    assert.equal(context.database.listTrash().length, 0);
    assert.ok(
      context.database
        .listPrompts()
        .some((item) => item.id === "prompt-a" && item.title === "提示词 A"),
    );
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("合并提交拒绝重复来源", () => {
  const context = createContext();

  try {
    context.database.createPrompt(prompt());
    context.database.createPrompt(prompt({ id: "prompt-b", title: "提示词 B" }));

    assert.throws(
      () =>
        context.database.commitPromptMerge({
          prompt: prompt({ title: "合并后的提示词" }),
          sourcePromptIds: ["prompt-a", "prompt-a"],
          versionId: createVersionId(),
        }),
      /合并来源存在重复提示词/,
    );
    assert.equal(context.database.listMergeRecoveryRecords().length, 0);
    assert.equal(context.database.listTrash().length, 0);
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("恢复快照从锁定后的目标行生成，不信任客户端快照字段", () => {
  const context = createContext();

  try {
    context.database.createPrompt(
      prompt({
        title: "服务端真实标题",
        tags: ["真实标签"],
        content: "服务端真实正文",
        useCase: "服务端真实场景。",
      }),
    );
    context.database.createPrompt(prompt({ id: "prompt-b", title: "提示词 B" }));

    context.database.commitPromptMerge({
      prompt: prompt({
        title: "客户端合并标题",
        tags: ["客户端标签"],
        content: "客户端合并正文",
        useCase: "客户端合并场景。",
      }),
      sourcePromptIds: ["prompt-a", "prompt-b"],
      versionId: createVersionId(),
    });

    const record = context.database.listMergeRecoveryRecords()[0];

    assert.equal(record.title, "服务端真实标题");
    assert.deepEqual(record.tags, ["真实标签"]);
    assert.equal(record.content, "服务端真实正文");
    assert.equal(record.useCase, "服务端真实场景。");

    context.database.restoreMergeRecord(record.versionId);
    assert.ok(
      context.database
        .listPrompts()
        .some(
          (item) =>
            item.id === "prompt-a" &&
            item.title === "服务端真实标题" &&
            item.content === "服务端真实正文",
        ),
    );
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("合并提交要求目标包含在来源集合", () => {
  const context = createContext();

  try {
    context.database.createPrompt(prompt());
    context.database.createPrompt(prompt({ id: "prompt-b", title: "提示词 B" }));

    assert.throws(
      () =>
        context.database.commitPromptMerge({
          prompt: prompt({ title: "合并后的提示词" }),
          sourcePromptIds: ["prompt-b", "prompt-c"],
          versionId: createVersionId(),
        }),
      /目标提示词必须包含在合并来源中/,
    );
    assert.equal(context.database.listMergeRecoveryRecords().length, 0);
    assert.equal(context.database.listTrash().length, 0);
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("合并提交在目标缺失时回滚", () => {
  const context = createContext();

  try {
    context.database.createPrompt(prompt({ id: "prompt-b", title: "提示词 B" }));

    assert.throws(
      () =>
        context.database.commitPromptMerge({
          prompt: prompt({ id: "prompt-missing", title: "不存在的目标" }),
          sourcePromptIds: ["prompt-missing", "prompt-b"],
          versionId: createVersionId(),
        }),
      /目标提示词不存在或已删除/,
    );
    assert.equal(context.database.listMergeRecoveryRecords().length, 0);
    assert.equal(context.database.listTrash().length, 0);
    assert.ok(
      context.database.listPrompts().some((item) => item.id === "prompt-b"),
    );
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("合并提交在来源已删除时回滚", () => {
  const context = createContext();

  try {
    context.database.createPrompt(prompt());
    context.database.createPrompt(prompt({ id: "prompt-b", title: "提示词 B" }));
    context.database.deletePrompt("prompt-b");

    assert.throws(
      () =>
        context.database.commitPromptMerge({
          prompt: prompt({ title: "合并后的提示词" }),
          sourcePromptIds: ["prompt-a", "prompt-b"],
          versionId: createVersionId(),
        }),
      /合并来源不存在或已删除/,
    );
    assert.equal(context.database.listMergeRecoveryRecords().length, 0);
    assert.equal(context.database.listTrash().length, 1);
    assert.ok(
      context.database
        .listPrompts()
        .some((item) => item.id === "prompt-a" && item.title === "提示词 A"),
    );
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("恢复合并记录会恢复目标和仍处于合并归档状态的来源", () => {
  const context = createContext();

  try {
    context.database.createPrompt(prompt());
    context.database.createPrompt(prompt({ id: "prompt-b", title: "提示词 B" }));
    context.database.commitPromptMerge({
      prompt: prompt({ title: "合并后的提示词" }),
      sourcePromptIds: ["prompt-a", "prompt-b"],
      versionId: createVersionId(),
    });

    const result = context.database.restoreMergeRecord("version-1");

    assert.ok(result);
    assert.equal(context.database.listTrash().length, 0);
    assert.equal(context.database.listMergeRecoveryRecords().length, 0);
    assert.ok(
      context.database.listPrompts().some((item) => item.id === "prompt-b"),
    );
    assert.ok(
      context.database
        .listPrompts()
        .some((item) => item.id === "prompt-a" && item.title === "提示词 A"),
    );
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("合并会为归档来源记录本次合并版本", () => {
  const context = createContext();

  try {
    context.database.createPrompt(prompt());
    context.database.createPrompt(prompt({ id: "prompt-b", title: "提示词 B" }));
    context.database.commitPromptMerge({
      prompt: prompt({ title: "合并后的提示词" }),
      sourcePromptIds: ["prompt-a", "prompt-b"],
      versionId: createVersionId(),
    });

    const source = context.database.listTrash()[0];

    assert.equal(source.id, "prompt-b");
    assert.equal(source.mergedIntoPromptId, "prompt-a");
    assert.equal(source.mergeVersionId, "version-1");
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("恢复旧合并记录不会复活被新一次合并归档的来源", () => {
  const context = createContext();

  try {
    context.database.createPrompt(prompt());
    context.database.createPrompt(prompt({ id: "prompt-b", title: "提示词 B" }));
    context.database.commitPromptMerge({
      prompt: prompt({ title: "合并结果 v1" }),
      sourcePromptIds: ["prompt-a", "prompt-b"],
      versionId: createVersionId(),
    });
    context.database.restorePrompt("prompt-b");
    context.database.commitPromptMerge({
      prompt: prompt({ title: "合并结果 v2" }),
      sourcePromptIds: ["prompt-a", "prompt-b"],
      versionId: createVersionId({ versionId: "version-2" }),
    });

    const result = context.database.restoreMergeRecord("version-1");

    assert.ok(result);
    assert.ok(
      context.database
        .listPrompts()
        .some((item) => item.id === "prompt-a" && item.title === "提示词 A"),
    );
    assert.equal(
      context.database.listPrompts().some((item) => item.id === "prompt-b"),
      false,
    );
    assert.equal(
      context.database.listTrash().find((item) => item.id === "prompt-b")
        .mergeVersionId,
      "version-2",
    );
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("恢复合并记录拒绝已恢复快照", () => {
  const context = createContext();

  try {
    context.database.createPrompt(prompt());
    context.database.createPrompt(prompt({ id: "prompt-b", title: "提示词 B" }));
    context.database.commitPromptMerge({
      prompt: prompt({ title: "合并后的提示词" }),
      sourcePromptIds: ["prompt-a", "prompt-b"],
      versionId: createVersionId(),
    });

    assert.ok(context.database.restoreMergeRecord("version-1"));
    assert.equal(context.database.restoreMergeRecord("version-1"), null);
    assert.equal(context.database.listMergeRecoveryRecords().length, 0);
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("恢复合并记录拒绝过期快照", () => {
  const context = createContext();

  try {
    context.database.createPrompt(prompt());
    context.database.createPrompt(prompt({ id: "prompt-b", title: "提示词 B" }));
    context.database.commitPromptMerge({
      prompt: prompt({ title: "合并后的提示词" }),
      sourcePromptIds: ["prompt-a", "prompt-b"],
      versionId: createVersionId(),
    });

    const rawDatabase = new DatabaseSync(context.databasePath);
    rawDatabase
      .prepare(
        "UPDATE prompt_versions SET expires_at = ? WHERE version_id = ?",
      )
      .run("2020-01-01T00:00:00.000Z", "version-1");
    rawDatabase.close();

    assert.equal(context.database.restoreMergeRecord("version-1"), null);
    assert.ok(
      context.database
        .listPrompts()
        .some(
          (item) => item.id === "prompt-a" && item.title === "合并后的提示词",
        ),
    );
    assert.equal(context.database.listTrash().length, 1);
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("合并提交忽略调用方时间戳并使用服务端当前时间", () => {
  const context = createContext();

  try {
    context.database.createPrompt(prompt());
    context.database.createPrompt(prompt({ id: "prompt-b", title: "提示词 B" }));
    const before = Date.now();

    context.database.commitPromptMerge({
      prompt: prompt({
        title: "合并后的提示词",
        updatedAt: "2000-01-01T00:00:00.000Z",
      }),
      sourcePromptIds: ["prompt-a", "prompt-b"],
      versionId: createVersionId(),
    });

    const after = Date.now();
    const target = context.database
      .listPrompts()
      .find((item) => item.id === "prompt-a");
    const source = context.database.listTrash()[0];
    const version = context.database.listMergeRecoveryRecords()[0];
    const targetTime = Date.parse(target.updatedAt);
    const sourceTime = Date.parse(source.deletedAt);
    const createdAt = Date.parse(version.createdAt);
    const expiresAt = Date.parse(version.expiresAt);

    assert.ok(targetTime >= before && targetTime <= after);
    assert.ok(sourceTime >= before && sourceTime <= after);
    assert.ok(createdAt >= before && createdAt <= after);
    assert.ok(expiresAt > createdAt);
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("目标进入垃圾箱后恢复合并记录返回空且不消费快照", () => {
  const context = createContext();

  try {
    context.database.createPrompt(prompt());
    context.database.createPrompt(prompt({ id: "prompt-b", title: "提示词 B" }));
    context.database.commitPromptMerge({
      prompt: prompt({ title: "合并后的提示词" }),
      sourcePromptIds: ["prompt-a", "prompt-b"],
      versionId: createVersionId(),
    });
    context.database.deletePrompt("prompt-a");

    assert.equal(context.database.restoreMergeRecord("version-1"), null);
    assert.equal(context.database.listMergeRecoveryRecords().length, 1);
    assert.equal(context.database.listTrash().length, 2);
    assert.equal(context.database.listPrompts().length, 3);
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("目标被永久删除后恢复合并记录返回空且不消费快照", () => {
  const context = createContext();

  try {
    context.database.createPrompt(prompt());
    context.database.createPrompt(prompt({ id: "prompt-b", title: "提示词 B" }));
    context.database.commitPromptMerge({
      prompt: prompt({ title: "合并后的提示词" }),
      sourcePromptIds: ["prompt-a", "prompt-b"],
      versionId: createVersionId(),
    });
    context.database.deletePrompt("prompt-a");
    context.database.permanentlyDeletePrompt("prompt-a");

    assert.equal(context.database.restoreMergeRecord("version-1"), null);
    assert.equal(context.database.listMergeRecoveryRecords().length, 1);
    assert.equal(context.database.listTrash().length, 1);
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("恢复合并记录不会复活状态已改变的来源", () => {
  const context = createContext();

  try {
    context.database.createPrompt(prompt());
    context.database.createPrompt(prompt({ id: "prompt-b", title: "提示词 B" }));
    context.database.commitPromptMerge({
      prompt: prompt({ title: "合并后的提示词" }),
      sourcePromptIds: ["prompt-a", "prompt-b"],
      versionId: createVersionId(),
    });
    context.database.restorePrompt("prompt-b");
    context.database.deletePrompt("prompt-b");

    const result = context.database.restoreMergeRecord("version-1");

    assert.ok(result);
    assert.equal(context.database.listMergeRecoveryRecords().length, 0);
    const sourceInTrash = context.database
      .listTrash()
      .find((item) => item.id === "prompt-b");
    assert.equal(sourceInTrash.deletedReason, "manual");
    assert.ok(
      context.database
        .listPrompts()
        .some((item) => item.id === "prompt-a" && item.title === "提示词 A"),
    );
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("emptyTrash 清空垃圾箱和恢复记录", () => {
  const context = createContext();

  try {
    context.database.createPrompt(prompt());
    context.database.createPrompt(prompt({ id: "prompt-b", title: "提示词 B" }));
    context.database.commitPromptMerge({
      prompt: prompt({ title: "合并后的提示词" }),
      sourcePromptIds: ["prompt-a", "prompt-b"],
      versionId: createVersionId(),
    });

    assert.equal(context.database.emptyTrash(), 1);
    assert.equal(context.database.listTrash().length, 0);
    assert.equal(context.database.listMergeRecoveryRecords().length, 0);
    assert.ok(
      context.database
        .listPrompts()
        .some((item) => item.id === "prompt-a" && item.title === "合并后的提示词"),
    );
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("永久删除恢复记录不会删除提示词", () => {
  const context = createContext();

  try {
    context.database.createPrompt(prompt());
    context.database.createPrompt(prompt({ id: "prompt-b", title: "提示词 B" }));
    context.database.commitPromptMerge({
      prompt: prompt({ title: "合并后的提示词" }),
      sourcePromptIds: ["prompt-a", "prompt-b"],
      versionId: createVersionId(),
    });

    assert.equal(
      context.database.permanentlyDeleteMergeRecord("version-1"),
      true,
    );
    assert.equal(context.database.listMergeRecoveryRecords().length, 0);
    assert.equal(context.database.listTrash().length, 1);
    assert.ok(
      context.database
        .listPrompts()
        .some(
          (item) =>
            item.id === "prompt-a" && item.title === "合并后的提示词",
        ),
    );
    assert.equal(
      context.database.listPrompts().some((item) => item.id === "prompt-b"),
      false,
    );
    assert.equal(
      context.database.permanentlyDeleteMergeRecord("missing-version"),
      false,
    );
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("purgeExpiredTrash 清理过期垃圾箱和恢复快照", () => {
  const context = createContext();

  try {
    context.database.createPrompt(prompt());
    context.database.createPrompt(
      prompt({ id: "prompt-b", title: "提示词 B" }),
    );
    context.database.commitPromptMerge({
      prompt: prompt({ title: "合并后的提示词" }),
      sourcePromptIds: ["prompt-a", "prompt-b"],
      versionId: createVersionId(),
    });

    const rawDatabase = new DatabaseSync(context.databasePath);
    rawDatabase
      .prepare("UPDATE prompts SET deleted_at = ? WHERE id = ?")
      .run("2026-08-01T00:00:00.000Z", "prompt-b");
    rawDatabase
      .prepare("UPDATE prompt_versions SET expires_at = ? WHERE version_id = ?")
      .run("2026-08-31T00:00:00.000Z", "version-1");
    rawDatabase.close();

    assert.equal(
      context.database.purgeExpiredTrash(new Date("2026-10-01T00:00:00.000Z")),
      2,
    );
    assert.equal(context.database.listTrash().length, 0);
    assert.equal(context.database.listMergeRecoveryRecords().length, 0);
    assert.equal(context.database.listPrompts().length, 4);
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("mergePrompts 拒绝重复提示词标识", () => {
  const context = createContext();

  try {
    assert.throws(
      () => context.database.mergePrompts([prompt(), prompt()]),
      /待合并数据中存在重复的提示词标识/,
    );
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("旧数据库会补齐生命周期列并保留已有数据", () => {
  const directory = mkdtempSync(join(tmpdir(), "prompt-old-"));
  const databasePath = join(directory, "prompts.sqlite");
  const rawDatabase = new DatabaseSync(databasePath);

  rawDatabase.exec(`
    CREATE TABLE prompts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      content TEXT NOT NULL,
      use_case TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  rawDatabase
    .prepare(
      `
        INSERT INTO prompts (
          id,
          title,
          category,
          tags_json,
          content,
          use_case,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      "prompt-old",
      "旧库提示词",
      "AI效能",
      JSON.stringify(["旧数据"]),
      "内容",
      "测试迁移。",
      "2026-08-01T00:00:00.000Z",
      "2026-08-01T00:00:00.000Z",
    );
  rawDatabase.close();

  const database = new PromptDatabase(databasePath);

  try {
    assert.equal(database.listPrompts().length, 1);
    assert.ok(
      database.listPrompts().some((item) => item.id === "prompt-old"),
    );
    assert.equal(database.deletePrompt("prompt-old"), true);
    assert.equal(database.listTrash().length, 1);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
