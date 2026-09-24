---
id: OPS-MODEL-001
title: 思考等级与成本：低档打底，高档攻坚
asset_type: method
audience: human
module: M3-驭程
difficulty: L1
purpose: collaboration
layer: project
scope: global
project_scale:
  - personal
  - medium
tech_context:
  - generic
lifecycle_phase:
  - build
priority: p1
override_allowed: true
compile_target:
  - none
verification: manual
evidence:
  - docs/acceptance/v2.11.0.md（加固与验收这类"攻坚"任务用高档跑，日常实现用低档）
  - docs/acceptance/v2.17.0.md（连续两版按"低档打底、攻坚才开高档"执行，没有因此返工）
status: candidate
confidence: provisional
source_references:
  - 本项目两轮开发的真实账单经验：全程高档跑，两天多花约 50 元
  - 12-Factor Agents：Small, Focused Agents（任务小，就不需要一直开高档）
related_assets:
  - OPS-SESSION-001
  - OPS-SINK-001
version: 0.2.0
last_reviewed: 2026-09-24
---

# 思考等级与成本：低档打底，高档攻坚

## 核心结论

日常实现用低档，架构选型、拆版本、难缠的 bug 用高档，**别全程高档**。
不同档位的成本能差好几倍，钱要花在真正需要"想清楚"的地方。

## 使用条件

- 每次开始一个任务前，先看一眼当前档位。
- 换了工具、换了模型时，重新建立这个习惯。

## 不适用场景

- 你用的工具/账号没有档位可选时——那就只能靠"任务切小"来控成本。

## 档位与场景

| 档位 | 用在 | 说明 |
| --- | --- | --- |
| 低 | 写功能、改 bug、更新文档、跑检查 | 绝大多数时间应该停在这里 |
| 高 | 架构选型、版本拆分、复杂排错、方案评审、加固验收 | 需要"想清楚"的场合才升 |
| 最高 | 极少用 | 卡死很久、影响面很大的问题 |

四个动作：

1. 开工前看档位（默认常常是高，先拉回来）。
2. 攻坚时临时升档，并在心里记一个"这次为什么升"。
3. 攻坚结束立刻降回来。
4. 账单或额度异常时，回看是不是忘了降、或者任务没切小。

## 失败模式

- 全程高档跑一天，多花几倍的钱。
- 改文案、排版这种活也用高档，纯浪费。
- 不知道自己钱花在哪：没有成本记录，也没有任务清单可对照。

## 验证证据

- 两轮开发的实际账单对比。
- 攻坚任务前临时升档、完成后降回的动作记录。

## 相关资产

- `OPS-SESSION-001`（相关）：控制对话长度同样影响成本。
- `MTH-ROUTE-001`（引用）：不确定性高的活本来就应该先探路再动手。
