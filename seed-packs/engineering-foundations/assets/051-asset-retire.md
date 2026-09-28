---
id: MTH-ASSET-RETIRE-001
title: 资产也要退役：每季用三问清一次
asset_type: method
purpose: analysis
layer: project
tech_context:
  - generic
priority: p2
scope: global
project_scale:
  - personal
  - medium
  - large
  - regulated
lifecycle_phase:
  - operate
status: candidate
confidence: hypothesis
override_allowed: true
compile_target:
  - none
verification: manual
evidence: []
source_references:
  - WorkBuddy 对本资产库的外部评审（2026-09-28）：指出 48 条资产零退役，deprecated 取值一次没用过
  - docs/reviews/2026-09-28-外部评审与裁决.md（评审结论与处置）
  - seed-packs/external-sources/README.md（采集台账与来源说明）
related_assets:
  - MTH-SINK-001
  - RULE-EVIDENCE-SCOPE-001
  - MTH-EVIDENCE-001
version: 0.1.0
last_reviewed: 2026-09-28
---

# 资产也要退役：每季用三问清一次

## 核心结论

资产库只增不减，会从「方法库」退化成「没人读完的文档堆」。**每季清一次，每条资产问三句：**

1. **还有人读吗？**——最近一季有没有被引用、被编译进产物、被真正用过。
2. **能被另一份替代吗？**——和另一条重叠，且那条更准、更短。
3. **有对应证据吗？**——写下的结论有没有支撑，还是当初拍脑袋写的。

三条全否 → **归档（`deprecated`），不删除**；有一条成立 → 留下，并更新 `last_reviewed`。

配套一条超时线：**`last_reviewed` 超过 180 天的资产自动进体检清单**，不必等人想起来。

## 使用条件

- 每季度一次资产体检。
- 资产数量翻倍之前（增长快于淘汰时，先做一次清理再继续堆）。
- 发现两条资产在讲同一件事时。

## 不适用场景

- 刚建立、还没用过的资产（它需要的是被用一次，不是被退役）。
- 安全、数据完整性这类红线资产：宁可冗余，也不退役。
- 验收记录、发布记录这类**证据类**资产：它们记录发生过的事实，不参与退役。

## 判断步骤

1. 拉出资产清单，按 `last_reviewed` 排序，先看超期的。
2. 对超期或可疑的，逐条走三问。
3. 三问全否：状态改 `deprecated`，在备注里写清「为什么退、被谁替代」，保留正文；
   从编译清单里摘出去。
4. 有替代关系的，在两条资产的 `related_assets` 里互指，写明方向。
5. 体检结果记一处（一张季度清单），别散落在多个文档里。

## 失败模式

- `deprecated` 这个状态存在，但从来没用过——说明退役机制等于不存在。
- 只增不减，直到没人愿意读完全部规则。
- 用「删掉」代替「归档」，把历史判断也一并丢了。
- 退役时不写为什么，过一阵又有人把它加回来。

## 验证证据

- 最近一次季度体检的清单：每条超期资产有「留 / 退」的结论和一句话理由。
- 资产清单里至少出现过 `deprecated` 记录，且被替代关系写得清。
- 编译产物里不再包含已退役资产。

## 相关资产

- `MTH-SINK-001`（对称）：那条管「什么该升成公共资产」，这条管「什么该退出去」。
- `RULE-EVIDENCE-SCOPE-001`（相关）：外推边界长期不成立的资产，是退役的优先候选。
- `MTH-EVIDENCE-001`（相关）：退役结论也只记一处。
