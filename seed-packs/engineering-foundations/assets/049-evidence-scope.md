---
id: RULE-EVIDENCE-SCOPE-001
title: 结论要标外推边界：它只在什么语境验证过
asset_type: rule
rule_type: must
purpose: analysis
layer: project
tech_context:
  - generic
priority: p1
scope: global
project_scale:
  - personal
  - medium
  - large
  - regulated
lifecycle_phase:
  - analysis
  - release
status: candidate
confidence: hypothesis
override_allowed: true
compile_target:
  - none
verification: manual
evidence: []
source_references:
  - WorkBuddy 对本资产库的外部评审（2026-09-28）：指出证据几乎全部来自同一个项目，存在循环论证
  - docs/reviews/2026-09-28-外部评审与裁决.md（评审结论与处置）
  - seed-packs/external-sources/README.md（采集台账与来源说明）
related_assets:
  - RULE-VERIFY-002
  - RULE-EVIDENCE-BOUNDARY-001
  - MTH-ASSET-RETIRE-001
version: 0.1.0
last_reviewed: 2026-09-28
---

# 结论要标外推边界：它只在什么语境验证过

## 核心结论

每条「这条方法有效」的结论旁边，都要写清**它是在什么语境里验证出来的**，以及**换语境时要重新验什么**：

> 外推边界：本结论仅在〔规模 + 技术栈 + 运行环境〕的语境验证过；换语境需重新验证。

不写边界会踩两个坑：

1. **循环论证**。用「本项目照这几条做，所以这几条是对的」去证明这几条——而本项目之所以产出这些证据，
   恰恰是因为遵守了它们。互为因果，等于没验证。
2. **假通用**。在单人 + 全托管的语境里成立的做法，被当成任何项目都成立，搬到内网或多团队项目直接失效。

## 使用条件

- 给一条规则、方法或结论标注可信度的时候。
- 说出「这条已经验证过了」之前。
- 把某个项目的经验往公共资产里搬之前。

## 不适用场景

- 一次性的、只服务当前任务的判断（不用标边界，用完即弃）。
- 项目专属事实（「这个表叫什么」），它本来就不打算外推。

## 判断步骤

1. 写结论时顺手补一行：这条是在哪个语境里得到的（规模 / 技术栈 / 运行环境 / 团队人数）。
2. 问一句：换个语境，这条还成立吗？哪些前提是它依赖的？
3. 依赖的前提写进「外推边界」，而不是省略。
4. 升级可信度之前先确认：证据来自**几个不同语境**？只有一个，就升不了级。
5. 结论被引用到别处时，边界跟着一起走。

## 失败模式

- 拿单一项目的经验当通用规律，且不说明语境。
- 证据全部来自同一个项目，却按「已验证」处理。
- 只写「本项目跑通过」，不写这个项目为什么不能代表别的项目。
- 边界写在正文里，复制到别处时被丢掉。

## 验证证据

- 结论本身带一行外推边界。
- 抽查一条：按它写的边界换一个语境推演，能说清哪里会失效。
- 可信度升级时，证据清单里能数出至少两个不同语境。

## 相关资产

- `RULE-EVIDENCE-BOUNDARY-001`（区别）：那条讲「这份证据能证明什么」，这条讲「这个结论能外推到哪」。
- `RULE-VERIFY-002`（上游）：证据必须是这次跑出来的；这条接着说，跑出来的也只能代表这个语境。
- `MTH-ASSET-RETIRE-001`（相关）：长期不外推、也无人再用的资产，走退役流程。
