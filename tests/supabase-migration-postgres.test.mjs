import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

// 这一组测试在真实 Postgres（PGlite，与线上同为 17 大版本）上执行整条迁移链。
// 只看迁移文件文本会漏掉类型不匹配、字段名不存在这类错误，所以这里真的建库、真的跑函数。

const MIGRATIONS_DIR = new URL("../supabase/migrations/", import.meta.url);
const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort();

// 2.0.0 之前的老结构，和 2.0.0/2.1.0 两个新迁移分开应用，中间插入老数据
const LEGACY_MIGRATION_COUNT = 4;
const ASSET_MIGRATIONS = migrationFiles.slice(LEGACY_MIGRATION_COUNT);

// Supabase 平台自带的角色、auth 模式和 auth.uid()，本地没有，需要补出来
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
`;

function readMigration(file) {
  // PGlite 不带 pgcrypto，而迁移只用到 Postgres 13+ 已进核心的 gen_random_uuid()，
  // 所以只去掉建扩展那一行，其余内容与线上执行的文件逐字一致。
  return readFileSync(new URL(file, MIGRATIONS_DIR), "utf8").replace(
    /create extension if not exists pgcrypto;/gi,
    "",
  );
}

let db;
let applyError = null;
const appliedOrder = [];

async function scalar(sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows[0] ? Object.values(result.rows[0])[0] : undefined;
}

// 切换成某个登录用户：角色和身份声明都要切，否则以超级用户身份跑会绕过行级安全
async function asUser(userId) {
  await db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`,
  );
}

async function seedLegacyLibrary() {
  await db.query(
    `insert into auth.users (id, email) values ($1, $2), ($3, $4)`,
    [USER_A, "a@example.com", USER_B, "b@example.com"],
  );

  await db.query(
    `insert into public.prompts (
       user_id, id, title, category, tags, content, use_case,
       created_at, updated_at, deleted_at, deleted_reason,
       merged_into_prompt_id, merge_version_id)
     values
       ($1,'p1','提示词一','软件开发','{写作}','正文一','场景一',
        now() - interval '3 day', now() - interval '3 day', null, null, null, null),
       ($1,'p2','提示词二','软件开发','{写作,摘要}','正文二','场景二',
        now() - interval '2 day', now() - interval '2 day', null, null, null, null),
       ($1,'p3','提示词三','内容运营','{}','正文三','场景三',
        now() - interval '1 day', now() - interval '1 day', now() - interval '1 day', 'manual', null, null),
       ($2,'p9','B 的提示词','软件开发','{}','B 正文','B 场景',
        now(), now(), null, null, null, null)`,
    [USER_A, USER_B],
  );

  await db.query(
    `insert into public.prompt_versions (
       user_id, version_id, prompt_id, title, category, tags, content, use_case,
       created_at, version_reason, source_prompt_ids, restored_at, expires_at)
     values
       ($1,'ver-merge-1','p1','合并前标题','软件开发','{}','合并前正文','合并前场景',
        now() - interval '1 day', 'merge', '{p1,p2}', null, now() + interval '30 day'),
       ($1,'ver-opt-1','p1','优化前标题','软件开发','{}','优化前正文','优化前场景',
        now() - interval '1 hour', 'optimize', '{}', null, now() + interval '30 day')`,
    [USER_A],
  );
}

before(async () => {
  db = new PGlite();

  try {
    await db.exec(PLATFORM_STUBS);

    for (const file of migrationFiles.slice(0, LEGACY_MIGRATION_COUNT)) {
      await db.exec(readMigration(file));
      appliedOrder.push(file);
    }

    await seedLegacyLibrary();

    for (const file of ASSET_MIGRATIONS) {
      await db.exec(readMigration(file));
      appliedOrder.push(file);
    }
  } catch (error) {
    applyError = error;
  }
});

test("整条迁移链能在真实 Postgres 上按顺序执行完", () => {
  assert.equal(applyError, null, `迁移执行失败：${applyError?.message}`);
  assert.deepEqual(appliedOrder, migrationFiles);
  assert.equal(ASSET_MIGRATIONS.length, 2);
});

test("老提示词回填成默认项目的资产，内容和垃圾箱状态逐条一致", async () => {
  const projects = await scalar(
    `select count(*)::int from public.projects where user_id = $1 and id = 'default-project'`,
    [USER_A],
  );
  assert.equal(projects, 1);

  const assets = await scalar(
    `select count(*)::int from public.assets where user_id = $1`,
    [USER_A],
  );
  assert.equal(assets, 3);

  const matched = await scalar(
    `select count(*)::int
     from public.prompts p
     join public.assets a on a.user_id = p.user_id and a.id = p.id
     where p.user_id = $1
       and a.asset_type = 'prompt'
       and a.project_id = 'default-project'
       and a.current_version_id = 'current-' || p.id
       and a.title = p.title
       and a.content = p.content
       and a.summary = p.use_case`,
    [USER_A],
  );
  assert.equal(matched, 3);

  const trashed = await scalar(
    `select count(*)::int from public.assets
     where user_id = $1 and id = 'p3'
       and deleted_at is not null and deleted_reason = 'manual'`,
    [USER_A],
  );
  assert.equal(trashed, 1);

  const metadata = await scalar(
    `select count(*)::int from public.assets
     where user_id = $1 and id = 'p1'
       and metadata_json->>'category' = '软件开发'
       and metadata_json->>'useCase' = '场景一'
       and metadata_json->'tags' @> '["写作"]'::jsonb`,
    [USER_A],
  );
  assert.equal(metadata, 1);
});

test("旧版本记录迁移成资产版本，编号连续且来源数组保留", async () => {
  const numbers = await db.query(
    `select version_number from public.asset_versions
     where user_id = $1 and asset_id = 'p1' order by version_number`,
    [USER_A],
  );
  assert.deepEqual(
    numbers.rows.map((row) => row.version_number),
    [1, 2, 3],
  );

  const currentIsFirst = await scalar(
    `select count(*)::int from public.asset_versions
     where user_id = $1 and version_id = 'current-p1' and version_number = 1`,
    [USER_A],
  );
  assert.equal(currentIsFirst, 1);

  const sources = await db.query(
    `select source_asset_ids from public.asset_versions
     where user_id = $1 and version_id = 'ver-merge-1'`,
    [USER_A],
  );
  assert.deepEqual(sources.rows[0].source_asset_ids, ["p1", "p2"]);
});

test("重复执行两个新迁移不产生重复数据", async () => {
  const before = await scalar(
    `select count(*)::int from public.assets where user_id = $1`,
    [USER_A],
  );
  const versionsBefore = await scalar(
    `select count(*)::int from public.asset_versions where user_id = $1`,
    [USER_A],
  );

  for (const file of ASSET_MIGRATIONS) {
    await db.exec(readMigration(file));
  }

  const after = await scalar(
    `select count(*)::int from public.assets where user_id = $1`,
    [USER_A],
  );
  const versionsAfter = await scalar(
    `select count(*)::int from public.asset_versions where user_id = $1`,
    [USER_A],
  );

  assert.equal(after, before);
  assert.equal(versionsAfter, versionsBefore);
});

test("行级安全按账号隔离资产", async () => {
  await asUser(USER_B);
  const othersVisible = await scalar(
    `select count(*)::int from public.assets where user_id = $1`,
    [USER_A],
  );
  const ownVisible = await scalar(`select count(*)::int from public.assets`);

  assert.equal(othersVisible, 0);
  assert.equal(ownVisible, 1);
});

test("未登录调用资产函数会被拒绝", async () => {
  await db.exec(`set role authenticated`);
  await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);

  await assert.rejects(
    () => db.query(`select public.empty_asset_trash()`),
    /未登录/,
  );
});

test("七个资产函数在真实 Postgres 上的行为符合设计", async () => {
  await asUser(USER_A);

  await db.query(
    `select public.save_asset(
       p_asset_id => $1, p_project_id => 'default-project', p_asset_type => 'prompt',
       p_title => $2, p_summary => '新场景', p_content => '新正文',
       p_metadata => '{"category":"测试"}'::jsonb, p_source_type => 'manual',
       p_source_asset_id => null, p_import_batch_id => null, p_original_filename => null,
       p_status => 'active', p_archived_at => null, p_deleted_at => null,
       p_deleted_reason => null, p_version_id => 'v-new-1', p_change_reason => '新建',
       p_version_reason => 'manual', p_source_asset_ids => '{}', p_restored_at => null,
       p_expires_at => null, p_asset_created_at => now(), p_asset_updated_at => now())`,
    ["p-new", "新建的提示词"],
  );
  assert.equal(
    await scalar(
      `select count(*)::int from public.assets
       where user_id = $1 and id = 'p-new' and current_version_id = 'v-new-1'`,
      [USER_A],
    ),
    1,
  );

  await db.query(`select public.set_asset_trash_state('p-new', true, 'manual')`);
  assert.equal(
    await scalar(
      `select count(*)::int from public.assets
       where user_id = $1 and id = 'p-new' and deleted_at is not null`,
      [USER_A],
    ),
    1,
  );

  await db.query(`select public.set_asset_trash_state('p-new', false)`);
  assert.equal(
    await scalar(
      `select count(*)::int from public.assets
       where user_id = $1 and id = 'p-new' and deleted_at is null`,
      [USER_A],
    ),
    1,
  );

  await db.query(
    `select public.commit_asset_merge(
       p_asset_id => 'p1', p_title => '合并结果', p_summary => '合并说明',
       p_content => '合并正文', p_metadata => '{"category":"软件开发"}'::jsonb,
       p_source_asset_ids => '{p1,p2}', p_asset_updated_at => now())`,
  );
  assert.equal(
    await scalar(
      `select count(*)::int from public.assets
       where user_id = $1 and id = 'p1' and title = '合并结果'`,
      [USER_A],
    ),
    1,
  );
  assert.equal(
    await scalar(
      `select count(*)::int from public.assets
       where user_id = $1 and id = 'p2' and deleted_at is not null`,
      [USER_A],
    ),
    1,
  );

  const snapshot = await db.query(
    `select version_id, version_number from public.asset_versions
     where user_id = $1 and asset_id = 'p1' order by version_number desc limit 2`,
    [USER_A],
  );
  assert.equal(snapshot.rows.length, 2);

  await db.query(`select public.restore_asset_merge($1)`, [
    snapshot.rows[1].version_id,
  ]);
  assert.equal(
    await scalar(
      `select count(*)::int from public.assets
       where user_id = $1 and id = 'p1' and title = '提示词一'`,
      [USER_A],
    ),
    1,
  );
  assert.equal(
    await scalar(
      `select count(*)::int from public.assets
       where user_id = $1 and id = 'p2' and deleted_at is null`,
      [USER_A],
    ),
    1,
  );

  await db.query(
    `select public.commit_asset_optimize(
       p_asset_id => 'p1', p_title => '优化后标题', p_summary => '优化后场景',
       p_content => '优化后正文', p_metadata => '{"category":"软件开发"}'::jsonb,
       p_asset_updated_at => now())`,
  );
  assert.equal(
    await scalar(
      `select count(*)::int from public.assets
       where user_id = $1 and id = 'p1' and title = '优化后标题'`,
      [USER_A],
    ),
    1,
  );

  await db.query(`select public.restore_asset_optimize('p1')`);
  assert.equal(
    await scalar(
      `select count(*)::int from public.assets
       where user_id = $1 and id = 'p1' and title = '提示词一' and content = '正文一'`,
      [USER_A],
    ),
    1,
  );

  await db.query(`select public.set_asset_trash_state('p-new', true, 'manual')`);
  const activeBefore = await scalar(
    `select count(*)::int from public.assets where user_id = $1 and deleted_at is null`,
    [USER_A],
  );
  await db.query(`select public.empty_asset_trash()`);
  assert.equal(
    await scalar(`select count(*)::int from public.assets where user_id = $1`, [USER_A]),
    activeBefore,
  );
  assert.equal(
    await scalar(
      `select count(*)::int from public.asset_versions v
       where v.user_id = $1
         and not exists (
           select 1 from public.assets a where a.user_id = v.user_id and a.id = v.asset_id
         )`,
      [USER_A],
    ),
    0,
  );

  assert.ok(
    (await scalar(`select public.next_asset_version_number($1, 'p1')`, [USER_A])) >= 1,
  );
});
