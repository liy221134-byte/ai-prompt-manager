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

// 回填读的是云端老表，字段形状要和它的建表迁移对得上
const mergeMigration = readFileSync(
  new URL(
    "../supabase/migrations/202609200001_add_prompt_merge_trash.sql",
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
  // 云端 prompt_versions 的来源字段是 text[]，不是本地 SQLite 的 JSON 文本列
  assert.match(mergeMigration, /source_prompt_ids text\[\] not null/);
  assert.match(migration, /^\s*source_prompt_ids,$/m);
  assert.doesNotMatch(migration, /source_prompt_ids_json/);
  assert.match(migration, /restored_at/);
  assert.match(migration, /expires_at/);
});

test("回填默认项目时给可空时间列写明类型", () => {
  // select distinct 里的裸 null 会被推断成 text，写进 timestamptz 列会直接报错
  assert.match(migration, /select distinct[\s\S]*?null::timestamptz/);
});

test("资产保存函数使用 SECURITY INVOKER 且只授予 authenticated", () => {
  const saveAssetFunction = migration.match(
    /create or replace function public\.save_asset\([\s\S]*?end;\s*\$\$;/,
  )?.[0];

  assert.ok(saveAssetFunction);
  assert.match(saveAssetFunction, /security invoker/);
  assert.match(saveAssetFunction, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(
    migration,
    /revoke execute on function public\.save_asset\([\s\S]*?from public/,
  );
  assert.match(
    migration,
    /grant execute on function public\.save_asset\([\s\S]*?to authenticated/,
  );
});
