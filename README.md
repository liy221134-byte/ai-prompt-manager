# AI 提示词资产管理工具

一个面向个人用户的 AI 提示词资产管理工具。它帮助用户采集、整理、检索、复用和持续优化提示词。

## 当前阶段

第 1 周：建立项目基础并完成静态提示词卡片页面。

当前阶段只展示预设数据，不包含注册登录、数据库、编辑、搜索和团队协作。

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
- [技术选型](docs/decisions/0001-tech-stack.md)
- [第 1 周验收清单](docs/acceptance/week-01.md)

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

## 当前技术栈

- Next.js App Router
- TypeScript
- Tailwind CSS
- Lucide React
