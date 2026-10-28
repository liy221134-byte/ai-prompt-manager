import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

// v4 学习系统 M0（数据地基）的落地检查。
// 在真实 Postgres（PGlite）上跑完整条迁移链，然后验证四张表、字段、约束和隔离，
// 不只看 SQL 文本——文本对不代表建出来的表和设计一致。

const MIGRATIONS_DIR = new URL("../supabase/migrations/", import.meta.url);
const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort();

// Supabase 平台自带的角色与 auth 模式，本地没有，按最小形状补出来
const PLATFORM_STUBS = `
  do $$
  begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  end $$;

  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key, email text unique);

  create or replace function auth.uid() returns uuid
  language sql stable
  as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $$;

  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  create schema if not exists storage;
  create table if not exists storage.buckets (
    id text primary key, name text not null,
    public boolean not null default false, file_size_limit bigint
  );
  create table if not exists storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets (id), name text not null, owner uuid
  );
  alter table storage.objects enable row level security;
  create or replace function storage.foldername(name text) returns text[]
  language plpgsql immutable
  as $$
  declare parts text[];
  begin
    select string_to_array(name, '/') into parts;
    return parts[1:array_length(parts, 1) - 1];
  end $$;
`;

// PGlite 不带 pgcrypto，迁移里只用 Postgres 13+ 已进核心的 gen_random_uuid()
function readMigration(file) {
  return readFileSync(new URL(file, MIGRATIONS_DIR), "utf8").replace(
    /create extension if not exists pgcrypto;/gi,
    "",
  );
}

let db;
let applyError = null;

async function scalar(sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows[0] ? Object.values(result.rows[0])[0] : undefined;
}

async function asUser(userId) {
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`,
  );
}

before(async () => {
  db = new PGlite();
  try {
    await db.exec(PLATFORM_STUBS);
    await db.query(`insert into auth.users (id, email) values ($1,$2),($3,$4)`, [
      USER_A, "a@example.com", USER_B, "b@example.com",
    ]);
    for (const file of migrationFiles) {
      await db.exec(readMigration(file));
    }
  } catch (error) {
    applyError = error;
  }
});

test("迁移链（含学习地基）在真实 Postgres 上能跑完", () => {
  assert.equal(applyError, null, `迁移执行失败：${applyError?.message}`);
});

test("四张学习表都建出来了", async () => {
  const names = await db.query(
    `select table_name from information_schema.tables
     where table_schema = 'public'
       and table_name in ('learning_topics','learning_modules','knowledge_points','learning_diagnostics')
     order by table_name`,
  );
  assert.deepEqual(
    names.rows.map((row) => row.table_name),
    ["knowledge_points", "learning_diagnostics", "learning_modules", "learning_topics"],
  );
});

test("题目表补了 6 个字段，存量的 source 自动归为 manual、level 为空", async () => {
  await db.query(
    `insert into public.practice_questions (id, category, title, body_md, options, answer, explanation_md)
     values ('legacy-1','老分类','老题','题干','[]'::jsonb,'A','解析')`,
  );

  const columns = await db.query(
    `select column_name from information_schema.columns
     where table_schema='public' and table_name='practice_questions'
       and column_name in ('knowledge_point','source','source_url','topic_id','module_id','level')
     order by column_name`,
  );
  assert.equal(columns.rows.length, 6);

  const row = await db.query(
    `select source, level from public.practice_questions where id = 'legacy-1'`,
  );
  assert.equal(row.rows[0].source, "manual");
  assert.equal(row.rows[0].level, null);
});

test("层级只接受 1—5，越界必须被数据库挡住", async () => {
  await assert.rejects(
    () =>
      db.query(
        `insert into public.practice_questions (id, category, title, body_md, options, answer, explanation_md, level)
         values ('bad-level','c','t','b','[]'::jsonb,'A','e',6)`,
      ),
    /practice_questions_level_check/,
  );
});

test("主题 → 模块 → 知识点三层关系成立，外键挂在正确的位置", async () => {
  await db.query(
    `insert into public.learning_topics (id, name, goal, total_hours)
     values ('demo-topic','示例主题','演示用', 10)`,
  );
  await db.query(
    `insert into public.learning_modules (topic_id, id, order_index, name, weight, planned_hours)
     values ('demo-topic','S1',1,'模块一',0.5,10)`,
  );
  await db.query(
    `insert into public.knowledge_points (topic_id, id, module_id, name, ref)
     values ('demo-topic','KP-01','S1','知识点一','第1章')`,
  );

  const ok = await scalar(
    `select count(*)::int from public.knowledge_points k
     join public.learning_modules m on m.topic_id = k.topic_id and m.id = k.module_id
     where k.topic_id = 'demo-topic'`,
  );
  assert.equal(ok, 1);

  // 挂到不存在的模块必须失败，证明外键真的生效
  await assert.rejects(
    () =>
      db.query(
        `insert into public.knowledge_points (topic_id, id, module_id, name)
         values ('demo-topic','KP-02','S9','孤儿知识点')`,
      ),
    /foreign key constraint/,
  );

  // 删主题要连带删掉模块与知识点，不留孤儿
  await db.query(`delete from public.learning_topics where id = 'demo-topic'`);
  assert.equal(
    await scalar(`select count(*)::int from public.learning_modules where topic_id='demo-topic'`),
    0,
  );
});

test("诊断记录只对本人可见", async () => {
  await db.query(
    `insert into public.learning_topics (id, name) values ('rls-topic','隔离验证')`,
  );
  // 无论断言成败都要切回管理员身份，否则后续用例会拿到一个没有建表权限的会话
  try {
    await asUser(USER_A);
    await db.query(
      `insert into public.learning_diagnostics (id, user_id, topic_id, kind, result)
       values ('diag-1', $1, 'rls-topic', 'baseline', '{}'::jsonb)`,
      [USER_A],
    );
    assert.equal(await scalar(`select count(*)::int from public.learning_diagnostics`), 1);

    await asUser(USER_B);
    assert.equal(await scalar(`select count(*)::int from public.learning_diagnostics`), 0);

    // 但公共内容（主题）对登录用户可读
    assert.ok((await scalar(`select count(*)::int from public.learning_topics`)) >= 1);
  } finally {
    await db.exec(`reset role`);
  }
});

test("整条迁移重复执行不报错（幂等）", async () => {
  for (const file of migrationFiles) {
    await db.exec(readMigration(file));
  }
  assert.equal(
    await scalar(
      `select count(*)::int from information_schema.tables
       where table_schema='public' and table_name='learning_topics'`,
    ),
    1,
  );
});

// ── M2：多学习目标（2026-10-28 补）────────────────────────
// 目标从「一个考试主题」变成「多条学习目标并存」，所以拆出 learning_goals。
// 这一组重点验两件容易做错的事：主攻唯一靠数据库兜住、个人目标不串号。

test("主题表补了 kind 与 level_definition，存量主题默认考试型、阶梯待导入时补", async () => {
  const row = await db.query(
    `select kind, level_definition from public.learning_topics where id = 'rls-topic'`,
  );
  assert.equal(row.rows[0].kind, "exam");
  assert.deepEqual(row.rows[0].level_definition, []);
});

test("主题的 kind 只接受四类，填别的被数据库挡住", async () => {
  await assert.rejects(
    () =>
      db.query(
        `insert into public.learning_topics (id, name, kind) values ('bad-kind','乱填','hobby')`,
      ),
    /learning_topics_kind_check/,
  );
});

test("学习目标表挂得上主题，每周投入必须为正", async () => {
  await db.query(
    `insert into public.learning_goals (id, user_id, topic_id, is_focus, weekly_hours, target_note)
     values ('goal-a', $1, 'rls-topic', true, 13, '两科同次 ≥45 分')`,
    [USER_A],
  );
  assert.equal(await scalar(`select count(*)::int from public.learning_goals`), 1);

  await assert.rejects(
    () =>
      db.query(
        `insert into public.learning_goals (id, user_id, topic_id, weekly_hours)
         values ('goal-zero', $1, 'rls-topic', 0)`,
        [USER_B],
      ),
    /learning_goals_weekly_hours_check/,
  );
});

test("同一个人的主攻只能有一个，第二个会被数据库直接拒绝", async () => {
  await db.query(`insert into public.learning_topics (id, name) values ('topic-2','第二个主题')`);

  // 界面上忘了互斥也拦得住——这是把「一天只有一份计划」这条产品判断落到数据结构上
  await assert.rejects(
    () =>
      db.query(
        `insert into public.learning_goals (id, user_id, topic_id, is_focus)
         values ('goal-a2', $1, 'topic-2', true)`,
        [USER_A],
      ),
    /learning_goals_one_focus_per_user/,
  );

  // 但换一个人可以有他自己的主攻，互不影响
  await db.query(
    `insert into public.learning_goals (id, user_id, topic_id, is_focus)
     values ('goal-b', $1, 'topic-2', true)`,
    [USER_B],
  );
  assert.equal(await scalar(`select count(*)::int from public.learning_goals`), 2);
});

test("同一个人对同一主题只能有一条目标，重复启用被挡住", async () => {
  await assert.rejects(
    () =>
      db.query(
        `insert into public.learning_goals (id, user_id, topic_id)
         values ('goal-a-dup', $1, 'rls-topic')`,
        [USER_A],
      ),
    /learning_goals_user_id_topic_id_key|duplicate key/,
  );
});

test("学习目标只对本人可见", async () => {
  try {
    await asUser(USER_A);
    assert.equal(await scalar(`select count(*)::int from public.learning_goals`), 1);
    assert.equal(
      await scalar(`select count(*)::int from public.learning_goals where id = 'goal-b'`),
      0,
      "不该看到别人的目标",
    );

    await asUser(USER_B);
    assert.equal(
      await scalar(`select count(*)::int from public.learning_goals where id = 'goal-a'`),
      0,
    );
  } finally {
    await db.exec(`reset role`);
  }
});

test("删主题会连带删掉挂在它上面的学习目标，不留孤儿", async () => {
  await db.query(`delete from public.learning_topics where id = 'topic-2'`);
  assert.equal(
    await scalar(`select count(*)::int from public.learning_goals where topic_id = 'topic-2'`),
    0,
  );
  // USER_A 的目标挂在 rls-topic 上，不受影响
  assert.equal(await scalar(`select count(*)::int from public.learning_goals`), 1);
});

// ── 知识点讲义（2026-10-28 随 M3 补）──────────────────────────
// 讲义两列由 20261028170000_add_knowledge_notes.sql 加上。
// 这组测试不只验「列存在」，还验「可空」与「能存能读」——
// 列建出来但 not null 就会让 24 个没讲义的知识点插不进去。

test("knowledge_points 有 summary 与 note_md 两列，且都可空", async () => {
  const columns = await db.query(
    `select column_name, is_nullable, data_type
       from information_schema.columns
      where table_schema = 'public' and table_name = 'knowledge_points'
        and column_name in ('summary', 'note_md')`,
  );
  const byName = Object.fromEntries(columns.rows.map((row) => [row.column_name, row]));

  assert.ok(byName.summary, "缺 summary 列");
  assert.ok(byName.note_md, "缺 note_md 列");
  assert.equal(byName.summary.data_type, "text");
  assert.equal(byName.note_md.data_type, "text");
  for (const name of ["summary", "note_md"]) {
    assert.equal(byName[name].is_nullable, "YES", `${name} 不能是 not null，否则没讲义的知识点插不进去`);
  }
});

test("讲义能存能取，且没讲义的知识点照样能插入", async () => {
  await db.query(
    `insert into public.learning_topics (id, name, goal) values ('note-topic', '带讲义的主题', '验证用')
     on conflict (id) do nothing`,
  );
  await db.query(
    `insert into public.learning_modules (topic_id, id, name, order_index)
     values ('note-topic', 'S1', '模块一', 1) on conflict (topic_id, id) do nothing`,
  );

  const body = "### 要素\n要点。\n\n### 例题\n一道题。\n\n### 怎么考\n这样考。";
  await db.query(
    `insert into public.knowledge_points (topic_id, id, module_id, name, summary, note_md)
     values ('note-topic', 'KP-A', 'S1', '有讲义的', '一句话定义', $1),
            ('note-topic', 'KP-B', 'S1', '没讲义的', null, null)
     on conflict (topic_id, id) do nothing`,
    [body],
  );

  assert.equal(await scalar(`select length(note_md) from public.knowledge_points where id='KP-A' and topic_id='note-topic'`), body.length);
  assert.equal(await scalar(`select count(*)::int from public.knowledge_points where topic_id='note-topic' and note_md is null`), 1);

  await db.query(`delete from public.learning_topics where id = 'note-topic'`);
});
