---
id: CASE-ENV-PREFIX-001
title: 集成前缀把命名错误放大成生产密钥泄露风险
asset_type: case_note
purpose: safety
layer: project
tech_context:
  - vercel
  - supabase
priority: p0
override_allowed: false
compile_target:
  - agents
  - readme
verification: gate
evidence:
  - docs/acceptance/week-07.md「环境变量范围：定位与修复」
  - docs/cloud-deployment.md「常见陷阱：Vercel 的 Supabase 集成」
  - 提交 2d70b3e（记录作用域修复与集成前缀陷阱）
scope: project
project_scale:
  - personal
  - medium
  - large
lifecycle_phase:
  - release
  - operate
status: candidate
confidence: provisional
source_references:
  - docs/decisions/0007-production-configuration-hardening.md
  - docs/acceptance/week-07.md
related_assets:
  - PLAYBOOK-RELEASE-001
  - MTH-ARCH-001
version: 0.2.0
last_reviewed: 2026-09-21
---

# 集成前缀把命名错误放大成生产密钥泄露风险

## 核心结论

第三方集成的安装参数会批量生成环境变量。一个填错的前缀会同时造成两个后果：应用读不到
变量，以及能绕过行级安全的生产密钥被投放到预览环境。这两个后果都不会在页面上直接显示出来。

## 使用条件

- 通过平台集成安装第三方服务时。
- 环境变量由集成批量生成，而不是手工逐条填写时。
- 项目区分开发、预览和生产环境时。

## 不适用场景

- 全部变量都由手工创建、并且有命名检查时，不需要这套流程。
- 不能把结论简化成"重命名变量"，作用域问题不会因为改名而消失。

## 经过与根因

- 安装 Vercel 的 Supabase 集成时，安装表单里的「环境变量前缀」被填成了
  `SUPABASE_SERVICE_ROLE_KEY_`。
- 集成因此同步出 16 条带错误前缀的变量，默认作用域是 Production + Preview。
- 命名错：13 条标准变量被套上错误前缀，应用代码只读精确名称，所以读不到这些变量。
- 作用域错：这批变量里包含能绕过行级安全的生产密钥，修复前确实存在于预览环境，
  安全门禁不成立。
- 另有一条与集成无关的独立作用域错：`CRON_SECRET` 被勾成了 Production + Preview。
- 定位难点：变量页面会截断长名字，只看页面会误判根因是命名还是作用域。

## 改进与门禁

1. 集成安装时「环境变量前缀」必须留空。
2. 修改环境变量后必须重新部署，运行时不会读取本地 `.env.local`。
3. 发布门禁必须包含一条：预览环境的变量清单里没有能绕过行级安全的密钥。
4. 用平台接口读取完整变量名，不用页面截断后的结果做判断。
5. 调整作用域后要复验生产：首页跳转、登录页和健康检查都要重新确认，防止改作用域时
   把密钥值清空。

## 失败模式

- 把根因理解成"命名错"或"作用域错"其中之一，修一半。
- 只删掉几条显眼变量，留着完整的一套带前缀变量当噪音。
- 用页面显示的截断名字下结论。
- 事故处理完不把检查项写进发布清单，下次集成安装再犯。

## 验证证据

- `docs/acceptance/week-07.md` 的处理结果表：16 条前缀变量作用域收窄为 Production，
  预览环境只剩 6 条公开变量，生产回归结果为 `/` 307、`/login` 200、
  `/api/health/db` 带错误密钥返回 401。
- `docs/cloud-deployment.md` 已把这条陷阱写进部署指南。

## 相关资产

- `PLAYBOOK-RELEASE-001`（验证）：发布门禁需要包含环境变量范围检查。
- `MTH-ARCH-001`（引用）：安全基线要覆盖密钥边界和配置失败时的行为。
