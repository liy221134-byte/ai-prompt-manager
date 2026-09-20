import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  getRuntimeConfigurationError,
  isSupabaseDataMode,
} from "../src/lib/server/runtime-config.ts";

const ENV_NAMES = [
  "VERCEL",
  "NEXT_PUBLIC_DATA_MODE",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];
const originalEnv = Object.fromEntries(
  ENV_NAMES.map((name) => [name, process.env[name]]),
);

function resetEnvironment() {
  for (const name of ENV_NAMES) {
    const value = originalEnv[name];

    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

afterEach(resetEnvironment);

test("本地环境缺少云端配置时仍允许使用 SQLite", () => {
  delete process.env.VERCEL;
  delete process.env.NEXT_PUBLIC_DATA_MODE;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  assert.equal(getRuntimeConfigurationError(), null);
  assert.equal(isSupabaseDataMode(), false);
});

test("Vercel 环境必须使用 Supabase", () => {
  process.env.VERCEL = "1";
  process.env.NEXT_PUBLIC_DATA_MODE = "local";

  assert.match(
    getRuntimeConfigurationError() ?? "",
    /线上环境必须使用 Supabase/,
  );
});

test("Supabase 模式缺少公开配置时安全关闭", () => {
  delete process.env.VERCEL;
  process.env.NEXT_PUBLIC_DATA_MODE = "supabase";
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  assert.match(
    getRuntimeConfigurationError() ?? "",
    /Supabase 公开配置不完整/,
  );
});

test("Vercel 使用完整 Supabase 配置时允许运行", () => {
  process.env.VERCEL = "1";
  process.env.NEXT_PUBLIC_DATA_MODE = "supabase";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  assert.equal(getRuntimeConfigurationError(), null);
  assert.equal(isSupabaseDataMode(), true);
});
