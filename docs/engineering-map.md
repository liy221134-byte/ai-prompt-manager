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
| `src/app/api/source-packages/route.ts` | 来源包原文的上传、取回与放弃（只暂存原文，不写资产） | 改上传流程时 |
| `src/lib/source-package-upload.ts` | 上传校验：格式、大小、ZIP 文件头、文件名清洗 | 改允许的格式或上限时 |
| `src/lib/source-package-cloud.ts` | 云端原文：私有桶上传、签名下载、按目录删除 | 改云端存储行为时 |
| `src/lib/server/source-package-storage.ts` | 本地原文：落到 `source-packages/<上传编号>/` 并挡住越界路径 | 改本地存储位置时 |
| `src/lib/server/prompt-database.ts`（35KB） | SQLite 门面：提示词、垃圾箱、优化与合并恢复、资产与项目读写 | 改本地数据行为 |
| `src/lib/server/asset-database.ts`（19KB） | 项目与资产表结构、迁移、版本读取 | 改资产表结构 |
| `src/data/*.ts` | 领域类型与校验（资产、项目、提示词） | 改字段或加类型时 |
| `src/lib/asset-*.ts` | 资产草稿、列表筛选、版本与恢复的纯逻辑 | 改资产规则时 |
| `src/lib/graph-import.ts`、`src/lib/schema-import.ts`、`src/lib/code-module-scan.ts` | 工程导入：草稿结构与编号查重、SQL 建表语句解析、代码目录归类 | 改导入规则时 |
| `src/lib/server/code-directory-scan.ts`、`src/app/api/code-scan/route.ts` | 本机目录只读扫描与接口（仅本机模式） | 改扫描范围或上限时 |
| `src/components/engineering-import-drawer.tsx` | 导入工程面板：两个来源、预览勾选、确认写库 | 改导入界面时 |
| `src/lib/mcp-query.ts`、`src/lib/mcp-write.ts` | MCP 的查询整理与写入草稿（纯逻辑） | 改 MCP 工具行为时 |
| `scripts/mcp-server.ts` | 本机 MCP 服务：九个工具、只读开关、stdio 传输 | 加工具或改工具描述时 |
| `src/lib/quality-level.ts`、`src/components/engineering-baseline-drawer.tsx` | 质量等级到工程文档要求的对照表、缺口判定与面板 | 改等级要求或缺口口径时 |
| `src/lib/acceptance-evidence.ts` | 验收记录汇总、覆盖缺口与排序（纯逻辑） | 改验收覆盖口径时 |
| `src/lib/prompt-backup.ts` | 备份导出与导入预览 | 改备份范围时 |
| `src/lib/server/runtime-config.ts` | 运行模式判定与配置失败关闭 | 改环境变量规则时 |
| `supabase/migrations/*.sql` | 云端表结构、行级安全策略、RPC，每个迁移可重复执行 | 改云端结构时 |

## 数据流要点

- 提示词：2.1.0 起本地和云端都写在统一资产表（`assets` / `asset_versions`）里，旧提示词表
  保留为只读快照，只在迁移和备份兼容时读取。
- 来源包原文：`2.1.1` 起支持上传，原文落在数据目录的 `source-packages/`（本地）或 Supabase
  Storage 的私有桶（云端），资产里只记相对路径；资产要等用户确认草稿后才创建。
- 资产版本：每次正式保存写一条不可变版本，恢复历史版本会产生新版本，历史版本不可改写。
- 备份：当前只含提示词内容字段，不含生命周期字段；导入时取更新时间较新的一方，跳过垃圾箱
  中的记录。
- AI：只有用户点击后才请求，提示词全文不写日志，密钥不进浏览器代码。
- 工程导入：面板读 SQL 文本（或 `.sql` 文件）或扫本机目录（`/api/code-scan`，仅本机模式），
  先把结果列成节点草稿，确认之后才走同一套资产写入；同编号默认跳过，不覆盖已有正文。
- MCP：本机 `npm run mcp` 起 stdio 服务，查走 `src/lib/mcp-query.ts`，
   写走 `src/lib/mcp-write.ts` 加同一套 `createAsset`／`updateAsset`；
   库文件按脚本所在仓库定位，`MCP_READ_ONLY=1` 时只注册查询工具。

## 测试分布（62 个文件，421 项，约 15 秒）

| 文件前缀 | 覆盖内容 |
| --- | --- |
| `prompt-database-*.test.mjs`、`prompt-database.test.mjs` | 本地 SQLite 行为、垃圾箱、优化恢复 |
| `prompt-source-*.test.mjs` | 数据源契约与云端假客户端 |
| `asset-*.test.mjs`、`project-*.test.mjs` | 资产与项目领域逻辑、编辑器、备份兼容 |
| `supabase-*.test.mjs` | 迁移文件安全属性与浏览器初始化 |
| `supabase-migration-postgres.test.mjs` | 在真实 Postgres 上跑整条迁移链、回填、隔离和资产函数（较慢，约 13 秒） |
| `source-package-*.test.mjs` | 来源包上传校验、本地原文存储、上传接口、云端私有桶封装 |
| `seed-pack.test.mjs` | 种子资产包格式门禁 |
| `schema-import.test.mjs`、`graph-import.test.mjs` | 工程导入：SQL 建表语句解析、草稿编号查重与关系物化 |
| `code-module-scan.test.mjs`、`code-directory-scan.test.mjs` | 代码目录分析：模块与接口草稿、扫描跳过规则与上限 |
| `mcp-query.test.mjs`、`mcp-write.test.mjs` | MCP：项目与资产匹配、筛选、写入草稿与校验 |
| `mcp-server.test.mjs`、`mcp-stdio.test.mjs` | MCP 服务：工具清单、读写往返、只读模式、真实 stdio 传输 |
| `acceptance-evidence.test.mjs` | 验收记录汇总、覆盖缺口与排序 |

命名规律：`<领域>-<对象>.test.mjs`，新测试按同一规律命名。

## 常用命令（本机实测）

| 命令 | 用途 | 耗时 |
| --- | --- | --- |
| `npm run dev` | 本地开发 | 立即 |
| `npm run test` | 自动化测试 | 约 14 秒 |
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
