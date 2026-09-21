import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260921054052_add_project_asset_foundation.sql",
    import.meta.url,
  ),
  "utf8",
);

test("资产迁移创建项目、资产和不可变版本表", () => {
  assert.match(migration, /create table if not exists public\.projects/);
  assert.match(migration, /create table if not exists public\.assets/);
  assert.match(
    migration,
    /create table if not exists public\.asset_versions/,
  );
  assert.match(migration, /primary key \(user_id, id\)/);
  assert.match(migration, /primary key \(user_id, version_id\)/);
});

test("资产表启用 RLS 并只向 authenticated 开放", () => {
  for (const table of ["projects", "assets", "asset_versions"]) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} enable row level security`),
    );
    assert.match(
      migration,
      new RegExp(
        `grant select, insert, update, delete on public\\.${table} to authenticated`,
      ),
    );
    assert.match(
      migration,
      new RegExp(`revoke all on public\\.${table} from anon`),
    );
  }

  assert.match(migration, /to authenticated\s+using \(\(select auth\.uid\(\)\) = user_id\)/);
  assert.match(migration, /with check \(\(select auth\.uid\(\)\) = user_id\)/);
  assert.doesNotMatch(migration, /security definer/i);
});

test("现有提示词会迁移到默认项目并保留原标识", () => {
  assert.match(migration, /'default-project'/);
  assert.match(migration, /insert into public\.assets/);
  assert.match(migration, /from public\.prompts/);
  assert.match(migration, /'current-' \|\| id/);
  assert.match(migration, /jsonb_build_object/);
});

test("现有提示词版本会迁移为资产版本并保留恢复字段", () => {
  assert.match(migration, /insert into public\.asset_versions/);
  assert.match(migration, /from public\.prompt_versions/);
  assert.match(migration, /source_prompt_ids_json/);
  assert.match(migration, /restored_at/);
  assert.match(migration, /expires_at/);
});
