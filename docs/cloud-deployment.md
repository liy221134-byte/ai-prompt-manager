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

5. 在 Supabase Users 中创建用户，或为已有用户设置密码。

## 第三步：准备本地云端环境变量

在项目根目录创建 `.env.local`，内容参考 `.env.example`：

```text
NEXT_PUBLIC_DATA_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=你的 Supabase 项目 URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的 Supabase Anon Key
SUPABASE_SERVICE_ROLE_KEY=你的 Service Role Key
CRON_SECRET=自行生成的一串随机字符串
```

规则：

- `NEXT_PUBLIC_SUPABASE_URL` 和 Anon Key 可以用于浏览器。
- Service Role Key 只能放在服务端环境变量中。
- 不把 `.env.local` 提交到 Git。
- 不把任何 Key 发送到聊天中。

## 第四步：本地云端模式验证

运行：

```powershell
npm run dev
```

验证：

- 页面显示邮箱密码登录界面。
- 邮箱和密码可以登录成功。
- 登录后只显示当前用户自己的提示词。
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
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   CRON_SECRET=...
   ```

4. 部署应用。
5. 将 Vercel 地址加入 Supabase Auth 的 Redirect URL。
6. 重新部署。

## 第七步：验证生产环境

- 邮箱密码登录成功。
- 未登录用户不能读取提示词。
- 登录用户只能读取自己的数据。
- 新增、编辑和删除刷新后仍然存在。
- 手机和电脑显示同一份云端数据。
- JSON 备份和导入仍可使用。
- Vercel 环境变量没有进入 Git。
- `/api/health/db` 能正常运行。

## 免费层维护

- Supabase Free 项目连续 7 天无活动会暂停。
- 项目暂停不会自动转为付费。
- Vercel Cron 每天执行一次数据库心跳。
- 每月手动导出一次 JSON 备份。
- 如果 Supabase 项目被暂停，进入后台恢复。
- 免费服务不提供长期在线保证。

