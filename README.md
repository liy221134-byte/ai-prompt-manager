# AI 提示词资产管理工具

一个面向个人用户的 AI 提示词资产管理工具。它帮助用户采集、整理、检索、复用和持续优化提示词。

## 当前阶段

第 2 周：完成个人提示词库的本地使用闭环。

当前版本支持：

- 浏览和搜索提示词
- 新增、编辑和删除提示词
- Markdown 编辑与预览
- 自动识别 `{{变量}}`
- 填写变量、生成最终内容并一键复制
- 使用浏览器本地存储保存数据

当前版本不包含注册登录、云端数据库、多设备同步和团队协作。

## 本地数据说明

提示词当前保存在当前浏览器的 `localStorage` 中。关闭页面或重启电脑后数据仍然存在，但清除浏览器网站数据会删除提示词，也无法跨设备访问。

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
