import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  buildSchemaImportDrafts,
  parseSqlSchema,
} from "../src/lib/schema-import.ts";

const sql = `
-- 2.0.0：项目、统一资产和不可变资产版本。
/* 这段是注释块，里面的 create table 不算数
create table ignored_in_comment (id text);
*/

create table if not exists public.projects (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.assets (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  project_id text not null,
  asset_type text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  source_asset_ids text[] not null default '{}',
  score numeric(10, 2),
  note character varying(255) default 'not null 是约束',
  created_at timestamp(3) with time zone not null,
  primary key (user_id, id),
  constraint assets_project_fk
    foreign key (user_id, project_id)
    references public.projects(user_id, id)
);

create index if not exists assets_user_project_idx
on public.assets (user_id, project_id);
`;

test("解析建表语句：忽略注释、索引和非表语句", () => {
  const tables = parseSqlSchema(sql);

  assert.deepEqual(
    tables.map((table) => `${table.schema}.${table.name}`),
    ["public.projects", "public.assets"],
  );
});

test("字段的类型、非空、默认值和主键都读得出来", () => {
  const [, assets] = parseSqlSchema(sql);
  const byName = new Map(
    assets.columns.map((column) => [column.name, column]),
  );

  assert.equal(assets.columns.length, 9);
  assert.equal(byName.get("metadata_json").defaultValue, "'{}'::jsonb");
  assert.equal(byName.get("source_asset_ids").type, "text[]");
  assert.equal(byName.get("score").type, "numeric(10, 2)");
  assert.equal(byName.get("score").notNull, false);
  assert.equal(
    byName.get("note").type,
    "character varying(255)",
    "多词类型要连参数一起读出来",
  );
  assert.equal(
    byName.get("note").defaultValue,
    "'not null 是约束'",
    "字符串里的关键字不能当成约束",
  );
  assert.equal(byName.get("note").notNull, false);
  assert.equal(byName.get("created_at").type, "timestamp(3) with time zone");
  assert.deepEqual(assets.primaryKey, ["user_id", "id"]);
});

test("外键读出来：表级复合外键和行内引用都能认", () => {
  const [projects, assets] = parseSqlSchema(sql);

  assert.deepEqual(projects.foreignKeys, [
    { column: "user_id", refSchema: "auth", refTable: "users", refColumn: "id" },
  ]);
  assert.deepEqual(assets.foreignKeys, [
    {
      column: "user_id",
      refSchema: "auth",
      refTable: "users",
      refColumn: "id",
    },
    {
      column: "user_id",
      refSchema: "public",
      refTable: "projects",
      refColumn: "user_id",
    },
    {
      column: "project_id",
      refSchema: "public",
      refTable: "projects",
      refColumn: "id",
    },
  ]);
});

test("生成草稿：编号按 TBL- 表名，正文带字段清单", () => {
  const drafts = buildSchemaImportDrafts(parseSqlSchema(sql), {
    sourceLabel: "migrate.sql",
  });

  assert.deepEqual(
    drafts.map((draft) => draft.code),
    ["TBL-projects", "TBL-assets"],
  );
  assert.equal(drafts[0].nodeType, "data");
  assert.equal(drafts[0].title, "projects");
  assert.equal(drafts[0].sourceLabel, "migrate.sql");
  assert.equal(drafts[0].note, "从 migrate.sql 导入的建表语句");
  assert.match(drafts[1].content, /\| user_id \| uuid \| 非空 \|/);
  assert.match(drafts[1].content, /主键：user_id、id/);
  assert.match(drafts[1].content, /- project_id → projects\(id\)/);
});

test("外键按编号记关系：批内的直接对上，批外的带上 TBL- 编号等落库时再判", () => {
  const drafts = buildSchemaImportDrafts(parseSqlSchema(sql));

  assert.deepEqual(drafts[1].relations, [
    {
      targetCode: "TBL-users",
      relationType: "depends_on",
      note: "user_id → users(id)",
    },
    {
      targetCode: "TBL-projects",
      relationType: "depends_on",
      note: "user_id → projects(user_id)、project_id → projects(id)",
    },
  ]);
});

test("同名表跨 schema 时编号带上 schema，按限定名引用能对上", () => {
  const tables = parseSqlSchema(`
    create table public.users (id text primary key);
    create table auth.users (id text primary key);
    create table public.sessions (
      id text primary key,
      owner text references auth.users(id)
    );
  `);
  const drafts = buildSchemaImportDrafts(tables);

  assert.deepEqual(
    drafts.map((draft) => draft.code),
    ["TBL-users", "TBL-auth.users", "TBL-sessions"],
  );
  assert.equal(drafts[1].title, "auth.users");
  assert.deepEqual(drafts[2].relations, [
    {
      targetCode: "TBL-auth.users",
      relationType: "depends_on",
      note: "owner → users(id)",
    },
  ]);
});

test("没有建表语句时返回空结果，不抛错", () => {
  assert.deepEqual(parseSqlSchema("insert into t values (1);"), []);
  assert.deepEqual(buildSchemaImportDrafts([]), []);
});

// 拿本仓库自己的迁移文件当真实样本，避免解析器只在自己的测试 SQL 上成立
test("本仓库的迁移文件能解析出表和字段", () => {
  const dir = new URL("../supabase/migrations/", import.meta.url);
  const files = readdirSync(dir).filter((name) => name.endsWith(".sql"));

  assert.ok(files.length > 0, "迁移目录里应该有 SQL 文件");

  const tables = files.flatMap((file) =>
    parseSqlSchema(readFileSync(new URL(file, dir), "utf8")),
  );
  const names = tables.map((table) => table.name);

  assert.ok(names.includes("projects"));
  assert.ok(names.includes("assets"));
  assert.ok(names.includes("asset_versions"));
  assert.ok(names.includes("prompts"));

  for (const table of tables) {
    assert.ok(
      table.columns.length > 0,
      `${table.name} 应该解析出字段`,
    );
  }
});
