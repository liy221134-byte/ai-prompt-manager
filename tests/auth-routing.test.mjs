import assert from "node:assert/strict";
import test from "node:test";

import {
  getSafeNextPath,
  isProtectedApiPath,
  isPublicAuthPath,
} from "../src/lib/auth-routing.ts";

test("允许站内路径作为登录后的返回地址", () => {
  assert.equal(
    getSafeNextPath("/prompts?tag=安全#latest"),
    "/prompts?tag=%E5%AE%89%E5%85%A8#latest",
  );
});

test("拒绝站外地址和协议相对地址", () => {
  assert.equal(getSafeNextPath("https://example.com"), "/");
  assert.equal(getSafeNextPath("//example.com"), "/");
  assert.equal(getSafeNextPath("/\\example.com"), "/");
});

test("登录和认证回调保持公开", () => {
  assert.equal(isPublicAuthPath("/login"), true);
  assert.equal(isPublicAuthPath("/auth/callback"), true);
  assert.equal(isPublicAuthPath("/"), false);
});

test("除定时心跳外的 API 都受保护", () => {
  assert.equal(isProtectedApiPath("/api/prompts"), true);
  assert.equal(isProtectedApiPath("/api/ai/extract-prompt"), true);
  assert.equal(isProtectedApiPath("/api/health/db"), false);
});
