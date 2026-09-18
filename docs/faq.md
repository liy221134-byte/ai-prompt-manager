# 常见问题

## 本地开发

### `localhost:3000` 无法访问

确认开发服务器已启动：

```powershell
npm run dev
```

如果端口被占用，Next.js 会自动选择其他端口，以终端输出为准。

### 修改 `.env.local` 后没有生效

停止并重新启动开发服务器。环境变量只在服务启动时读取。

### 本地和其他浏览器数据不同

当前生产环境使用 Supabase，重新登录并刷新页面。如果仍不同，检查是否登录了不同账号。

## Supabase

### 免费项目会暂停吗

会。Free 项目连续 7 天无活动后可能暂停。暂停不会自动升级为付费，但需要进入 Dashboard 手动恢复。

### 为什么邮箱登录提示请求过多

Supabase 内置邮件服务限制每个项目每小时 2 封，同一邮箱 60 秒内只能请求一次。个人使用建议使用邮箱密码登录。

### 为什么其他浏览器看不到数据

确认三个浏览器登录的是同一个 Supabase 用户。不同用户的提示词由 RLS 隔离。

### 如何重置密码

使用应用的“忘记密码”，或在 Supabase Dashboard 的用户管理中触发重置。生产本地环境也可以使用 `scripts/set-supabase-password-safe.ps1`。

## AI 采集

### 提示 AI 服务尚未配置

检查服务端环境变量：

```text
AI_API_BASE_URL
AI_API_KEY
AI_MODEL
```

Vercel 修改环境变量后需要重新部署。

### DeepSeek 调用失败

- 检查 API Key 是否有效。
- 检查账户是否有可用余额。
- 检查模型名是否为 `deepseek-flash`。
- 检查 Base URL 是否为 `https://api.deepseek.com`。

### AI 结果会直接保存吗

不会。AI 结果只会进入编辑器，必须由用户确认后保存。

## Git 与部署

### GitHub HTTPS 连接被重置

可以使用 GitHub SSH 443 Deploy Key。当前仓库已经使用该方式。

### Vercel 部署失败

检查：

- GitHub 是否收到最新提交。
- Vercel 环境变量是否完整。
- Build Logs 中的第一条错误。
- `npm run check` 是否在本地通过。

