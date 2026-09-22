import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260921120000_add_asset_prompt_storage.sql",
    import.meta.url,
  ),
  "utf8",
);

const requiredFunctions = [
  "next_asset_version_number",
  "set_asset_trash_state",
  "commit_asset_merge",
  "restore_asset_merge",
  "commit_asset_optimize",
  "restore_asset_optimize",
  "empty_asset_trash",
];

test("提示词云端存储迁移提供全部原子操作函数", () => {
  for (const functionName of requiredFunctions) {
    assert.match(
      migration,
      new RegExp(
        `create or replace function public\\.${functionName}\\s*\\(`,
      ),
      `缺少函数：${functionName}`,
    );
  }
});

test("资产函数使用 SECURITY INVOKER 并限定 search_path", () => {
  const bodies = migration.split("create or replace function public.").slice(1);

  assert.equal(bodies.length, requiredFunctions.length);

  for (const body of bodies) {
    assert.match(body, /language (sql|plpgsql)/);
    assert.match(body, /security invoker/);
    assert.match(body, /set search_path = public/);
  }
});

test("资产函数只授予 authenticated，不向 public 开放", () => {
  // 每个函数都要显式收回 public 权限，再授予 authenticated。
  const revokes =
    migration.match(/revoke execute on function[\s\S]*?;\n/g) ?? [];
  const grants =
    migration.match(/grant execute on function[\s\S]*?;\n/g) ?? [];

  assert.equal(revokes.length, requiredFunctions.length);
  assert.equal(grants.length, requiredFunctions.length);

  for (const grant of grants) {
    assert.match(grant, /to authenticated;/);
    assert.equal(/to public;/.test(grant), false);
  }

  for (const revoke of revokes) {
    assert.match(revoke, /from public;/);
  }
});

test("迁移只写统一资产，不动旧的提示词表", () => {
  for (const forbidden of [
    "insert into public.prompts",
    "update public.prompts",
    "delete from public.prompts",
    "insert into public.prompt_versions",
    "update public.prompt_versions",
    "delete from public.prompt_versions",
  ]) {
    assert.equal(
      migration.includes(forbidden),
      false,
      `不应该写入旧表：${forbidden}`,
    );
  }
});

test("迁移不删除旧的恢复函数，保证可以回滚到 2.0.0", () => {
  assert.equal(
    /drop function/i.test(migration),
    false,
    "回滚需要旧函数继续存在，这里不应该 drop function",
  );
  assert.match(migration, /旧函数保留|回滚/);
});

test("清空垃圾箱只删快照版本，保留存活资产的内容版本", () => {
  const emptyTrashBody = migration
    .split("create or replace function public.empty_asset_trash()")
    .at(-1);

  assert.match(
    emptyTrashBody,
    /version_reason in \('merge_before', 'optimize_before', 'restore_before'\)/,
  );
  assert.match(emptyTrashBody, /deleted_at is not null/);
});

test("合并提交会同时写合并前快照和合并结果版本", () => {
  const mergeBody = migration
    .split("create or replace function public.commit_asset_merge(")
    .at(-1);

  assert.match(mergeBody, /'merge_before'/);
  assert.match(mergeBody, /'合并结果'/);
  assert.match(mergeBody, /deleted_reason = 'merge'/);
  assert.match(mergeBody, /p_source_asset_ids/);
});
