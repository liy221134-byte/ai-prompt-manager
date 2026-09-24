# 数据库迁移

## 当前状态

- 迁移文件保存在 `supabase/migrations/`，优先使用 `supabase migration new` 生成的
  时间戳文件名，例如 `20260921054052_add_project_asset_foundation.sql`。
- `supabase/config.toml` 已加入仓库，`project_id` 指向远程项目，供命令行和 GitHub
  集成使用。
- 当前仓库的迁移顺序如下：

```text
202609180001  create_prompts
202609200001  add_prompt_merge_trash
202609200002  document_prompt_lifecycle
202609210001  add_prompt_optimize
20260921054052 add_project_asset_foundation
20260921120000 add_asset_prompt_storage
20260922040501 add_source_package_storage
20260923150000 add_project_risk_level
```

`add_project_asset_foundation` 属于 2.0.0，`add_asset_prompt_storage` 属于 2.1.0，
后者只新增统一资产上的原子操作函数（进垃圾箱、合并提交、恢复合并、优化提交、回到优化前、
清空垃圾箱），不改表结构，也不删除 2.0.0 的旧函数，保证回滚到旧代码时仍然可用。

八条迁移已全部应用到线上，迁移历史与仓库一致，没有待应用的迁移。

## 三种执行方式

| 方式 | 谁执行 | 说明 |
| --- | --- | --- |
| Supabase CLI + 数据库密码（当前可用） | Codex 直接执行 | `migration list --db-url` 看历史、`db push --db-url` 应用、`db lint --db-url` 检查函数。连接串里的密码必须 URL 编码；不需要个人访问令牌 |
| Supabase MCP（2026-09-24 起可用） | Codex 执行，写生产库前要先得到同意 | 会话里连上 MCP 就不需要密码，能直接查结构、读日志、应用迁移。2026-09-24 重新授权后连上（29 个工具），写权限保留，约束见下面「生产库写入约定」 |
| GitHub 集成自动部署（已开启并验证） | Supabase 自动执行 | 推送到 `main` 自动应用新迁移。2026-09-20 用一条真实迁移验证过：推送后无需任何人工操作，Supabase 自动执行并写入历史表 |

## 新增一条迁移的步骤

1. 使用 `supabase migration new <描述>` 新建迁移文件，不要手工编造时间戳。
2. 使用可重复执行的写法：`create table if not exists`、`add column if not exists`、
   `create or replace function`、`drop policy if exists` 之后再 `create policy`。
3. 先在真实 Postgres 上把整条迁移链跑一遍：确认能执行、能重复执行、回填结果对得上，
   并真的调用一次新增的函数。只检查迁移文件文本会漏掉类型和字段名这类错误。
   这一步已经固化成 `tests/supabase-migration-postgres.test.mjs`（用 `@electric-sql/pglite`
   起一个真实 Postgres，随 `npm test` 一起跑），改完迁移直接跑测试即可。
4. 应用到远程（用 `db push --db-url`），确认迁移历史表里出现对应版本。
5. 跑 `db lint --db-url` 和安全项检查（行级安全、函数权限、`search_path`、外键索引），
   确认没有新增问题。
6. 同步更新 `docs/database-schema.md`。
7. 提交并推送。

## 生产库写入约定

MCP、数据库密码和 GitHub 自动部署都能改生产库，所以约束不在工具，在流程：
**改之前先在对话里拿到同意，改完留一条记录**。

- 同意要具体到这一次改动：改哪个对象（表／字段／函数／数据）、为什么改、影响范围、
  怎么回滚。含糊一句「你看着办」不算同意。
- 动手前先做一次只读核对（现状、影响行数）；能先在本地库或副本上跑通的，先在副本上跑。
- 一次改动记一条，写在本文件的「事实记录」里，字段是：日期、改了什么（对象 + SQL 摘要）、
  为什么、谁同意、怎么回滚、验完的结果。
- 改动要进代码的，照旧走迁移流程（新增迁移文件 + 提交），记录里写明对应的迁移版本号。
- 一次性数据修正（没有迁移文件的那种）同样要记录，并说明为什么没写成迁移。

## 注意事项

- 已经发布过的迁移文件不要再改内容。需要调整时新增一条迁移，保持历史可追溯。
- 远程历史表是 `supabase_migrations.schema_migrations`，版本号必须与文件名的时间戳
  前缀一致，否则自动部署会重复执行旧迁移。
- 生产部署只应用迁移，以及 `config.toml` 里声明的 Edge Functions 和 Storage
  buckets；Auth、API 等配置不会被覆盖。
- 迁移历史原本为空（早期迁移是手工在 SQL Editor 执行的），已于 2026-09-20 对齐。
- GitHub 自动部署已在 2026-09-20 开启，并用 `202609200002_document_prompt_lifecycle.sql` 验证通过：推送后 Supabase 自动执行迁移并记录历史，全程没有人工操作。

## 事实记录

- 2026-09-24（第二次写入）：**修正**线上一条字段不合法的资产，经产品负责人确认。
  资产 `rule-sample-001`（项目「CICD自动化部署工具」）是当天测试示例规则包时写进去的，
  `stage` 和 `priority` 取了产品不认识的取值，这一行读不出来，当时还会把整个资产列表拖挂。
  改动：`assets.metadata_json` 与对应 `asset_versions.metadata_json` 两处，
  `stage: build → implement`、`priority: p1 → should`，其余字段一个没动。
  核对：改动前全库 1 条不合法规则、1 条不合法版本；改动后各 0 条（79 条资产逐一过校验）。
  回滚方式：把那两个值改回 `build` / `p1`（不建议——改回去这一行又读不出来）。
  配套代码改动：读云端资产时跳过读不出来的行并留告警，所以以后即使再出现类似数据，
  也不会拖挂整个列表。
- 2026-09-24：Supabase MCP 通道恢复。原 OAuth 令牌已过期且刷新失败，改用桌面版自带的
  Codex CLI 重新授权（PATH 里的 npm 版 0.156.1 在动态注册这一步被 Supabase 拒绝，走它
  拿不到授权链接）。恢复后只读核对：线上迁移历史 8 条，与 `supabase/migrations/` 的
  8 个文件版本号和名称完全一致，没有多出或缺失。这次只查询，没有改结构和数据。
- 2026-09-23：`add_project_risk_level` 随 2.8.0 推送到 `main`，由 GitHub 集成自动应用到线上；
  用只读接口核对线上 `projects` 已存在 `risk_level`（老项目值为 `personal`）。
  同一天顺带核对：早先的 `add_source_package_storage` 也已生效（私有桶 `source-packages`
  存在，file_size_limit 20 MB，public=false）。
- 2026-09-22：`add_project_asset_foundation` 与 `add_asset_prompt_storage` 应用到线上，
  迁移历史现有 6 条。应用前在真实 Postgres 17 上完整执行过一遍，发现并修好了 2.0.0
  迁移里的两处错误：
  1. 回填版本记录时引用了云端不存在的 `source_prompt_ids_json`——那是本地 SQLite 的列名，
     云端 `prompt_versions` 用的是 `source_prompt_ids text[]`。
  2. 回填默认项目时 `select distinct` 列表里的裸 `null` 被推断成 `text`，写入
     `timestamptz` 列直接报类型错误。

  这两处原先被一条内容检查测试锁住（断言迁移文件里必须出现 `source_prompt_ids_json`），
  已一并修正。应用后核对结果：老表 9 条提示词全部回填为 9 个资产和 14 条版本，标题、
  正文、垃圾箱状态逐条一致；`db lint` 无结果；旧提示词表两行未改，旧函数全部保留。
