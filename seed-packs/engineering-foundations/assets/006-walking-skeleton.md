---
id: MTH-DELIVERY-001
title: 端到端最小链路
asset_type: method
purpose: development
layer: project
tech_context:
  - generic
priority: p1
override_allowed: true
compile_target:
  - agents
verification: manual
evidence:
  - docs/acceptance/（week-01 至 week-05：页面 → 本机接口 → 云端 Supabase 逐段打通后才加 AI 功能）
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
  - docs/roadmap.md
  - docs/learning/engineering-readiness.md
related_assets:
  - MTH-ARCH-001
  - MTH-MODULE-001
version: 0.2.0
last_reviewed: 2026-09-21
---

# 端到端最小链路

## 核心结论

在大量页面和功能并行开发前，先用一条最薄但真实的链路验证前端、接口、
权限、数据、外部系统和部署能够贯通。

## 使用条件

- 多模块或多团队项目。
- 存在数据库、认证、外部接口或复杂部署时。
- 架构组件较多、后期集成风险较高时。

## 不适用场景

- 不要求最小链路覆盖所有业务规则。
- 不能把演示数据、假接口或跳过权限的链路视为完成。

## 执行步骤

1. 选择一条最有业务价值的核心链路。
2. 只实现最小字段和最小权限。
3. 打通真实数据源、接口、数据库和页面。
4. 加入登录、错误处理、日志和部署。
5. 使用真实测试环境完成一次验收。
6. 记录暴露的架构、接口和数据问题。
7. 修正基线后再开放大规模并行开发。

## 失败模式

- 骨架只做前端和假数据。
- 每条链路都依赖尚未完成的平台能力。
- 骨架通过后不更新架构和接口基线。
- 团队把骨架代码直接扩张成不可维护的临时系统。

## 验证证据

- 可运行的端到端链路。
- 请求、数据和安全流转记录。
- 已知风险和修正后的架构决策。

## 相关资产

- `MTH-MODULE-001`：骨架验证后进行服务域并行开发。
