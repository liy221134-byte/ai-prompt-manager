---
id: OPS-SESSION-001
title: 会话管理：什么时候开新对话
asset_type: playbook
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
  - docs/pending-items.md（会话之间的交接靠文档："正在进行"一节接续上一轮）
  - docs/acceptance/v2.11.0.md（旧会话里的演练结论落成文档，新会话接着用）
status: candidate
confidence: provisional
source_references:
  - 12-Factor Agents：Own your context window（对话越长越贵越容易跑偏）
  - 本项目多会话协作的实践：结论落文档、新会话先读文档
related_assets:
  - OPS-MODEL-001
  - OPS-SINK-001
version: 0.1.0
last_reviewed: 2026-09-24
---

# 会话管理：什么时候开新对话

## 核心结论

对话越长，越贵、越容易跑偏。**让文档承载记忆，让会话承载一次任务**：
任务切换、方向跑偏、上下文太长时开新对话，开之前先把结论写进文档。

## 使用条件

- 每个工作时段开始时看一眼：这条对话是不是该换了。
- 一个阶段做完、要交接时。

## 不适用场景

- 同一个任务正在连续推进（写代码、跑测试、收尾），中途频繁重开反而丢细节。
- 需要连续迭代的排错过程：等这一轮定位有结论了再换。

## 该换对话的四个信号

1. **换任务**：从做功能切到写文档、从改这个模块切到改另一个。
2. **跑偏**：同一个话题来回三次没有进展，或者它开始答非所问。
3. **太长**：输入内容越来越长、回得越来越慢、你翻不到刚才的结论。
4. **要交接**：这个阶段要收尾，下一个阶段从零开始。

换之前做三件事：把结论写进文档（设计、验收、待办）、把未完成事项写清楚、
新对话里先让它读文档再开工。

## 失败模式

- 一条对话从立项一路用到发布，越到后面越贵越乱。
- 结论只在聊天里，不开新对话就继续不下去。
- 开了新对话，但不给文档，从头再描述一遍项目。

## 验证证据

- 项目文档里的决策与验收记录：把旧对话关掉，新对话读文档还能接着干。
- 待办文档里的"正在进行"一节。

## 相关资产

- `OPS-MODEL-001`（相关）：换对话也是省成本的主要手段之一。
- `OPS-SINK-001`（引用）：换对话前的结论怎么落成资产。
- `MTH-DELIVERY-001`（引用）：最小链路的文档是交接时最有用的材料。
