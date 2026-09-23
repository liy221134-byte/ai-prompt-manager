---
id: OPS-DEBUG-001
title: 让 AI 找根因的提问法
asset_type: playbook
audience: human
module: M5-排错
difficulty: L2
purpose: development
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
override_allowed: false
compile_target:
  - none
verification: manual
evidence:
  - seed-packs/engineering-foundations/assets/018-systematic-debugging.md（四阶段流程）
  - docs/acceptance/v2.6.0.md（实测发现 React 受控告警，先复现再定位再修）
status: candidate
confidence: provisional
source_references:
  - superpowers：systematic-debugging（四阶段根因调试，禁止猜着改）
related_assets:
  - OPS-ACCEPT-002
  - OPS-SINK-001
version: 0.1.0
last_reviewed: 2026-09-24
---

# 让 AI 找根因的提问法

## 核心结论

出 bug 时，**先说现象、再要根因、最后才要修复**。只说"帮我修好"，等于让它猜；
猜出来的修复通常会盖住症状、留下隐患。

## 使用条件

- 任何"能观察到、但还没解释清楚"的异常。
- 你自己点出来的、用户反馈的、上线后发现的，都一样。

## 不适用场景

- 一眼可见的笔误、配置写错：改完确认一下就行。
- 正在扩大影响的事故：先回滚或止血，再回头查根因。

## 四句提问脚本

```text
1. 现象是……，复现步骤是……，报错原文是……
2. 先别改代码：说清你判断的根因是什么、依据是什么
3. 搜一下这个函数的全部调用方，给最小修复方案（只改根因那一处）
4. 修完补一条能挡住同类问题的检查，并跑一遍项目检查
```

配套三个追问：**影响范围**（还有哪些路径会踩到）、**为什么之前没发现**（观测缺在哪）、
**怎么防止复发**（补哪条检查或规则）。

## 失败模式

- 直接说"帮我修好"，拿回一个"加了判断就不报了"的补丁。
- 不追问影响范围，同一个 bug 在别的路径又冒出来。
- 修完不验证，你去点的时候才发现别的地方坏了。

## 验证证据

- 复现步骤和根因结论。
- 新加的回归检查（测试用例或手工检查步骤）。
- 项目检查的通过结果。

## 相关资产

- `PLAYBOOK-DEBUG-001`（依赖）：四阶段流程的完整版在工程包那条里。
- `OPS-ACCEPT-002`（引用）：修完的验证结果要写进交付说明。
