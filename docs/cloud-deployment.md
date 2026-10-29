# Vercel + Supabase 免费部署指南

## 目标架构

```text
GitHub
-> Vercel Hobby
-> Next.js 应用
-> Supabase Auth
-> Supabase PostgreSQL
```

## 运行链路

### 页面访问

```text
浏览器
-> Vercel
-> Next.js 页面和 Proxy
-> Supabase Auth 验证会话
-> 受保护页面
```

### 数据读写

```text
浏览器
-> 受保护的 Next.js API
-> Supabase API
-> PostgreSQL 和 RLS
```

### AI 采集

```text
浏览器
-> 受保护的 Next.js AI API
-> DeepSeek
-> 返回结构化建议
-> 用户确认
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

- `NEXT_PUBLIC_SUPABASE_URL` 和公开 Key 可以用于浏览器。
- Publishable Key 和 Anon Key 二选一，必须配置至少一个；旧项目没有 Publishable Key 时用 Anon Key。
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
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...（或用 NEXT_PUBLIC_SUPABASE_ANON_KEY）

   仅 Production：
   SUPABASE_SERVICE_ROLE_KEY=...
   CRON_SECRET=...
   ```

   只有公开参数才允许勾选 Preview。能绕过行级安全的密钥一旦进入 Preview，等于把生产数据库
   交给每一个预览地址。

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

## 常见陷阱：Vercel 的 Supabase 集成

如果通过 Vercel 的 Supabase 集成安装，安装表单里的「环境变量前缀」必须留空。

前缀一旦填了内容，集成会同步出一整套带前缀的变量。例如前缀填 `SUPABASE_SERVICE_ROLE_KEY_`
时，会出现 `SUPABASE_SERVICE_ROLE_KEY_POSTGRES_PASSWORD`、
`SUPABASE_SERVICE_ROLE_KEY_SUPABASE_URL` 这类名字。这些变量有三个问题：

- 应用读不到，因为代码只读 `SUPABASE_SERVICE_ROLE_KEY`、`NEXT_PUBLIC_SUPABASE_URL` 这类精确名称。
- 默认投放到 Production 和 Preview，会把能绕过行级安全的密钥带进预览环境。
- 在环境变量页面不可编辑，只能调整集成配置本身。

本项目上出现过这种情况，作用域已经收窄到 Production。彻底清理的方式是删除该集成，
删除后应用依赖的变量都不受影响。

## 构建失败了怎么查

推送成功不等于部署成功。两件事分开核对：

```
git rev-parse --short=7 main                      # 本地
env -u HTTP_PROXY -u HTTPS_PROXY git ls-remote origin refs/heads/main   # 远端
```

两个 hash 一致＝推上去了。再去看 Vercel 有没有部署成功：

```
gh api "repos/<owner>/<repo>/deployments?environment=Production&per_page=1" \
  --jq '.[0] | "\(.created_at) \(.sha[0:7]) \(.id)"'
gh api "repos/<owner>/<repo>/deployments/<id>/statuses" \
  --jq '.[] | "\(.state) | \(.description)"'
```

`state=failure` 才算失败。失败时 GitHub 只给一句 "Deployment has failed"，**构建日志
只在 Vercel 面板里**（Deployments → 那条 → Build Logs），没有 token 时拿不到。

### 上线之前，本地要模拟 Vercel 的三件事

Vercel 的 `buildCommand` 是 `npm run check`，也就是 typecheck + 全部测试 + lint + 构建。
本地跑通不等于线上跑通，差距集中在这三处：

**一、`npm ci` 不认平台。** 本地一直用 `npm install`，它是宽松的——缺了可选依赖
照样装得上。Vercel 用 `npm ci`，它只核对「lock 与 package.json 是否一致」，缺一条就
在**安装阶段**退出，根本走不到构建。

```
npm ci --dry-run                                  # 本平台
npm ci --dry-run --os=linux --cpu=x64             # Vercel 的平台
```

两条都要 exit 0。

**二、Node 版本。** `package.json` 的 `engines` 写的是 `24.x`，Vercel 照办；本机装的
可能是 22。想本地复现就真拿 24 跑，别只看 `node -v` 猜：

```
curl -sL -o /tmp/node24.zip https://nodejs.org/dist/v24.22.2/node-v24.22.2-win-x64.zip
unzip -q /tmp/node24.zip -d /tmp/node24
export PATH="/tmp/node24/node-v24.22.2-win-x64:$PATH"
npm run check
```

**三、`node --test` 在 Node 24 下可能不肯退出。** 这是本项目真踩过的（2026-10-29）：
用例全部跑完、868 项全过，进程却一直不返回，因为某个测试留下了没释放的句柄。
Node 22 的 `--test` 到点自己退，所以这个问题在本机永远看不见；换到 Node 24 就是
构建卡到超时。`test` 脚本已加 `--test-force-exit`。

### 2026-10-29 那次失败的两个原因

| 现象 | 根因 | 判据 |
| --- | --- | --- |
| `npm ci` EUSAGE：`Missing: @emnapi/core@1.11.3` | 可选依赖只在 wasm 平台装，Windows 上 `npm install` 没写进 lock | `npm ci --dry-run` 由 exit 1 变 exit 0 |
| 构建卡住不结束 | Node 24 下 `node --test` 等残留句柄 | 串行 50s 通过、并发 10 分钟不返回、加 `--test-force-exit` 后 8s |

补 lock 的正确方式是按目标平台重算，不要重生成整份（会顺带升级一批依赖）：

```
npm install --package-lock-only --os=linux --cpu=x64
```

