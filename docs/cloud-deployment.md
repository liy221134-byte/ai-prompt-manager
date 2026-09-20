# Vercel + Supabase 免费部署指南

## 目标架构

```text
GitHub
-> Vercel Hobby
-> Next.js 应用
-> Supabase Auth
-> Supabase PostgreSQL
```

本地开发继续使用 SQLite，云端生产环境使用 Supabase。通过 `NEXT_PUBLIC_DATA_MODE` 切换。

## 第一步：初始化 Supabase 数据库

1. 打开 Supabase 项目。
2. 进入 SQL Editor。
3. 打开项目文件 `supabase/migrations/202609180001_create_prompts.sql`。
4. 将全部 SQL 粘贴到 SQL Editor。
5. 执行 SQL。
6. 确认创建了 `prompts` 和 `health_checks` 两张表。
7. 确认 `prompts` 已启用 Row Level Security。

## 第二步：配置邮箱密码登录

1. 进入 Authentication。
2. 确认 Email 登录已启用。
3. 在 URL Configuration 中设置本地开发地址：

   ```text
   http://localhost:3000/**
   ```

4. Vercel 部署完成后，再添加正式地址：

   ```text
   https://你的项目地址.vercel.app/**
   ```

5. Preview 环境默认不要求验证密码重置。如果需要在 Preview 中测试：
   - 先取得该 Preview 部署的完整域名。
   - 将对应域名加入 Supabase Redirect URL。
   - 不要把 Production 的 Service Role Key 自动暴露给临时 Preview。

6. 在 Supabase Users 中创建用户，或为已有用户设置密码。

## 第三步：准备本地云端环境变量

在项目根目录创建 `.env.local`，内容参考 `.env.example`：

```text
NEXT_PUBLIC_DATA_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=你的 Supabase 项目 URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=你的 Supabase Publishable Key
NEXT_PUBLIC_SUPABASE_ANON_KEY=旧项目可选，使用 Anon Key 时填写
SUPABASE_SERVICE_ROLE_KEY=你的 Service Role Key
CRON_SECRET=自行生成的一串随机字符串
```

规则：

- `NEXT_PUBLIC_SUPABASE_URL` 和 Publishable Key 可以用于浏览器。
- 旧项目没有 Publishable Key 时，可以改用 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。
- Service Role Key 只能放在服务端环境变量中。
- 不把 `.env.local` 提交到 Git。
- 不把任何 Key 发送到聊天中。

## 第四步：本地云端模式验证

运行：

```powershell
npm run dev
```

验证：

- 直接访问 `/` 时会跳转到 `/login`。
- `/login` 显示邮箱密码登录界面。
- 邮箱和密码可以登录成功。
- 登录后返回原本访问的受保护页面。
- 登录后只显示当前用户自己的提示词。
- 退出登录后再次访问 `/` 会回到 `/login`。
- 未登录直接请求 `/api/ai/extract-prompt` 返回 `401`。
- 云端模式下请求本机提示词 API 返回 `404`。
- 本地浏览器缓存中的旧数据可以迁移到 Supabase。
- 新增、编辑和删除可以写入云端。

## 第五步：连接 GitHub

1. 在本地配置远程仓库。
2. 推送 `main` 分支。
3. 确认 GitHub 仓库中没有 `.env.local`。
4. 确认仓库是 Private。

## 第六步：连接 Vercel

1. 在 Vercel 中选择导入 GitHub 仓库。
2. Framework Preset 选择 Next.js。
3. 添加以下环境变量：

   ```text
NEXT_PUBLIC_DATA_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
# 旧项目可改为 NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
CRON_SECRET=...
   ```

4. 在 Vercel 项目设置中确认 Node.js 版本为 `24.x`。
5. 确认 Build Command 使用仓库中的 `npm run check`。
6. 按环境设置变量：

   ```text
   Production 和 Preview：
   NEXT_PUBLIC_DATA_MODE=supabase
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...

   仅 Production：
   SUPABASE_SERVICE_ROLE_KEY=...
   CRON_SECRET=...
   ```

7. 部署应用。
8. 将 Vercel 正式地址加入 Supabase Auth 的 Redirect URL。
9. 重新部署。

## 第七步：验证生产环境

- 邮箱密码登录成功。
- 未登录访问 `/` 时会跳转到 `/login`。
- 登录后会回到原本要访问的页面。
- 未登录用户不能读取提示词。
- 登录用户只能读取自己的数据。
- 新增、编辑和删除刷新后仍然存在。
- 手机和电脑显示同一份云端数据。
- JSON 备份和导入仍可使用。
- Vercel 环境变量没有进入 Git。
- `/api/health/db` 能正常运行。
- 删除或写错 `NEXT_PUBLIC_DATA_MODE` 时页面和 API 返回 `503`，不会读取本机 SQLite。

## 免费层维护

- Supabase Free 项目连续 7 天无活动会暂停。
- 项目暂停不会自动转为付费。
- Vercel Cron 每天执行一次数据库心跳。
- 每月手动导出一次 JSON 备份。
- 如果 Supabase 项目被暂停，进入后台恢复。
- 免费服务不提供长期在线保证。

## 配置错误处理

- Vercel 运行环境只允许 `NEXT_PUBLIC_DATA_MODE=supabase`。
- Supabase URL 或公开 Key 缺失时，应用返回明确的中文配置错误。
- 不允许线上环境自动降级为本机 SQLite。
- 修改环境变量后必须重新部署，运行时不会读取本地 `.env.local`。
