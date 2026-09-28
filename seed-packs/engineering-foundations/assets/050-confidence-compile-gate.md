---
id: RULE-CONFIDENCE-COMPILE-001
title: 没验证过的规则默认不参与编译
asset_type: rule
rule_type: must
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
  - regulated
lifecycle_phase:
  - analysis
  - build
status: candidate
confidence: hypothesis
override_allowed: true
compile_target:
  - none
verification: manual
evidence: []
source_references:
  - WorkBuddy 对本资产库的外部评审（2026-09-28）：指出 hypothesis 规则却标了本项目规模、会直接进 AGENTS.md
  - docs/reviews/2026-09-28-外部评审与裁决.md（评审结论与处置）
  - seed-packs/external-sources/README.md（采集台账与来源说明）
related_assets:
  - MTH-QUALITY-001
  - RULE-EVIDENCE-SCOPE-001
  - MTH-SINK-001
version: 0.1.0
last_reviewed: 2026-09-28
---

# 没验证过的规则默认不参与编译

## 核心结论

**可信度是 `hypothesis`（只有推导、没在真实项目用过）的资产，默认 `compile_target: none`——
不进 AGENTS.md，不参与项目编译。**

想让它进，必须满足下面任意一条，并在资产里写明：

1. **标清受益人**：它是给哪个语境、哪类项目用的（例如只给大型项目），由筛选规则决定进不进；
2. **本项目就是它的第一个验证者**：明确写下「本项目用来验证它」，并在这一版结束时回填证据；
3. **它是硬边界**：属于安全、数据不丢、密钥不外泄这类「宁可多一条」的红线。

## 使用条件

- 往资产包里新增外部来源提炼的规则时。
- 跑规则编译、决定哪些规则进 `AGENTS.md` 时。
- 给资产升级可信度时（升到 `provisional` 才按普通规则对待）。

## 不适用场景

- 已经在真实项目里用过、有 `evidence` 支撑的资产（它们按正常口径参与编译）。
- 项目专属的规则：那些本来就写在项目自己的 `AGENTS.md` 里，不经这套筛选。

## 判断步骤

1. 新增资产时先问：它在真实项目里用过吗？没有 → `confidence: hypothesis`。
2. 是 hypothesis 就默认 `compile_target: none`。
3. 想让它进编译，三条里挑一条：标受益人 / 指定第一个验证者 / 认定它是硬边界——三选一，写进资产。
4. 编译产物生成后自查一遍：进 `AGENTS.md` 的每一条，是不是都能说出它凭什么进来。
5. 版本收尾时回填证据，够条件的升 `provisional`，把 `compile_target` 改回来。

## 失败模式

- 同一条口径两种做法：有的 hypothesis 标了大规模被筛掉，有的标了本项目规模直接进了规则文件。
- 外部来源刚提炼的规则当天就进 `AGENTS.md`，谁也没用过。
- 把「我们认真讨论过」当成验证。
- 编译产物里混进一堆没验证的规则，模型只遵守一部分（规则太长时它本来就只守一部分）。

## 验证证据

- 资产清单里，`confidence: hypothesis` 与 `compile_target: none` 成对出现（硬边界除外，且写明理由）。
- 编译产物里逐条能回答「凭什么进来」。
- 版本收尾记录里，有从 hypothesis 升到 provisional 的条目和对应证据。

## 相关资产

- `RULE-EVIDENCE-SCOPE-001`（配套）：那条讲结论的边界，这条讲没边界的结论先别进规则文件。
- `MTH-QUALITY-001`（相关）：质量等级决定门禁密度；这条决定未验证知识进不进规则文件。
- `MTH-SINK-001`（上游）：沉淀分流的下一道闸口。
