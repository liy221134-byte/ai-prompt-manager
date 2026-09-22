# 工程地图

## 用途

这页是定位索引，不是教程。先用它找到要改的文件，再精读那几个文件，不要一上来通读大文件
（提示词库组件 55KB、本地数据库层 35KB）。

## 两种运行模式

- 本地模式：`NEXT_PUBLIC_DATA_MODE` 不是 `supabase`，走本机接口加 SQLite（`.data/prompts.sqlite`）。
- 云端模式：`NEXT_PUBLIC_DATA_MODE=supabase`，浏览器直连 Supabase 并由行级安全策略隔离账号。
- 线上（Vercel）强制云端模式；配置不合法时安全关闭，不降级到本机数据库
  （`src/lib/server/runtime-config.ts`）。
- 数据源在 `src/components/prompt-library.tsx` 里选择：本地用 `localPromptDataSource`，
  云端用 `createSupabasePromptDataSource`。

## 请求链路

```text
浏览器
-> src/app/page.tsx
-> src/components/prompt-library.tsx（界面与状态）
-> src/lib/prompt-source.ts（数据源契约）
   本地：src/lib/prompt-api.ts -> src/app/api/**/route.ts
        -> src/lib/server/prompt-database.ts -> SQLite（表结构在 asset-database.ts）
   云端：@supabase/supabase-js -> 数据表或 RPC（supabase/migrations/*.sql）
```

AI 调用：服务端路由 `src/app/api/ai/*`，请求组装在 `src/lib/prompt-ai.ts`，密钥只在服务端。

## 关键文件

| 文件 | 职责 | 什么时候需要读 |
| --- | --- | --- |
| `src/components/prompt-library.tsx`（55KB） | 首屏、项目切换、资产列表、各抽屉的接线与状态 | 改界面或接线时，按关键词定位段落 |
| `src/components/asset-*.tsx` | 资产卡片、详情抽屉（含版本列表与恢复）、编辑器 | 改规则和文档界面 |
| `src/components/prompt-*.tsx` | 提示词卡片、详情、编辑器、合并与优化抽屉、垃圾箱 | 改提示词流程 |
| `src/lib/prompt-source.ts`（24KB） | 数据源契约加本地、云端两套实现 | 改数据读写语义 |
| `src/lib/prompt-api.ts` | 本地接口调用封装 | 新增本地接口时 |
| `src/app/api/**` | 本地路由：资产、项目、提示词、AI、健康检查 | 新增接口时 |
| `src/lib/server/prompt-database.ts`（35KB） | SQLite 门面：提示词、垃圾箱、优化与合并恢复、资产与项目读写 | 改本地数据行为 |
| `src/lib/server/asset-database.ts`（19KB） | 项目与资产表结构、迁移、版本读取 | 改资产表结构 |
| `src/data/*.ts` | 领域类型与校验（资产、项目、提示词） | 改字段或加类型时 |
| `src/lib/asset-*.ts` | 资产草稿、列表筛选、版本与恢复的纯逻辑 | 改资产规则时 |
| `src/lib/prompt-backup.ts` | 备份导出与导入预览 | 改备份范围时 |
| `src/lib/server/runtime-config.ts` | 运行模式判定与配置失败关闭 | 改环境变量规则时 |
| `supabase/migrations/*.sql` | 云端表结构、行级安全策略、RPC，每个迁移可重复执行 | 改云端结构时 |

## 数据流要点

- 提示词：2.0.0 阶段仍写入 `prompts` 表，资产表在启动时同步补齐；把写入切到统一资产的设计
  在 `docs/superpowers/specs/2026-09-21-v2.1.0-prompt-write-path-design.md`。
- 资产版本：每次正式保存写一条不可变版本，恢复历史版本会产生新版本，历史版本不可改写。
- 备份：当前只含提示词内容字段，不含生命周期字段；导入时取更新时间较新的一方，跳过垃圾箱
  中的记录。
- AI：只有用户点击后才请求，提示词全文不写日志，密钥不进浏览器代码。

## 测试分布（30 个文件，200 项，约 11 秒）

| 文件前缀 | 覆盖内容 |
| --- | --- |
| `prompt-database-*.test.mjs`、`prompt-database.test.mjs` | 本地 SQLite 行为、垃圾箱、优化恢复 |
| `prompt-source-*.test.mjs` | 数据源契约与云端假客户端 |
| `asset-*.test.mjs`、`project-*.test.mjs` | 资产与项目领域逻辑、编辑器、备份兼容 |
| `supabase-*.test.mjs` | 迁移文件安全属性与浏览器初始化 |
| `seed-pack.test.mjs` | 种子资产包格式门禁 |

命名规律：`<领域>-<对象>.test.mjs`，新测试按同一规律命名。

## 常用命令（本机实测）

| 命令 | 用途 | 耗时 |
| --- | --- | --- |
| `npm run dev` | 本地开发 | 立即 |
| `npm run test` | 自动化测试 | 约 11 秒 |
| `npm run typecheck` | 类型检查 | 约 22 秒 |
| `npm run lint` | 代码检查（带缓存） | 约 35 秒，首次约 45 秒 |
| `npm run build` | 生产构建 | 约 90 秒 |
| `npm run check:fast` | 类型检查加测试 | 约 35 秒 |
| `npm run check` | 类型、测试、代码检查、构建 | 约 3 分钟 |

## 阅读建议

- 只改文案或样式：直接看对应组件文件。
- 改数据行为：先看 `prompt-source.ts`，再改 `server/prompt-database.ts`（本地）和
  `supabase/migrations`（云端），两边语义必须一致，并有契约测试兜住。
- 改界面接线：入口在 `prompt-library.tsx`，它是最大的文件，用搜索定位，不要通读。
