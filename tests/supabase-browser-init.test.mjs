import assert from "node:assert/strict";
import test from "node:test";

import { getBrowserClientInitialization } from "../src/lib/supabase/browser-init.ts";

test("Supabase 浏览器客户端初始化成功后会结束等待", () => {
  const client = { id: "browser-client" };
  const result = getBrowserClientInitialization(() => client);

  assert.equal(result.client, client);
  assert.equal(result.errorMessage, null);
  assert.equal(result.isLoading, false);
});

test("Supabase 浏览器客户端初始化失败后会结束等待并返回错误", () => {
  const result = getBrowserClientInitialization(() => {
    throw new Error("配置缺失");
  });

  assert.equal(result.client, null);
  assert.equal(result.errorMessage, "配置缺失");
  assert.equal(result.isLoading, false);
});
