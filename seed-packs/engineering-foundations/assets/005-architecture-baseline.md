---
id: MTH-ARCH-001
title: 架构与工程基线
asset_type: method
scope: project
project_scale:
  - medium
  - large
  - regulated
lifecycle_phase:
  - design
status: candidate
confidence: provisional
source_references:
  - docs/decisions/0005-cloud-architecture.md
  - docs/decisions/0007-production-configuration-hardening.md
  - docs/cloud-deployment.md
related_assets:
  - MTH-MODULE-001
  - RULE-BOUNDARY-001
version: 0.1.0
last_reviewed: 2026-09-20
---

# 架构与工程基线

## 核心结论

在功能并行开发前，应先确定模块边界、数据所有权、接口、安全、环境、
可观察性和发布方式。

## 使用条件

- 多个模块或多个团队并行开发前。
- 接入数据库、外部平台、登录、权限或生产环境前。
- 需要长期维护、迁移或审计时。

## 不适用场景

- 一次性原型可以只保留最小约束。
- 不应为了“完整架构”提前引入没有真实需求的组件。

## 基线内容

1. 系统上下文、模块和外部依赖。
2. 数据所有权和生命周期。
3. API、事件和错误契约。
4. 身份、权限、密钥和数据隔离。
5. 开发、测试、预览和生产环境。
6. CI/CD、构建门禁和版本策略。
7. 日志、指标、追踪、健康检查和告警。
8. 备份、恢复、回滚和故障演练。
9. 性能、容量、成本和免费额度边界。

## 失败模式

- 先并行开发，后补接口和数据模型。
- 所有模块直接访问同一批数据表。
- 配置错误时自动降级到不安全模式。
- 没有回滚目标和恢复证据。

## 验证证据

- 架构图和请求链路。
- 数据与接口目录。
- 环境变量和权限矩阵。
- 发布与恢复演练结果。

## 相关资产

- `MTH-MODULE-001`：拆分并治理模块边界。
- `RULE-BOUNDARY-001`：限制跨模块数据和接口访问。
