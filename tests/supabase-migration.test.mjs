import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/202609200001_add_prompt_merge_trash.sql",
    import.meta.url,
  ),
  "utf8",
);

test("合并迁移显式拒绝空来源并用 cardinality 校验数量", () => {
  assert.match(migration, /p_source_prompt_ids is null/);
  assert.match(migration, /cardinality\(p_source_prompt_ids\) < 2/);
  assert.match(migration, /cardinality\(p_source_prompt_ids\) > 5/);
  assert.match(
    migration,
    /v_source_count <> cardinality\(p_source_prompt_ids\)/,
  );
  assert.doesNotMatch(migration, /array_length\(p_source_prompt_ids/);
});

test("迁移提供按当前用户原子清空垃圾箱的 SECURITY INVOKER RPC", () => {
  const emptyFunction = migration.match(
    /create or replace function public\.empty_prompt_trash\(\)[\s\S]*?end;\s*\$\$;/,
  )?.[0];

  assert.ok(emptyFunction);
  assert.match(emptyFunction, /security invoker/);
  assert.match(emptyFunction, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(
    emptyFunction,
    /delete from public\.prompt_versions\s+where user_id = v_user_id/,
  );
  assert.match(
    emptyFunction,
    /delete from public\.prompts\s+where user_id = v_user_id\s+and deleted_at is not null/,
  );
});
