---
id: OPS-TASK-001
title: 需求翻译：一次一个清晰目标
asset_type: method
audience: human
module: M2-派活
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
priority: p0
override_allowed: true
compile_target:
  - none
verification: manual
evidence:
  - docs/v2-plan.md（2.0 拆成十来个版本，每版只做一个子系统）
  - AGENTS.md（"一次提交只处理一个清晰目标"）
status: candidate
confidence: provisional
source_references:
  - 12-Factor Agents：Small, Focused Agents（一次只给一个清晰目标）
  - 本项目 2.0 功能线的版本拆分与逐版交付记录
related_assets:
  - OPS-ACCEPT-001
  - OPS-SESSION-001
version: 0.2.0
last_reviewed: 2026-09-24
---

# 需求翻译：一次一个清晰目标

## 核心结论

把需求切成"AI 能一次做完、并且能自己证明做完"的小目标，**一次只给一个**，
每个目标都附验收标准。一次发十个需求，等于让 AI 自己决定先做哪个、做到什么程度算完。

## 使用条件

- 任何要落成功能、改动或内容的需求。
- 一轮迭代开始时，先把这一轮的清单摆出来，再逐个派。

## 不适用场景

- 还在探索阶段、只想让 AI 先给方案时：那是讨论，不是派活。
- 一行文案、一个配置值这种看一眼就能判定的改动。

## 派活四件套

```text
现状：现在是什么样、为什么不行
目标：这次要做到什么样（一句话）
不做什么：明确排除的范围
验收标准：怎么点、看到什么算完成
```

派活时按这三个动作走：

1. 先写四件套，再发任务；写不出来说明需求还没想清楚。
2. 一个目标一个任务；互相依赖的分先后，别一起发。
3. 做完先验收，再发下一个；验收没过就不往下叠。

## 失败模式

- 一口气描述十个需求，AI 挑简单的做。
- 只给目标、不给验收标准，结果"做完了"但达不到你要的效果。
- 前一个目标还没验收就发下一个，问题叠问题。

## 验证证据

- 版本拆分记录和每版的验收清单。
- 每轮迭代的交付说明：改了哪些文件、怎么验证。

## 相关资产

- `MTH-REQ-001`（引用）：先把边界澄清清楚，再翻译成任务。
- `OPS-ACCEPT-001`（引用）：验收标准要用黑盒验收的写法。
- `OPS-SESSION-001`（引用）：任务跨度大时，先想想是不是该开新对话。
