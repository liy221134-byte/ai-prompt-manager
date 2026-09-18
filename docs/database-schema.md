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

主键：

```text
(user_id, id)
```

索引：

```text
prompts_user_updated_idx (user_id, updated_at desc)
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

