---
id: MTH-ROUTE-001
title: 根据不确定性选择实施路线
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
  - docs/roadmap.md（8 周计划按"本地闭环 → 云端 → 生产加固"分阶段推进，未一次并行）
scope: global
project_scale:
  - personal
  - medium
  - large
  - regulated
lifecycle_phase:
  - analysis
  - design
status: candidate
confidence: provisional
source_references:
  - docs/roadmap.md
  - docs/v2-requirements-draft.md
related_assets:
  - MTH-PROJECT-001
  - MTH-DELIVERY-001
version: 0.2.0
last_reviewed: 2026-09-21
---

# 根据不确定性选择实施路线

## 核心结论

路线取决于需求不确定性和工程风险，不应机械采用“前端全部先做”或
“后端全部先做”。

- 个人工具和需求高度不确定时，可以使用交互原型优先。
- 中型产品应先建立关键数据、接口和安全基线，再按功能纵向交付。
- 大型平台必须先做领域拆分、架构基线和端到端最小链路，再并行开发。

## 使用条件

- 项目启动、重大范围变化或技术路线调整时。
- 需求较清晰但集成复杂时，优先降低工程风险。
- 需求模糊但成本低时，优先验证用户流程和产品价值。

## 不适用场景

- 不能把原型代码直接视为生产底座。
- 不能用大型项目治理方式拖慢一次低风险验证。
- 不能因为“先看到页面”就忽略数据结构、权限和集成风险。

## 选择步骤

1. 判断业务价值和需求不确定性。
2. 判断数据、安全、集成和性能风险。
3. 判断项目规模和交付周期。
4. 选择原型优先、端到端骨架优先或两者组合。
5. 明确哪些原型会被保留，哪些必须重做。
6. 将路线写入决策记录，并记录放弃的备选方案。

## 失败模式

- 大型项目先做完整前端，后期发现权限和数据模型不成立。
- 早期产品先建设完整平台，投入过高但用户价值未验证。
- 原型和生产代码边界不清，导致临时方案进入生产。

## 验证证据

- 路线决策记录。
- 风险清单和验证顺序。
- 原型保留或重做的边界。

## 相关资产

- `MTH-DELIVERY-001`：使用端到端最小链路降低集成风险。
