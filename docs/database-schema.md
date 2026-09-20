# 数据库结构

## 当前运行模式

### 本地模式

- 引擎：Node.js 内置 SQLite。
- 文件：`.data/prompts.sqlite`。
- 用途：本机开发、离线运行和本地多浏览器共享。

### 云端模式

- 引擎：Supabase PostgreSQL。
- 用途：生产环境、跨设备和多浏览器同步。
- 安全：所有用户数据通过 RLS 隔离。

## `prompts` 表

| 字段 | PostgreSQL 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `user_id` | `uuid` | 是 | 所属用户，关联 `auth.users.id` |
| `id` | `text` | 是 | 提示词稳定标识 |
| `title` | `text` | 是 | 标题 |
| `category` | `text` | 是 | 主分类 |
| `tags` | `text[]` | 是 | 标签数组，默认空数组 |
| `content` | `text` | 是 | Markdown 正文 |
| `use_case` | `text` | 是 | 适用场景 |
| `created_at` | `timestamptz` | 是 | 创建时间 |
| `updated_at` | `timestamptz` | 是 | 更新时间 |
| `deleted_at` | `timestamptz` | 否 | 为空表示正常，非空表示在垃圾箱 |
| `deleted_reason` | `text` | 否 | `manual` 或 `merge` |
| `merged_into_prompt_id` | `text` | 否 | AI 合并目标的稳定标识，仅合并归档来源时填写 |

主键：

```text
(user_id, id)
```

索引：

```text
prompts_user_updated_idx (user_id, updated_at desc)
prompts_user_deleted_idx (user_id, deleted_at)
```

普通列表查询必须包含 `deleted_at is null`，垃圾箱查询必须包含
`deleted_at is not null`。

## `prompt_versions` 表

保存 AI 合并前的目标提示词快照，用于恢复合并前内容。本期不暴露为完整
版本历史界面。

| 字段 | PostgreSQL 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `user_id` | `uuid` | 是 | 所属用户，关联 `auth.users.id` |
| `version_id` | `text` | 是 | 快照稳定标识 |
| `prompt_id` | `text` | 是 | 被恢复的目标提示词标识 |
| `title` | `text` | 是 | 合并前标题 |
| `category` | `text` | 是 | 合并前分类 |
| `tags` | `text[]` | 是 | 合并前标签 |
| `content` | `text` | 是 | 合并前 Markdown 正文 |
| `use_case` | `text` | 是 | 合并前适用场景 |
| `created_at` | `timestamptz` | 是 | 快照创建时间 |
| `version_reason` | `text` | 是 | 本期固定为 `merge_before` |
| `source_prompt_ids` | `text[]` | 是 | 本次合并的来源提示词标识，包含目标 |
| `restored_at` | `timestamptz` | 否 | 恢复时间，未恢复时为空 |
| `expires_at` | `timestamptz` | 是 | 快照过期时间，创建后 30 天 |

主键：

```text
(user_id, version_id)
```

索引：

```text
prompt_versions_user_prompt_idx (user_id, prompt_id, created_at desc)
prompt_versions_user_expires_idx (user_id, expires_at)
```

## `health_checks` 表

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `text` | 检查项标识 |
| `last_seen_at` | `timestamptz` | 最近一次心跳时间 |

这张表只用于 Vercel Cron 心跳。表已启用 RLS，普通浏览器用户不能读写。

## RLS 策略

`prompts` 表只允许已登录用户访问自己的数据：

- SELECT：`auth.uid() = user_id`
- INSERT：`auth.uid() = user_id`
- UPDATE：`auth.uid() = user_id`
- DELETE：`auth.uid() = user_id`

匿名用户不能读取或修改任何提示词。

`prompt_versions` 表采用同样的账号隔离规则，只允许已登录用户访问自己的
恢复快照，并同样提供 SELECT、INSERT、UPDATE、DELETE 四类策略。

## RPC 函数

以下函数均使用 `SECURITY INVOKER`，在调用者权限下执行，并继续遵守
RLS 账号隔离。

| 函数 | 用途 |
| --- | --- |
| `commit_prompt_merge(...)` | 原子保存一次合并：校验来源、快照目标旧内容、更新目标、归档其他来源 |
| `restore_prompt_merge(version_id)` | 恢复合并前目标内容，并只恢复仍被该次合并归档的来源 |
| `purge_expired_prompt_versions()` | 删除过期恢复快照和已删除超过 30 天的垃圾箱记录，仅服务端清理调用 |

## 保留规则

- 垃圾箱中的提示词和合并恢复快照默认保留 30 天。
- 云端由每日清理任务调用 `purge_expired_prompt_versions()` 删除过期数据。
- 本地模式在应用启动时清理过期数据。
- 恢复合并前版本时，目标提示词必须仍存在且处于活跃状态；来源只恢复仍由
  该次合并归档、未被后续手动操作改变状态的记录。

## 设计决策

### 为什么 `id` 使用文本

已有示例数据使用 `prompt-*` 标识，新数据使用 UUID 字符串。文本类型可以在迁移期间保持兼容。

### 为什么标签使用数组

当前是个人单用户产品，标签数量较少，数组查询足够简单。未来需要统一标签管理时，再增加独立标签表。

### 为什么正文保存 Markdown

Markdown 便于编辑、复制、版本比较和 AI 处理，也不需要存储 HTML 带来的脚本风险。

## 未来 2.0 可能增加的表

- `projects`：项目工作区。
- `documents`：PRD、ADR、验收、数据库说明等文档。
- `document_versions`：文档历史版本。
- `prompt_collections`：提示词集合或提示词包。
- `prompt_pack_items`：提示词与集合关系。
- `document_prompt_links`：文档与提示词的关联。

这些表只有在 2.0 需求正式进入开发后创建。
