import assert from "node:assert/strict";
import test from "node:test";

import { POST } from "../src/app/api/ai/extract-package/route.ts";

const ROUTE_URL = "http://localhost/api/ai/extract-package";

function useAiEnv() {
  const previous = {
    base: process.env.AI_API_BASE_URL,
    key: process.env.AI_API_KEY,
    model: process.env.AI_MODEL,
  };

  process.env.AI_API_BASE_URL = "https://ai.test/v1";
  process.env.AI_API_KEY = "test-key";
  process.env.AI_MODEL = "test-model";

  return () => {
    for (const [name, value] of [
      ["AI_API_BASE_URL", previous.base],
      ["AI_API_KEY", previous.key],
      ["AI_MODEL", previous.model],
    ]) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  };
}

function stubFetch(content) {
  const calls = [];
  const original = globalThis.fetch;

  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });

    return new Response(
      JSON.stringify({ choices: [{ message: { content } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

function fileRequest(filename, text) {
  const form = new FormData();

  form.append(
    "file",
    new File([new TextEncoder().encode(text)], filename, { type: "text/markdown" }),
  );

  return new Request(ROUTE_URL, { method: "POST", body: form });
}

const aiDraft = JSON.stringify({
  project: { name: "提示词资产管理", goal: "把散落文档整理成资产" },
  items: [
    {
      sourceFilename: "规范.md",
      assetType: "rule",
      title: "提交规范",
      summary: "提交前必须跑检查",
      content: "提交前必须通过完整检查。",
      reason: "包含强制要求",
    },
  ],
  skipped: [],
});

test("识别成功时返回草稿和参与识别的文件清单", async () => {
  const restoreEnv = useAiEnv();
  const fake = stubFetch(aiDraft);

  try {
    const response = await POST(fileRequest("规范.md", "提交前必须通过完整检查。"));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.draft.project.name, "提示词资产管理");
    assert.equal(body.draft.items.length, 1);
    assert.equal(body.draft.items[0].assetType, "rule");
    assert.deepEqual(body.files, ["规范.md"]);

    // 请求里要带上系统提示词和文件正文，且模型与密钥来自环境变量
    const sent = fake.calls[0];
    assert.match(sent.url, /chat\/completions$/);
    assert.equal(sent.body.model, "test-model");
    assert.match(sent.body.messages[0].content, /文档包识别助手/);
    assert.match(sent.body.messages[1].content, /规范\.md/);
    assert.match(sent.body.messages[1].content, /提交前必须通过完整检查/);
  } finally {
    fake.restore();
    restoreEnv();
  }
});

test("AI 返回的不是 JSON 草稿时给出明确错误", async () => {
  const restoreEnv = useAiEnv();
  const fake = stubFetch("我整理了一下，大概是这样：……");

  try {
    const response = await POST(fileRequest("说明.md", "一些正文内容"));

    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /不是有效的 JSON/);
  } finally {
    fake.restore();
    restoreEnv();
  }
});

test("AI 服务没配置时返回 503", async () => {
  const original = process.env.AI_API_KEY;
  delete process.env.AI_API_KEY;

  try {
    const response = await POST(fileRequest("说明.md", "一些正文内容"));

    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /AI 服务尚未配置/);
  } finally {
    if (original !== undefined) {
      process.env.AI_API_KEY = original;
    }
  }
});

test("格式不支持的文件不会发给 AI", async () => {
  const restoreEnv = useAiEnv();
  const fake = stubFetch(aiDraft);

  try {
    const form = new FormData();
    form.append("file", new File([new Uint8Array([1, 2, 3])], "图.png"));
    const response = await POST(new Request(ROUTE_URL, { method: "POST", body: form }));

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /只支持 Markdown/);
    assert.equal(fake.calls.length, 0);
  } finally {
    fake.restore();
    restoreEnv();
  }
});
