---
id: MTH-EVIDENCE-001
title: 证据只记一处
asset_type: rule
rule_type: recommended
purpose: collaboration
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
  - build
  - release
status: candidate
confidence: provisional
override_allowed: true
compile_target:
  - agents
verification: manual
evidence:
  - AGENTS.md（"同一次发现只写进验收清单或决策记录中的一处，其他文档放链接引用"）
  - docs/acceptance/（每版只在一处记录检查结果，文档之间用链接引用）
  - docs/decisions/（技术选择的结论记在决策记录里，别处只引用）
source_references:
  - docs/development-rules.md
  - docs/INDEX.md
related_assets:
  - MTH-DESIGN-DOC-001
  - TPL-ACCEPT-001
  - MTH-QUALITY-001
version: 0.1.0
last_reviewed: 2026-09-24
---

# 证据只记一处

## 核心结论

同一次发现、同一个结论、同一次检查结果，**只在一处记录**，其他地方放链接引用。
复制粘贴会立刻产生两个真相，两边迟早不一致，而维护者永远不知道该信哪一份。

## 使用条件

- 一份结论需要在设计文档、变更记录、验收清单、运维手册里同时出现时。
- 多会话或多人协作，各自在不同文档里补记录时。

## 不适用场景

- 面向不同读者的**摘要**：允许写一句概述加链接，但不复制正文。
- 验收清单本身就是证据的唯一存放处时，别处不再抄一遍检查结果。

## 怎么落

1. 先问这份信息**归档在哪一类**：决策记录、验收清单、运维手册、变更记录。
2. 在那**一处**写全：结论、依据、时间。
3. 其他位置只写一句引用，例如"依据：`docs/acceptance/v2.11.0.md` 第 3 条"。
4. 发现同一结论出现在两处，合并到更接近事实来源的那一处，另一处改成链接。

## 失败模式

- 同一份检查结果在设计文档和验收清单里各写一遍，其中一处忘了更新。
- 变更记录里重抄验收清单，两边版本号对不上。
- 为了"让文档看起来完整"，每份文档都自成一个世界观。

## 验证证据

- 同一结论在仓库里出现的次数（应当只有一处是正文，其余是链接）。
- 有没有出现两份互相矛盾的记录。

## 相关资产

- `MTH-DESIGN-DOC-001`（引用）：设计文档不重复写验收证据。
- `TPL-ACCEPT-001`（引用）：验收记录是证据的默认存放处。
- `MTH-QUALITY-001`（引用）：门禁结论记在发布记录里，别处引用。
