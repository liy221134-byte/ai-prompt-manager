# AI 提示词资产管理工具

一个面向个人用户的 AI 提示词资产管理工具。它帮助用户采集、整理、检索、复用和持续优化提示词。

## 当前阶段

`v2.16.0` 已开发完成（`v2.12.0`～`v2.15.0` 的改动一并包含）：MCP 能**按目录批量灌文档、按编号批量灌节点**，
沉淀体检会给「该升公共还是留项目」的**分流建议**（一键批量提升）；
立项时工程基线会**推荐该装哪些公共资产**，
「立项与交付」面板能复制四条立项提示词、导出**开发体系包**（可下载或存成项目文档）；
项目里的资产能一键**提升为公共资产**、公共库改了会提示并可看差异/拉取，
公共资产视图的「更多」里能打开**沉淀体检**（哪些该升公共、哪些重复、哪些该复核），
文档与模板的边界理清（公共库只有「参考文档」和「模板」，项目里放这次做的事），
补上 Spec 这一层，工程基线能查链路完整性、也能把已有文档标成缺的那一类，
项目图谱可以批量挂文档，导入工程能原样导入项目文档，技术档案不用手填。
变更记录见 [CHANGELOG](CHANGELOG.md)，验收清单见 [v2.13.0](docs/acceptance/v2.13.0.md)，
逐条自测步骤见[用户故事与线上自测清单](docs/user-stories.md)。

项目标签（按 `docs/project-map.md` 判定，复判时直接读这三行）：

| 标签 | 取值 |
| --- | --- |
| 规模 | 个人工具 |
| 运行环境 | 全托管（Vercel + Supabase） |
| 当前阶段 | 4 发布与运维（阶段 3 的门禁在 `v2.11.0` 补跑） |

2.0 之后的这一版按自测反馈做交互重构，功能清单：

- 两个视图：公共资产（账号级方法库）和项目（项目自己的资产）；技术档案在项目设置里
- 主按钮、类型标签和筛选都按视图收敛，低频操作进「更多」
- 新项目从公共资产库挑资产、装规则包或导入工程
- 规则包：下载示例、自行打包、导入时报错说清该走哪个入口

2.0 功能线（`v2.0.0` 到 `v2.10.0`，设计文档在 `docs/`）：

- `v2.0.0`–`v2.1.2` 资产底座：项目、统一资产、版本、文档包导入、深度元数据、技术档案、资产关系、备份升级到 v2
- `v2.2.0` 规则包：规则集合的安装、导出与按包筛选；种子资产包进产品
- `v2.3.0` 规则编译：冲突候选与人工裁决，生成 `AGENTS.md`／`START_PROMPT.md` 草稿
- `v2.4.0` 模板中心：模板成为资产，编译产物可以套自己的结构
- `v2.5.0` 项目图谱：需求／模块／数据／接口／测试五类节点，稳定编号、树与两层影响分析
- `v2.6.0` 工程导入：从 SQL 建表语句和本机代码目录生成图谱节点草稿
- `v2.7.0` MCP 动态查询：本机 `npm run mcp` 起服务，AI 能查能写（只做可恢复操作）
- `v2.8.0` 项目质量等级与工程基线：按等级列出该有的工程文档、规则方向和发布前检查
- `v2.9.0` 验收证据链：验收记录（条件→步骤→结果→证据→提交版本），结论只能人改
- `v2.10.0` 发布门禁与故障演练：发布记录（门禁清单、回滚目标）、演练记录模板

资产管理底座（`v2.0.0` 起，计划见 `docs/v2-plan.md`）：

- 项目工作区：新建、重命名、归档、重新激活和项目切换
- 提示词、规则、文档统一进资产模型，每次正式保存产生一个不可变版本
- 上传 Markdown、文本和 ZIP 文档包，AI 识别草稿后由用户确认创建
- 规则和文档的深度元数据编辑
- 技术档案：一个项目一份，偏离默认选型要挂 ADR
- 资产关系：引用、依赖、替代、实现四类，支持正查和被谁引用
- 备份升级到 v2：项目、资产、元数据和关系一起导出，旧版提示词备份仍可导入

提示词功能（`v1.0.0` 起就有，至今保持）：

- 浏览和搜索提示词
- 粘贴原始内容并由 DeepSeek 自动生成结构
- 自动建议标题、分类、标签、正文和适用场景
- AI 结果进入编辑器，用户确认后才保存
- AI API Key 仅保存在服务端环境变量
- 选择 2 至 5 条提示词进行 AI 合并
- 第一条选中项默认为目标，保存前可调整，并支持可选合并要求
- AI 生成可编辑草稿和合并说明，用户确认后才保存
- 合并前目标内容保存为恢复快照
- 来源提示词进入垃圾箱，支持恢复、永久删除和清空
- 垃圾箱和恢复快照默认保留 30 天
- 对单条提示词做 AI 优化，只整理结构，不改变原意
- 优化说明、正文行级差异对比和变量变化清单
- 默认锁死变量集合，勾选「允许调整变量」后才允许增删改名
- 正文明显变短或变长时给出提醒
- 保存后 30 天内可以一键回到优化前
- 本地启动时清理过期垃圾箱和恢复快照；云端每日定时任务（Vercel Cron → `/api/health/db`）会写心跳并调用清理函数，2026-09-23 已核对心跳记录并用 service role 试调清理函数成功
- 新增、编辑和删除提示词
- Markdown 编辑与预览
- 自动识别 `{{变量}}`
- 变量清单随正文实时更新，可以逐条改名或降级为正文
- 支持把正文选区设为变量，也可以在光标处手动插入变量
- 保存前校验空名、重名、花括号、变量长度和数量上限
- 填写变量、生成最终内容并一键复制
- 浏览器 `localStorage` 仅用于旧数据迁移和页面缓存
- 导出全部提示词为 JSON 备份
- 导入备份前预览新增、更新和跳过结果
- 合并提示词时不删除本机现有数据
- 记录最近一次备份时间
- 使用本机 SQLite 数据库保存提示词
- 本地 Chrome 和 Codex 浏览器共享同一份数据
- 自动检测旧浏览器数据并提供安全迁移
- 数据库关闭后重新启动，数据仍然保留
- 使用 Supabase 邮箱密码登录
- 未登录访问受保护页面时自动跳转 `/login`
- 登录后返回用户原本要访问的页面
- 服务端和 API 双重校验登录状态
- Vercel 配置错误时安全关闭，不降级到本机 SQLite
- Vercel 构建强制执行完整工程检查
- JSON 备份只导出内容字段，导入不会恢复垃圾箱中的提示词

当前版本包含个人邮箱密码登录、Supabase 云数据库、跨设备同步、AI 合并、垃圾箱和
提示词 AI 优化，不包含团队协作和完整版本历史。

数据库迁移已经接入自动部署：推送到 `main` 后由 Supabase 自动应用 `supabase/migrations`
里的新迁移。v0.8.0 的远程迁移、顾问验证和生产验证均已通过。

## 本地数据说明

提示词默认保存在本机 `.data/prompts.sqlite` 数据库中。同一台电脑上的不同浏览器访问同一个本地服务时，会看到同一份数据。

云端模式使用 Supabase 保存提示词，并通过 RLS 隔离账号数据。本地与云端不自动同步。

数据库文件不会提交到 Git。浏览器 `localStorage` 只作为旧数据迁移来源和页面缓存。

## 产品目标

核心使用流程：

```text
找到提示词 -> 填写变量 -> 一键复制 -> 使用
```

核心采集流程：

```text
粘贴原文 -> AI 识别结构和标签 -> 用户确认 -> 保存
```

## 文档

- [产品范围](docs/product-brief.md)
- [项目文档索引](docs/INDEX.md)
- [8 周路线图](docs/roadmap.md)
- [2.0 需求草案](docs/v2-requirements-draft.md)
- [工程能力学习计划](docs/learning/engineering-readiness.md)
- [工程方法种子资产包](seed-packs/engineering-foundations/README.md)
- [项目规则（AGENTS.md）](AGENTS.md)
- [开发规则说明（给人看的版本）](docs/development-rules.md)
- [技术选型](docs/decisions/0001-tech-stack.md)
- [第 1 周验收清单](docs/acceptance/week-01.md)
- [本地存储决策](docs/decisions/0002-local-storage.md)
- [第 2 周验收清单](docs/acceptance/week-02.md)
- [第 2 周手动验收测试单](docs/testing/week-02-manual-test-guide.md)
- [备份格式决策](docs/decisions/0003-backup-format.md)
- [第 3 周验收清单](docs/acceptance/week-03.md)
- [本机 SQLite 决策](docs/decisions/0004-local-sqlite.md)
- [第 4 周验收清单](docs/acceptance/week-04.md)
- [云端部署指南](docs/cloud-deployment.md)
- [云端架构决策](docs/decisions/0005-cloud-architecture.md)
- [第 5 周验收清单](docs/acceptance/week-05.md)
- [AI 供应商决策](docs/decisions/0006-ai-provider-abstraction.md)
- [第 6 周验收清单](docs/acceptance/week-06.md)
- [第 7 周验收清单](docs/acceptance/week-07.md)
- [第 8 周验收清单](docs/acceptance/week-08.md)
- [v0.8.0 AI 合并与垃圾箱设计](docs/superpowers/specs/2026-09-20-ai-prompt-merge-design.md)
- [v0.8.0 AI 合并与垃圾箱实施计划（已归档）](docs/archive/2026-09-20-ai-prompt-merge-plan.md)
- [v0.9.0 提示词 AI 优化设计](docs/superpowers/specs/2026-09-20-ai-prompt-optimize-design.md)
- [第 9 周验收清单](docs/acceptance/week-09.md)
- [v0.9.1 变量管理设计](docs/superpowers/specs/2026-09-21-variable-management-design.md)
- [v1.0.0 整体验收清单](docs/acceptance/v1.0.0.md)
- [新项目 README 模板](templates/new-project/README.md)
- [新项目 AI 规则模板](templates/new-project/AGENTS.md)
- [新项目启动提示词](templates/new-project/START_PROMPT.md)

## 本地启动

第一次运行前，在项目根目录安装依赖：

```powershell
npm install
```

启动开发服务器：

```powershell
npm run dev
```

然后使用浏览器打开 `http://localhost:3000`。

### 本机模式（只有两个能力需要）

下面两件事**只在「本机数据模式」下可用**，需要它们时用这一条命令启动：

```powershell
npm run dev:local
```

- **导入工程 →「分析代码目录」**：要读你本机的目录，云端模式读不到。
- **MCP 服务**：另开一个终端跑 `npm run mcp`（要只读就加 `MCP_READ_ONLY=1`），
  读写的是同一个 `.data/prompts.sqlite`。

想确认 MCP 通不通，不用接客户端，跑一条自检就行：

```powershell
npm run mcp:check
```

它会把本机 MCP 服务真的拉起来，列出工具、项目和图谱节点，再对一个节点做一次影响分析。

本机模式的数据在 `.data/prompts.sqlite`，和线上那份是两套，不会互相影响；
`npm run dev`（不加 `:local`）则是用 `.env.local` 里的云端模式，数据和线上同一份。

### 本地与云端之间搬数据

产品不做自动同步（会把两边都改乱）。要搬数据时用产品自带的两步：

1. 在源那一侧「数据管理 → 导出备份文件」；
2. 在目标那一侧「数据管理 → 选择备份文件」导入。

导入语义是**只新增、不覆盖**：同 id 的资产跳过，同名项目合并，垃圾箱里的内容不进备份。

另外提供一个代跑脚本，把云端数据拉到本机（省掉线上导出那一步）：

```powershell
npm run sync:from-cloud                              # 真拉
node scripts/sync-from-cloud.mjs --dry-run            # 只看会拉什么，不落库
```

## 工程检查

以下命令会依次执行代码检查、类型检查和生产构建：

```powershell
npm run check
```

只运行自动化测试：

```powershell
npm test
```

## 当前技术栈

- Next.js App Router
- TypeScript
- Tailwind CSS
- Lucide React
