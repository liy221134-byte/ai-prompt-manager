---
id: RULE-BOUNDARY-001
title: 接口契约与数据所有权规则
asset_type: rule
rule_type: must
purpose: data
layer: data
tech_context:
  - generic
priority: p0
override_allowed: false
compile_target:
  - agents
verification: gate
evidence:
  - supabase/migrations 的 RLS 策略（每个账号只能读写自己的数据）
  - tests/prompt-source-supabase.test.mjs、tests/prompt-source-contract.test.mjs（数据源契约测试）
scope: project
project_scale:
  - medium
  - large
  - regulated
lifecycle_phase:
  - design
  - build
status: candidate
confidence: provisional
source_references:
  - docs/v2-requirements-draft.md
  - docs/decisions/0005-cloud-architecture.md
related_assets:
  - MTH-MODULE-001
  - MTH-ARCH-001
version: 0.2.0
last_reviewed: 2026-09-21
---

# 接口契约与数据所有权规则

## 核心结论

每类业务数据必须有唯一写入方。模块之间通过版本化接口或事件协作，不允许
依赖对方内部表和未声明的实现细节。

## 使用条件

- 多个模块、服务、团队或供应商协作时。
- 数据迁移、独立部署、审计和回滚要求出现时。

## 不适用场景

- 原型阶段可以暂时简化，但必须记录为技术债。
- 只读报表可以经过数据同步或投影，但必须声明新鲜度和来源。

## 强制规则

1. 一个数据域只有一个业务写入方。
2. 跨模块访问必须先定义接口或事件契约。
3. 契约需要版本、兼容策略和废弃流程。
4. 不允许跨模块直接写表。
5. 数据库迁移由数据拥有方负责。
6. 接口错误、超时、重试和幂等语义必须明确。
7. 敏感字段需要脱敏、授权和审计规则。

## 失败的例外

确需例外时，必须记录：

- 原因。
- 影响范围。
- 临时或永久性质。
- 结束时间和迁移计划。
- 风险和验收负责人。

## 失败模式

- 多模块同时拥有同一字段的写入逻辑。
- 接口没有版本，修改后导致调用方失效。
- 共享表变更没有通知和迁移顺序。
- 通过数据库直连绕过权限和审计。

## 验证证据

- 数据所有权矩阵。
- API 与事件契约。
- 兼容性测试。
- 例外记录和关闭证据。

## 相关资产

- `MTH-MODULE-001`：模块拆分时必须同时确定数据所有权。
