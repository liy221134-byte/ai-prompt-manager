import assert from "node:assert/strict";
import test from "node:test";

import {
  PROMPT_BACKUP_TYPE,
  PROMPT_BACKUP_VERSION,
  createPromptBackup,
  createPromptImportPlan,
  parsePromptBackup,
} from "../src/lib/prompt-backup.ts";

function createPrompt(overrides = {}) {
  return {
    id: "prompt-1",
    title: "测试提示词",
    category: "AI效能",
    tags: ["测试"],
    content: "请处理 {{内容}}",
    useCase: "自动化测试",
    createdAt: "2026-09-17T00:00:00.000Z",
    updatedAt: "2026-09-17T00:00:00.000Z",
    ...overrides,
  };
}

test("备份可以导出并重新解析", () => {
  const exportedAt = "2026-09-17T08:00:00.000Z";
  const content = createPromptBackup([createPrompt()], exportedAt);
  const backup = parsePromptBackup(content);

  assert.equal(backup.exportedAt, exportedAt);
  assert.equal(backup.prompts.length, 1);
  assert.equal(backup.prompts[0].title, "测试提示词");
});

test("无法识别的备份类型会被拒绝", () => {
  const content = JSON.stringify({
    type: "other-backup",
    version: 1,
    exportedAt: "2026-09-17T08:00:00.000Z",
    prompts: [],
  });

  assert.throws(() => parsePromptBackup(content), /不是 AI 提示词/);
});

test("包含重复标识的备份会被拒绝", () => {
  const prompt = createPrompt();
  const content = JSON.stringify({
    type: "ai-prompt-manager-backup",
    version: 1,
    exportedAt: "2026-09-17T08:00:00.000Z",
    prompts: [prompt, prompt],
  });

  assert.throws(() => parsePromptBackup(content), /重复/);
});

test("导入计划可以识别新增、更新和跳过", () => {
  const currentPrompts = [
    createPrompt(),
    createPrompt({
      id: "prompt-2",
      title: "本机较新",
      updatedAt: "2026-09-17T10:00:00.000Z",
    }),
  ];
  const backup = parsePromptBackup(
    JSON.stringify({
      type: "ai-prompt-manager-backup",
      version: 1,
      exportedAt: "2026-09-17T11:00:00.000Z",
      prompts: [
        createPrompt({
          title: "备份中的相同版本",
        }),
        createPrompt({
          id: "prompt-2",
          title: "备份中的旧版本",
          updatedAt: "2026-09-17T09:00:00.000Z",
        }),
        createPrompt({
          id: "prompt-3",
          title: "新提示词",
        }),
      ],
    }),
  );

  const plan = createPromptImportPlan(currentPrompts, backup);

  assert.equal(plan.skipCount, 2);
  assert.equal(plan.updateCount, 0);
  assert.equal(plan.addCount, 1);
  assert.equal(plan.mergedPrompts.length, 3);
});

test("较新的备份版本会更新本机提示词", () => {
  const currentPrompts = [
    createPrompt({
      title: "本机旧版本",
      updatedAt: "2026-09-17T09:00:00.000Z",
    }),
  ];
  const backup = parsePromptBackup(
    JSON.stringify({
      type: "ai-prompt-manager-backup",
      version: 1,
      exportedAt: "2026-09-17T11:00:00.000Z",
      prompts: [
        createPrompt({
          title: "备份新版本",
          updatedAt: "2026-09-17T10:00:00.000Z",
        }),
      ],
    }),
  );

  const plan = createPromptImportPlan(currentPrompts, backup);

  assert.equal(plan.updateCount, 1);
  assert.equal(plan.mergedPrompts[0].title, "备份新版本");
});

test("导入不会删除当前库中不存在于备份的提示词", () => {
  const currentPrompts = [
    createPrompt({ id: "prompt-1" }),
    createPrompt({ id: "prompt-2", title: "本机保留项" }),
  ];
  const backup = parsePromptBackup(
    JSON.stringify({
      type: "ai-prompt-manager-backup",
      version: 1,
      exportedAt: "2026-09-17T11:00:00.000Z",
      prompts: [createPrompt({ id: "prompt-3", title: "新增项" })],
    }),
  );

  const plan = createPromptImportPlan(currentPrompts, backup);

  assert.equal(plan.mergedPrompts.length, 3);
  assert.ok(
    plan.mergedPrompts.some((prompt) => prompt.title === "本机保留项"),
  );
});

test("备份导入不会恢复已经进入垃圾箱的提示词", () => {
  const activePrompts = [];
  const trashedPromptIds = new Set(["prompt-deleted"]);
  const plan = createPromptImportPlan(activePrompts, {
    type: PROMPT_BACKUP_TYPE,
    version: PROMPT_BACKUP_VERSION,
    exportedAt: "2026-09-20T00:00:00.000Z",
    prompts: [
      {
        id: "prompt-deleted",
        title: "已删除",
        category: "AI效能",
        tags: [],
        content: "内容",
        useCase: "测试。",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
    ],
  });

  assert.equal(
    plan.mergedPrompts.filter(
      (prompt) => !trashedPromptIds.has(prompt.id),
    ).length,
    0,
  );
});

test("备份导出只包含提示词内容字段", () => {
  const prompt = createPrompt({
    deletedAt: "2026-09-18T00:00:00.000Z",
    deletedReason: "manual",
    mergedIntoPromptId: "prompt-2",
    mergeVersionId: "version-1",
  });
  const backup = JSON.parse(
    createPromptBackup([prompt], "2026-09-20T08:00:00.000Z"),
  );

  assert.deepEqual(backup.prompts[0], {
    id: "prompt-1",
    title: "测试提示词",
    category: "AI效能",
    tags: ["测试"],
    content: "请处理 {{内容}}",
    useCase: "自动化测试",
    createdAt: "2026-09-17T00:00:00.000Z",
    updatedAt: "2026-09-17T00:00:00.000Z",
  });
});
