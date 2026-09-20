# 生产配置安全关闭

## 决策

Vercel 部署必须使用 Supabase 数据模式。只要线上环境缺少或错误配置
`NEXT_PUBLIC_DATA_MODE`，页面和 API 都返回 `503`，不再降级到本机
SQLite。

## 原因

- Vercel 运行环境无法长期保存本机 SQLite 文件。
- 错误降级可能让线上页面失去登录保护。
- 静默使用临时数据库会让用户误以为数据已经保存。
- 线上配置错误应该在部署阶段被检查，并在运行时失败关闭。

## 后果

- 本地开发仍可使用 `NEXT_PUBLIC_DATA_MODE=local` 和 SQLite。
- Vercel 环境必须配置完整的 Supabase 公开 URL 和 Publishable Key。
- Vercel 构建命令使用 `npm run check`，检查和构建失败时不会上线。
- Node.js 版本固定为 `24.x`，保证本机 SQLite 能力一致。
- 配置错误时用户会看到明确的中文错误页，而不是空白页或临时数据。

## 相关实现

- `src/lib/server/runtime-config.ts`
- `src/proxy.ts`
- `vercel.json`
- `package.json`
