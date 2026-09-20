import assert from "node:assert/strict";
import test from "node:test";

import {
  LAST_BACKUP_STORAGE_KEY,
  PROMPT_STORAGE_KEY,
  loadLastBackupAt,
  loadPromptLibrary,
  saveLastBackupAt,
  savePromptLibrary,
} from "../src/lib/prompt-storage.ts";

function createLocalStorageMock() {
  const values = new Map();

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

test("首次使用时加载示例提示词", () => {
  globalThis.window = {
    localStorage: createLocalStorageMock(),
  };

  const prompts = loadPromptLibrary();

  assert.equal(prompts.length, 3);
  assert.equal(prompts[0].title, "产品需求评审助手");
});

test("提示词可以写入并再次读取", () => {
  const localStorage = createLocalStorageMock();
  globalThis.window = { localStorage };
  const prompt = {
    id: "prompt-test",
    title: "测试提示词",
    category: "AI效能",
    tags: ["测试"],
    content: "请处理 {{内容}}",
    useCase: "自动化测试",
    createdAt: "2026-09-17T00:00:00.000Z",
    updatedAt: "2026-09-17T00:00:00.000Z",
    deletedAt: null,
    deletedReason: null,
    mergedIntoPromptId: null,
    mergeVersionId: null,
  };
  const prompts = [prompt];

  savePromptLibrary(prompts);

  assert.deepEqual(loadPromptLibrary(), prompts);
  assert.ok(localStorage.getItem(PROMPT_STORAGE_KEY));
});

test("旧版本地记录会补齐生命周期字段", () => {
  globalThis.window = {
    localStorage: {
      getItem() {
        return JSON.stringify({
          version: 1,
          prompts: [
            {
              id: "prompt-legacy",
              title: "旧版提示词",
              category: "AI效能",
              tags: ["旧版"],
              content: "旧版内容",
              useCase: "迁移测试",
              createdAt: "2026-09-01T00:00:00.000Z",
              updatedAt: "2026-09-01T00:00:00.000Z",
            },
          ],
        });
      },
    },
  };

  assert.deepEqual(loadPromptLibrary(), [
    {
      id: "prompt-legacy",
      title: "旧版提示词",
      category: "AI效能",
      tags: ["旧版"],
      content: "旧版内容",
      useCase: "迁移测试",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      deletedAt: null,
      deletedReason: null,
      mergedIntoPromptId: null,
      mergeVersionId: null,
    },
  ]);
});

test("无法识别的数据格式会抛出错误", () => {
  globalThis.window = {
    localStorage: {
      getItem() {
        return JSON.stringify({ version: 99, prompts: [] });
      },
    },
  };

  assert.throws(loadPromptLibrary, /无法识别/);
});

test("最近备份时间可以保存并再次读取", () => {
  const localStorage = createLocalStorageMock();
  globalThis.window = { localStorage };
  const backupDate = "2026-09-17T08:00:00.000Z";

  saveLastBackupAt(backupDate);

  assert.equal(loadLastBackupAt(), backupDate);
  assert.equal(localStorage.getItem(LAST_BACKUP_STORAGE_KEY), backupDate);
});
