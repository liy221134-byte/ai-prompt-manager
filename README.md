# AI 提示词资产管理工具

一个面向个人用户的 AI 提示词资产管理工具。它帮助用户采集、整理、检索、复用和持续优化提示词。

## 当前阶段

第 8 周：AI 合并与垃圾箱，准备发布 `v0.8.0`。

当前版本支持：

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
- 本地启动清理已包含，云端每日清理代码路径已包含，远程执行待验证
- 新增、编辑和删除提示词
- Markdown 编辑与预览
- 自动识别 `{{变量}}`
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

当前版本包含个人邮箱密码登录、Supabase 云数据库、跨设备同步、AI 合并和垃圾箱，
不包含团队协作和完整版本历史。

本版本代码与本地自动化检查已完成，远程 Supabase 数据库迁移、顾问验证和生产验证
仍为待发布门禁。

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
