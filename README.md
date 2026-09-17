# AI 提示词资产管理工具

一个面向个人用户的 AI 提示词资产管理工具。它帮助用户采集、整理、检索、复用和持续优化提示词。

## 当前阶段

第 4 周：完成本机共享数据库和多浏览器数据同步。

当前版本支持：

- 浏览和搜索提示词
- 新增、编辑和删除提示词
- Markdown 编辑与预览
- 自动识别 `{{变量}}`
- 填写变量、生成最终内容并一键复制
- 使用浏览器本地存储保存数据
- 导出全部提示词为 JSON 备份
- 导入备份前预览新增、更新和跳过结果
- 合并提示词时不删除本机现有数据
- 记录最近一次备份时间
- 使用本机 SQLite 数据库保存提示词
- 本地 Chrome 和 Codex 浏览器共享同一份数据
- 自动检测旧浏览器数据并提供安全迁移
- 数据库关闭后重新启动，数据仍然保留

当前版本不包含注册登录、云端数据库、跨设备同步和团队协作。

## 本地数据说明

提示词当前保存在本机 `.data/prompts.sqlite` 数据库中。同一台电脑上的不同浏览器访问同一个本地服务时，会看到同一份数据。

数据库文件不会提交到 Git。当前数据服务只在本机运行，不代表已经支持云端或跨设备同步。浏览器 `localStorage` 只作为旧数据迁移来源和页面缓存。

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
- [8 周路线图](docs/roadmap.md)
- [开发规则与协作提示词](docs/development-rules.md)
- [技术选型](docs/decisions/0001-tech-stack.md)
- [第 1 周验收清单](docs/acceptance/week-01.md)
- [本地存储决策](docs/decisions/0002-local-storage.md)
- [第 2 周验收清单](docs/acceptance/week-02.md)
- [第 2 周手动验收测试单](docs/testing/week-02-manual-test-guide.md)
- [备份格式决策](docs/decisions/0003-backup-format.md)
- [第 3 周验收清单](docs/acceptance/week-03.md)
- [本机 SQLite 决策](docs/decisions/0004-local-sqlite.md)
- [第 4 周验收清单](docs/acceptance/week-04.md)
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
