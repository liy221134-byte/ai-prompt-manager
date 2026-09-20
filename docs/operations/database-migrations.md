# 数据库迁移

## 当前状态

- 迁移文件保存在 `supabase/migrations/`，文件名格式为 `YYYYMMDDHHMMSS_描述.sql`。
- `supabase/config.toml` 已加入仓库，`project_id` 指向远程项目，供命令行和 GitHub
  集成使用。
- 远程迁移历史表已与仓库对齐，两条记录分别是：

```text
202609180001  create_prompts
202609200001  add_prompt_merge_trash
```

## 三种执行方式

| 方式 | 谁执行 | 说明 |
| --- | --- | --- |
| Supabase MCP（当前默认） | Codex 直接执行 | 改完迁移文件后直接应用到远程，并跑顾问检查，不需要打开控制台 |
| GitHub 集成自动部署 | Supabase 自动执行 | 开启后，推送到 `main` 会自动应用新迁移，需要在控制台打开开关 |
| Supabase CLI | 本机命令行 | 需要本地重置数据库或拉取 schema 时使用 |

## 新增一条迁移的步骤

1. 在 `supabase/migrations/` 新建文件，命名格式 `YYYYMMDDHHMMSS_描述.sql`。
2. 使用可重复执行的写法：`create table if not exists`、`add column if not exists`、
   `create or replace function`、`drop policy if exists` 之后再 `create policy`。
3. 由 Codex 通过 MCP 应用到远程，并执行一次顾问检查确认没有 error。
4. 同步更新 `docs/database-schema.md`。
5. 提交并推送。

## 注意事项

- 已经发布过的迁移文件不要再改内容。需要调整时新增一条迁移，保持历史可追溯。
- 远程历史表是 `supabase_migrations.schema_migrations`，版本号必须与文件名的时间戳
  前缀一致，否则自动部署会重复执行旧迁移。
- 生产部署只应用迁移，以及 `config.toml` 里声明的 Edge Functions 和 Storage
  buckets；Auth、API 等配置不会被覆盖。
- 迁移历史原本为空（早期迁移是手工在 SQL Editor 执行的），已于 2026-09-20 对齐；
  对齐之前不要开启 GitHub 自动部署。
