---
id: MTH-TASK-BOUNDARY-001
title: 任务边界按「能不能被单独否决」来切
asset_type: method
purpose: collaboration
layer: project
tech_context:
  - generic
priority: p2
scope: project
project_scale:
  - medium
  - large
  - regulated
lifecycle_phase:
  - design
status: candidate
confidence: hypothesis
override_allowed: true
compile_target:
  - agents
verification: manual
evidence: []
source_references:
  - superpowers（obra/superpowers）的 writing-plans 技能：Task Right-Sizing 与 File Structure
  - seed-packs/external-sources/README.md（采集台账与来源说明）
related_assets:
  - MTH-SCOPE-001
  - RULE-AGENT-TASK-001
  - MTH-DESIGN-DOC-001
version: 0.1.0
last_reviewed: 2026-09-27
---

# 任务边界按「能不能被单独否决」来切

## 核心结论

切任务只问一句话：**审的人有没有可能批准这个、否决旁边那个？** 可能，就切；不可能，就并。

一个任务是最小的、**自带测试周期**、值得一次**独立审核**的单元。配置、脚手架、文档这类
「附属动作」，并进需要它们的那个任务里——它们单独审没有任何意义。

顺带一条文件层面的纪律：**改动会一起发生的文件，应该住在一起**；按职责分，不按技术分层分。
你最容易同时想清楚的是「能一眼看进上下文」的那一小块代码。

## 使用条件

- 写《设计 + 任务清单》里的任务顺序时。
- 把一份大计划拆给多人或多智能体时。

## 不适用场景

- 一句话能说清的小改动：不用为它编任务表。
- 改动本来就连在一起、无法独立验证时：硬拆只会得到一堆跑不起来的半成品。

## 判断步骤

1. 每件事问：它能不能单独跑通、单独验？
2. 不能的，就地并进它依附的那个任务。
3. 再问一遍：这两块，审的人会不会一个批一个否？
4. 会，就分开；不会，就合成一个任务。
5. 最后检查：每个任务做完，系统是不是**可用、可测**的状态。

## 失败模式

- 按「写代码 / 写测试 / 写文档」拆，每个任务做完系统都是半成品。
- 拆得太碎：一个任务只改一行，审的人看不出它在干什么。
- 拆得太粗：一个任务混了三件事，出问题整块回退。
- 配置和脚手架单独成一个任务，做完什么都没法验。

## 验证证据

- 任务清单本身：每个任务都有可判定的完成标准。
- 抽查一个任务：做完之后系统能不能跑。

## 相关资产

- `MTH-SCOPE-001`（引用）：版本按子系统拆；任务是在子系统内再切一层。
- `RULE-AGENT-TASK-001`（引用）：切完的任务，正是派给智能体的那个「范围」。
- `MTH-DESIGN-DOC-001`（引用）：任务顺序与改动文件是设计文档的第四块。
