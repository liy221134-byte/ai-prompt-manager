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

## Supabase 配置确认

- [ ] Email 登录已启用
- [ ] 本地 Redirect URL 已配置
- [ ] 生产 Redirect URL 已配置
- [ ] Publishable Key 或兼容的 Anon Key 已配置
- [ ] `prompts` 表 RLS 和用户隔离策略已启用

## 本地与生产验证

- [ ] 未登录访问 `/` 会跳转到 `/login`
- [ ] 登录成功后可以进入提示词库
- [ ] 登录后刷新页面仍保持登录
- [ ] 退出登录后不能通过返回按钮看到云端数据
- [ ] 登录状态失效后再次访问页面会跳转到 `/login`
- [ ] 未登录请求 `/api/ai/extract-prompt` 返回 `401`
- [ ] 云端模式下请求 `/api/prompts` 返回 `404`
- [ ] 本地模式仍可正常读取、新增、编辑、删除和导入提示词
- [ ] 不同账号之间不能读取或修改彼此的提示词
- [ ] Vercel 缺少 Supabase 配置时显示配置错误，不进入本机数据模式
- [ ] Vercel Production 使用 Node.js `24.x`
- [ ] Vercel Build Command 显示为 `npm run check`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` 只配置在 Production 环境
- [ ] Preview 环境如需密码重置，已配置对应 Redirect URL

## 完成标准

代码检查、类型检查、自动化测试和生产构建通过后，再由用户完成 Supabase 控制台与真实账号验证。
