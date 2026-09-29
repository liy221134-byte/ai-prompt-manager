---
id: MTH-REQ-FORMAT-001
title: 需求改写成三种格式
asset_type: rule
rule_type: recommended
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
  - analysis
  - design
status: candidate
confidence: hypothesis
override_allowed: true
compile_target:
  - agents
verification: manual
evidence: []
source_references:
  - 用户故事（3C + INVEST）、Job Story、WWA 三种需求格式的行业通行写法
  - seed-packs/external-sources/README.md（采集台账与来源说明）
related_assets:
version: 0.1.0
last_reviewed: 2026-09-28
---

# 需求改写成三种格式

## 核心结论

一段模糊需求，先用三种格式各写一遍，再决定用哪个：

| 格式 | 从哪出发 | 句式 | 什么时候用 |
| --- | --- | --- | --- |
| **用户故事** | 谁 | 作为〔角色〕，我想要〔做什么〕，以便〔得到什么好处〕 | 功能能独立开发、单独验收时 |
| **Job Story** | 情境 | 当〔情境〕，我想要〔动机〕，以便〔结果〕 | 同一角色在不同情境下差别很大、用户故事说不清时 |
| **WWA** | 为什么 | Why（为什么做）→ What（做什么）→ Acceptance（怎么算做完） | 把工作交给别人做、需要先讲清战略时 |

三种格式都要求**验收条件能点一遍判通过或失败**，且至少覆盖四类边界：空数据、超长、重复、并发；
涉及键盘或读屏的补一条。

## 使用条件

- 需求模糊、涉及新方向或存在多种做法时。
- 需求澄清后、动手设计之前。

## 不适用场景

- 已经清楚、只是要落地实现的例行需求。
- 纯文案、纯样式改动。

## 判断步骤

1. 缺什么先问清（一次问完），不要编需求里没有的功能。
2. 分别用三种格式写一遍，每条带 4～6 条验收条件。
3. 单列一节「三种格式的差别与建议用哪个」，给出选择建议。
4. 用户确认后，再进入设计门。

## 失败模式

- 三种格式互相抄，没有差别——那是凑数，不是澄清。
- 验收条件写得不可观察（「体验良好」「完成度足够」）。
- 边界情况不覆盖，上线才暴露空数据／超长／并发问题。
- 拿不确定当确定写进需求。

## 验证证据

- 三种格式各一节，且确实用了各自的句式。
- 每条验收条件都能观察、能判定通过或失败。
- 有「差别与建议用哪个」一节，并说清为什么选这个。

## 相关资产

- `template-user-story-md` / `template-job-story-md` / `template-wwa-md`（骨架）：本方法是定义，
  三份模板是填空结构，不要在这里重抄模板里的字段。
- `prompt-pack-product-methods`（执行指令）：把三种格式写成可直接粘贴的提示词，供 AI 起草。
