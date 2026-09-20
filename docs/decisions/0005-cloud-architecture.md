# 云端架构决策

## 决策

云端采用 Vercel Hobby + Supabase Free。应用保留 SQLite 本地模式，通过环境变量切换到 Supabase。

## 数据模式

```text
NEXT_PUBLIC_DATA_MODE=local
-> 本机 Next.js API
-> SQLite

NEXT_PUBLIC_DATA_MODE=supabase
-> Supabase Auth
-> Supabase PostgreSQL
-> Row Level Security
```

## 原因

- Vercel Hobby 符合个人、非商业用途。
- Supabase Free 对个人文本数据足够。
- Supabase 自带邮箱登录和 RLS，避免自行开发密码系统。
- 保留本地 SQLite，断网时仍可继续开发和验证。
- 现有 JSON 备份可以迁移到 Supabase，也可以用于恢复。
- 后续需要自建服务器时，可以替换数据适配层。

## 安全规则

1. 所有云端提示词必须带 `user_id`。
2. `prompts` 表必须启用 RLS。
3. 匿名用户不能读取或修改提示词。
4. Service Role Key 只允许存在于服务端环境变量。
5. 浏览器只能使用公开 URL 和 Publishable Key；旧项目可继续使用 Anon Key 兼容配置。
6. 不把 `.env.local`、Key 或数据库密码提交到 Git。

## 免费层限制

- Supabase Free 项目一周无活动后暂停。
- Vercel Hobby 只用于个人、非商业项目。
- 免费方案没有付费级别的 SLA。
- 每日心跳只能降低暂停概率，不能保证永不暂停。
- 免费政策未来可能调整。
