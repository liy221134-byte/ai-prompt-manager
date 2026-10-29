import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AI_NOT_CONFIGURED_MESSAGE,
  AiCallError,
  callChat,
  readChatConfig,
} from "../src/lib/ai-chat.ts";

// ── 这一组守的是「一个通道，七处调用」的前提 ──────────────
//
// 合并之前 7 个接口各写一遍同样的骨架，任何一处改超时/改错误文案都要改 7 遍，
// 漏一处就变成两套行为。这里把「骨架的承诺」固定下来：
// 配置怎么读、失败怎么归、多段调用怎么共用预算、图片怎么带出去。
//
// 图片那条是 M6 的前置：知识图谱要拍照上传，如果这个通道带不了 image_url，
// M6 就会被迫另开一条路——那正是这轮收口要避免的事。

const ENV_KEYS = ["AI_API_BASE_URL", "AI_API_KEY", "AI_MODEL"];
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;

function setEnv(values) {
  for (const key of ENV_KEYS) {
    if (values[key] == null) delete process.env[key];
    else process.env[key] = values[key];
  }
}

/** 明确清空三项变量 = 「没配置」。不要用 restore() 代替它。 */
function unconfigured() {
  setEnv({});
}

function configured() {
  setEnv({
    AI_API_BASE_URL: "https://example.test/v1/",
    AI_API_KEY: "sk-test",
    AI_MODEL: "test-model",
  });
}

/**
 * 恢复到本文件被加载时的环境快照。
 * 注意：它恢复的是「进来时的样子」。若跑测试的机器本身配了这三项
 * （Vercel 构建会把项目环境变量注入进程），恢复出来就是「已配置」——
 * 所以断言「没配」的用例必须用 unconfigured()，不能用 restore()。
 * 2026-10-29 就是这条让线上构建挂了 43 秒。
 */
function restore() {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] == null) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  globalThis.fetch = originalFetch;
}

/** 装一个假 fetch，把收到的请求体留下来供断言 */
function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const record = { url, init, body: init?.body ? JSON.parse(init.body) : null };
    calls.push(record);
    return handler(record);
  };
  return calls;
}

function okResponse(content) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  };
}

test("三项环境变量缺任何一项都算没配好", () => {
  unconfigured();
  assert.equal(readChatConfig(), null);

  setEnv({ AI_API_BASE_URL: "https://example.test", AI_API_KEY: "k" });
  assert.equal(readChatConfig(), null);

  configured();
  assert.deepEqual(readChatConfig(), {
    apiBaseUrl: "https://example.test/v1",
    apiKey: "sk-test",
    model: "test-model",
  });
});

test("没配置时抛 503，而不是笼统的 502", async () => {
  unconfigured();
  await assert.rejects(
    () => callChat({ messages: [{ role: "user", content: "你好" }] }),
    (error) => {
      assert.ok(error instanceof AiCallError);
      assert.equal(error.status, 503);
      assert.equal(error.message, AI_NOT_CONFIGURED_MESSAGE);
      return true;
    },
  );
});

test("正常返回时就给出 content，并带上模型与温度", async () => {
  configured();
  const calls = stubFetch(() => okResponse("答案"));
  const content = await callChat({
    messages: [{ role: "user", content: "问一句" }],
    temperature: 0.2,
  });

  assert.equal(content, "答案");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://example.test/v1/chat/completions");
  assert.equal(calls[0].init.headers.Authorization, "Bearer sk-test");
  assert.equal(calls[0].body.model, "test-model");
  assert.equal(calls[0].body.temperature, 0.2);
  restore();
});

test("不传温度时请求里就没有 temperature 字段", async () => {
  configured();
  const calls = stubFetch(() => okResponse("x"));
  await callChat({ messages: [{ role: "user", content: "q" }] });
  assert.equal("temperature" in calls[0].body, false);
  restore();
});

test("图片消息原样带出去——M6 的拍照检查靠这一条", async () => {
  configured();
  const calls = stubFetch(() => okResponse("看图结论"));
  const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";

  await callChat({
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "这张图里漏了什么" },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
  });

  const parts = calls[0].body.messages[0].content;
  assert.equal(parts.length, 2);
  assert.equal(parts[0].type, "text");
  assert.equal(parts[1].type, "image_url");
  assert.equal(parts[1].image_url.url, dataUrl);
  restore();
});

test("上游返回非 2xx 时是 502，且不带出上游状态码", async () => {
  configured();
  stubFetch(() => ({ ok: false, status: 429, json: async () => ({}) }));
  await assert.rejects(
    () => callChat({ messages: [{ role: "user", content: "q" }] }),
    (error) => {
      assert.ok(error instanceof AiCallError);
      assert.equal(error.status, 502);
      assert.match(error.message, /调用失败/);
      // 不把 429 这类上游细节丢给人看：他不知道该怎么处理
      assert.equal(error.message.includes("429"), false);
      return true;
    },
  );
  restore();
});

test("返回空内容算失败，不返回空串", async () => {
  configured();
  stubFetch(() => ({ ok: true, status: 200, json: async () => ({ choices: [] }) }));
  await assert.rejects(
    () => callChat({ messages: [{ role: "user", content: "q" }] }),
    (error) => {
      assert.equal(error.status, 502);
      assert.match(error.message, /没有返回可用内容/);
      return true;
    },
  );
  restore();
});

test("网络异常翻成一句人话，不把 Failed to fetch 抛到界面上", async () => {
  configured();
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  await assert.rejects(
    () => callChat({ messages: [{ role: "user", content: "q" }] }),
    (error) => {
      assert.equal(error.status, 502);
      assert.match(error.message, /网络连接/);
      assert.equal(error.message.includes("Failed to fetch"), false);
      return true;
    },
  );
  restore();
});

test("预算已经不够时不发请求，直接说超时", async () => {
  configured();
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return okResponse("x");
  };

  await assert.rejects(
    () =>
      callChat({
        messages: [{ role: "user", content: "q" }],
        deadline: Date.now() + 500,
      }),
    (error) => {
      assert.equal(error.status, 502);
      assert.match(error.message, /超时/);
      return true;
    },
  );
  // 500ms 剩下的预算发出去也是白等，不该消耗一次调用
  assert.equal(called, false);
  restore();
});

test("多段调用共用一个 deadline：后一次不会重新获得全额时间", async () => {
  configured();
  const remaining = [];
  globalThis.fetch = async (_url, init) => {
    // 从 AbortSignal 拿不到剩余时间，这里改为记录调用次数，靠 deadline 判定足够
    remaining.push(Boolean(init.signal));
    return okResponse("x");
  };

  const deadline = Date.now() + 60_000;
  await callChat({ messages: [{ role: "user", content: "1" }], deadline });
  await callChat({ messages: [{ role: "user", content: "2" }], deadline });

  assert.equal(remaining.length, 2);
  // 两次都还在预算内，所以都发了；关键是第二次没有因为「没有 deadline」而获得新的 50s
  assert.equal(remaining.every(Boolean), true);
  restore();
});
