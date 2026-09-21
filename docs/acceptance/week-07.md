# 第 7 周验收清单

## 代码阶段

- [x] 增加独立登录页 `/login`
- [x] 首页 `/` 改为服务端登录保护
- [x] Proxy 使用 `getClaims()` 验证会话
- [x] Proxy 自动刷新并传递 Supabase Cookie
- [x] 未登录访问页面时跳转到登录页
- [x] 登录后返回原本要访问的站内页面
- [x] 登录、重置密码和认证回调保持公开
- [x] 除健康检查外的 API 需要登录
- [x] AI 接口继续在 Route Handler 内二次校验
- [x] 云端模式拒绝本机 SQLite 数据接口
- [x] 站外登录返回地址会被安全过滤
- [x] 增加登录返回地址和路由策略测试
- [x] 本地模式保持原有使用方式
- [x] Vercel 配置缺失时页面和 API 安全关闭
- [x] Vercel 构建命令固定为 `npm run check`
- [x] Node.js 版本固定为 `24.x`
- [x] 登录页初始化成功或失败都会结束等待状态

## 生产工程文档

- [x] 云端目标架构包含浏览器、Vercel、Supabase 和 AI 服务的职责边界
- [x] 云端文档包含页面访问、数据读写和 AI 采集的请求链路
- [x] 发布文档包含数据库迁移、部署和回滚的顺序
- [x] 发布文档包含每次发布需要留存的证据
- [x] 工程能力学习计划已建立，且与产品路线图分开

## 生产加固验证

- [x] 发布前已经导出 JSON 备份，并记录备份时间
- [x] 数据库迁移名称、执行时间和验证结果已经记录
- [x] 使用测试提示词完成一次备份恢复演练
- [x] 使用上一个 Ready 部署完成一次回滚演练
- [x] 回滚后登录、提示词读取、编辑和 AI 采集正常
- [x] Preview 环境变量范围：只包含公开 Supabase 参数（2026-09-21 修复并复核，见下方记录）
- [x] `SUPABASE_SERVICE_ROLE_KEY` 和 `CRON_SECRET` 仅在 Production 使用（2026-09-21 修复并复核，见下方记录）
- [x] Vercel 日志和 `/api/health/db` 可以用于定位基础运行问题

## Supabase 配置确认

- [x] Email 登录已启用
- [x] 本地 Redirect URL 已配置
- [x] 生产 Redirect URL 已配置
- [x] Publishable Key 或兼容的 Anon Key 已配置
- [x] `prompts` 表 RLS 和用户隔离策略已启用

## 本地与生产验证

- [x] 未登录访问 `/` 会跳转到 `/login`
- [x] 登录成功后可以进入提示词库
- [x] 登录后刷新页面仍保持登录
- [x] 退出登录后不能通过返回按钮看到云端数据
- [x] 登录状态失效后再次访问页面会跳转到 `/login`
- [x] 未登录请求 `/api/ai/extract-prompt` 返回 `401`
- [x] 未登录请求 `/api/prompts` 返回 `401`
- [x] 登录后云端模式请求本机 SQLite API 返回 `404`
- [x] 本地模式仍可正常读取、新增、编辑、删除和导入提示词
- [x] 不同账号之间不能读取或修改彼此的提示词
- [x] Vercel 缺少 Supabase 配置时显示配置错误，不进入本机数据模式（实测见下方）
- [x] Vercel Production 使用 Node.js `24.x`
- [x] Vercel Build Command 显示为 `npm run check`
- [x] `SUPABASE_SERVICE_ROLE_KEY` 只配置在 Production 环境
- [x] Preview 环境如需密码重置，已配置对应 Redirect URL

## 完成标准

代码检查、类型检查、自动化测试和生产构建通过后，再由用户完成 Supabase 控制台与真实账号验证。

## 验收记录（2026-09-21）

本次通过脚本直接调用接口和生产地址完成，证据如下。

| 项目 | 判定方式 | 结果 |
| --- | --- | --- |
| 数据库迁移记录 | Supabase 迁移历史加第 8、9 周发布记录 | 4 条迁移（`202609180001`、`202609200001`、`202609200002`、`202609210001`）均已执行并记录 |
| 备份恢复演练 | 本地模式加临时数据库：导出备份、彻底删除一条提示词、导入备份 | 新增 1 条，恢复后标题和正文与备份完全一致 |
| 登录跳转 | 未登录访问生产首页 | 307 跳转到 `/login?next=%2F` |
| 本地增删改与导入 | 本地模式加临时数据库 | 新增、编辑、删除、导入全部正常 |
| 健康检查接口 | 带 `CRON_SECRET` 调用生产 `/api/health/db` | 200，返回 `{"ok":true,"mode":"supabase"}` |

顺带确认了两条既有规则：

- 导入冲突时保留更新时间较新的版本：改过的提示词不会被旧备份覆盖，导入显示「跳过」。
- 备份里已在垃圾箱的提示词不会复活，导入显示「跳过」。

## 环境变量范围：定位与修复（2026-09-21）

用 Vercel 接口读到了被页面截断的完整变量名。**根因是命名错，后果是作用域错**，两者同时成立，
而不是二选一。

安装 Supabase 集成时「环境变量前缀」被填成了 `SUPABASE_SERVICE_ROLE_KEY_`，集成于是同步出
16 条带错误前缀的变量，默认作用域 Production + Preview：`..._SUPABASE_URL`、
`..._SUPABASE_ANON_KEY`、`..._SUPABASE_PUBLISHABLE_KEY`、`..._SUPABASE_SECRET_KEY`、
`..._SUPABASE_SERVICE_ROLE_KEY`、`..._SUPABASE_JWT_SECRET`、`..._POSTGRES_URL`、
`..._POSTGRES_PRISMA_URL`、`..._POSTGRES_URL_NON_POOLING`、`..._POSTGRES_USER`、
`..._POSTGRES_HOST`、`..._POSTGRES_PASSWORD`、`..._POSTGRES_DATABASE`，以及三条
`NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY_*` 版本。

- 命名错：13 条标准变量被套上错误前缀，应用读不到（代码只读精确名称）。
- 作用域错：这批变量含能绕过行级安全的生产密钥，修复前确实存在于 Preview，门禁不成立。
- 另有一条与集成无关的独立作用域错：`CRON_SECRET` 被勾成了 Production + Preview。

处理结果：

| 动作 | 复核证据 |
| --- | --- |
| 16 条前缀变量作用域收窄为 Production | 重新读取变量清单，16 条 target 均为 `production` |
| `CRON_SECRET` 作用域改为 Production | 重新读取变量清单，target 为 `production` |
| Preview 作用域内容 | 只剩 `NEXT_PUBLIC_DATA_MODE`、`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`AI_API_BASE_URL`、`AI_API_KEY`、`AI_MODEL` |
| 生产回归 | `/` 307，`/login` 200，`/api/health/db` 带错误密钥返回 401（说明改作用域时密钥值没有被清空） |

遗留：那 16 条变量的名字仍然是错的，应用读不到，属于环境变量列表里的噪音。彻底清理的方式是
删除带前缀的 Supabase 集成，不阻塞验收。

### 应用实际读取的变量（已核实）

`NEXT_PUBLIC_DATA_MODE`、`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、
`SUPABASE_SERVICE_ROLE_KEY`、`CRON_SECRET`、`AI_API_BASE_URL`、`AI_API_KEY`、`AI_MODEL`。

公开参数允许出现在 Preview；`SUPABASE_SERVICE_ROLE_KEY` 和 `CRON_SECRET` 只允许 Production。
线上当前用的是 Anon Key 而不是 Publishable Key，代码两者都支持。

### 缺少配置时安全关闭（2026-09-21 实测）

本地把数据模式设为 supabase，同时清空 Supabase 公开配置后启动服务：

| 路径 | 结果 |
| --- | --- |
| `/` | 503 |
| `/api/prompts`（本机数据接口） | 503 |
| `/login` | 503 |

页面显示：「服务配置异常 · Supabase 公开配置不完整，服务已停止。请检查 Vercel 环境变量后重新部署。」

本机数据接口同样返回 503 而不是继续服务，说明**没有降级到本机 SQLite**。自动化测试里也有
对应用例（`tests/runtime-config.test.mjs` 的「Supabase 模式缺少公开配置时安全关闭」）。
