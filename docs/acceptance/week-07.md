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

- [ ] 发布前已经导出 JSON 备份，并记录备份时间
- [ ] 数据库迁移名称、执行时间和验证结果已经记录
- [ ] 使用测试提示词完成一次备份恢复演练
- [ ] 使用上一个 Ready 部署完成一次回滚演练
- [ ] 回滚后登录、提示词读取、编辑和 AI 采集正常
- [ ] Preview 环境只包含公开 Supabase 参数
- [ ] `SUPABASE_SERVICE_ROLE_KEY` 和 `CRON_SECRET` 仅在 Production 使用
- [ ] Vercel 日志和 `/api/health/db` 可以用于定位基础运行问题

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
- [ ] 登录状态失效后再次访问页面会跳转到 `/login`
- [x] 未登录请求 `/api/ai/extract-prompt` 返回 `401`
- [x] 未登录请求 `/api/prompts` 返回 `401`
- [ ] 登录后云端模式请求本机 SQLite API 返回 `404`
- [ ] 本地模式仍可正常读取、新增、编辑、删除和导入提示词
- [ ] 不同账号之间不能读取或修改彼此的提示词
- [ ] Vercel 缺少 Supabase 配置时显示配置错误，不进入本机数据模式
- [x] Vercel Production 使用 Node.js `24.x`
- [x] Vercel Build Command 显示为 `npm run check`
- [x] `SUPABASE_SERVICE_ROLE_KEY` 只配置在 Production 环境
- [ ] Preview 环境如需密码重置，已配置对应 Redirect URL

## 完成标准

代码检查、类型检查、自动化测试和生产构建通过后，再由用户完成 Supabase 控制台与真实账号验证。
