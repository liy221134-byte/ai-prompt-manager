---
id: MTH-REQ-001
title: 需求边界与外部依赖澄清
asset_type: playbook
scope: project
project_scale:
  - medium
  - large
  - regulated
lifecycle_phase:
  - analysis
status: candidate
confidence: provisional
source_references:
  - docs/product-brief.md
  - docs/acceptance/week-07.md
related_assets:
  - MTH-REQ-002
  - MTH-ARCH-001
version: 0.1.0
last_reviewed: 2026-09-20
---

# 需求边界与外部依赖澄清

## 核心结论

需求基线必须明确“做什么、不做什么、依赖谁、由谁验收”。范围不清时，
架构和工期都无法稳定。

## 使用条件

- 项目启动和每期迭代开始前。
- 接入外部系统、历史系统或第三方供应商时。
- 需求文档同时包含业务要求、技术方案和履约条款时。

## 不适用场景

- 一次性实验不应被大量流程文档阻塞。
- 详细交互细节可以在原型中逐步确认，不必全部前置冻结。

## 执行步骤

1. 列出本期目标和成功标准。
2. 列出本期不做的内容。
3. 把需求拆成业务、数据、接口、安全、运维和信创边界。
4. 为每个外部依赖记录提供方、测试环境、责任人和异常处理。
5. 标记假设、待确认项和无法控制事项。
6. 明确需求负责人和验收负责人。
7. 形成冻结版本和变更流程。

## 失败模式

- 把设计方案写成不可调整的需求。
- 外部接口没有测试环境，开发后期才发现不可用。
- 只记录功能，不记录数据所有权和非功能要求。
- 变更没有影响分析和重新验收。

## 验证证据

- 范围清单。
- 外部依赖清单。
- 需求追踪矩阵。
- 冻结版本和变更记录。

## 相关资产

- `MTH-REQ-002`：检查需求中的定量指标冲突。
