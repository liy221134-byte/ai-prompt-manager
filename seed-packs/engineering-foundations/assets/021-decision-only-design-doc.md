---
id: MTH-DESIGN-DOC-001
title: 设计文档只写决定：四块内容
asset_type: method
purpose: development
layer: project
tech_context:
  - generic
priority: p1
scope: global
project_scale:
  - personal
  - medium
  - large
lifecycle_phase:
  - design
status: candidate
confidence: provisional
override_allowed: true
compile_target:
  - agents
  - template
verification: manual
evidence:
  - docs/superpowers/specs/（v2.12.0 至 v2.15.0 的设计文档都按四块内容组织，末尾留"设计偏差"）
  - docs/acceptance/（交付时逐条对照验收标准，实现与设计不一致的单独列出）
  - AGENTS.md（"正确性由验收保证，不由文档自己声明"）
source_references:
  - docs/superpowers/specs/2026-09-24-v2.14.0-sediment-flowback-design.md
  - templates/engineering/implementation-spec.md
related_assets:
  - MTH-GATES-001
  - TPL-ACCEPT-001
  - MTH-EVIDENCE-001
version: 0.1.0
last_reviewed: 2026-09-24
---

# 设计文档只写决定：四块内容

## 核心结论

《设计 + 任务清单》只保留四块内容：**做什么／不做什么**、**数据和产品行为影响**、
**验收标准**、**任务顺序与改动文件**。文档的作用是让人在动代码之前能判断"这件事对不对"，
不是留一份能证明自己干得好的材料。

## 使用条件

- 触发设计门时（数据结构、对外约定、外部依赖或持续成本）。
- 一次改动会跨多个文件、多个链路，需要先说清影响面时。

## 不适用场景

- 界面、文案、样式的局部调整。
- 已有测试覆盖的重构。

## 四块内容怎么写

| 块 | 写什么 | 不写什么 |
| --- | --- | --- |
| 做什么／不做什么 | 本版边界，明确列出本次**不做**的部分 | 分阶段的实施步骤 |
| 数据和产品行为影响 | 表结构、字段、行为变化、恢复与回滚语义 | 完整建表 SQL |
| 验收标准 | 每条都能用一次测试或一次手工验证判定 | 自检章节、覆盖率对照表 |
| 任务顺序与改动文件 | 顺序 + 每个任务改哪些文件 | 成段代码 |

两条附加纪律：

1. **篇幅以把事情说明白为准**：允许为说清而写长，不允许为写短而留下含糊表述——含糊的地方，
   后续实现会自行脑补。
2. **交付时逐条对照验收标准**：实现和设计不一致时，单独列「设计偏差」，由人决定改设计还是
   改实现，不在文档里悄悄改口径。

## 失败模式

- 文档里写自检章节和覆盖率对照表，用自己证明自己，验收时反而没人逐条对照。
- 只写"做了什么"，不写"不做什么"，实现范围越做越大。
- 不写恢复与回滚语义，迁移出问题才知道回不去。
- 验收标准写成"功能正常"这类不可判定的描述。

## 验证证据

- 设计文档的四块内容是否齐全。
- 交付说明里是否存在逐条对照记录，以及「设计偏差」清单。

## 相关资产

- `MTH-GATES-001`（引用）：设计门什么时候必须走。
- `TPL-ACCEPT-001`（引用）：验收标准要能进证据链。
- `MTH-EVIDENCE-001`（引用）：四块内容的结论不重复写第二遍。
