---
id: OPS-ACCEPT-002
title: 让 AI 先自测，再交验收清单
asset_type: method
audience: human
module: M4-验收
difficulty: L1
purpose: testing
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
  - AGENTS.md（交付说明要写：改了哪些文件、每个文件改了什么、如何预览或验证、未完成事项和风险）
  - docs/acceptance/v2.11.0.md（每次交付都附检查结果：429 项测试 + 生产构建）
status: candidate
confidence: provisional
source_references:
  - superpowers：verification-before-completion（声明完成前必须实际运行验证）
  - 本项目交付门的固定要求：先跑检查，再报结果
related_assets:
  - OPS-ACCEPT-001
  - OPS-TASK-001
version: 0.1.0
last_reviewed: 2026-09-24
---

# 让 AI 先自测，再交验收清单

## 核心结论

交付时必须同时给你两样东西：**它自己跑了什么检查、结果是什么**，以及
**你该怎么验、看到什么算对**。你只做抽查，不做它的第一遍测试。

## 使用条件

- 每次要求它交付功能、修复或内容改动时。
- 你和它不在同一台设备时（更依赖它的自测结果）。

## 不适用场景

- 纯咨询、只讨论方案不产出的对话。
- 它明确说了"这次只在本地试了、没法验证"的场景——那就降到最小改动再验。

## 交付时必须回答的四件事

```text
1. 改了哪些文件，每个文件改了什么
2. 怎么预览或验证（具体点哪里、看什么）
3. 它自己跑了什么检查，真实结果是什么（不许说"应该没问题"）
4. 没做完的事和已知风险
```

追加一条习惯：要求它**先自己跑一遍再交**，跑不过就先修，不要让你当第一个测试员；
跑不过又修不了的，必须明说卡在哪。

## 失败模式

- 只回一句"已完成"，你连从哪开始验都不知道。
- 说"应该没问题"，没有跑过任何检查。
- 检查没过也照常交付，把问题留给下一轮。

## 验证证据

- 交付说明（四件事写全）。
- 检查命令的真实输出（例如类型检查、测试、构建的结果）。

## 相关资产

- `OPS-ACCEPT-001`（引用）：拿到清单后，你按五状态自己抽一遍。
- `TPL-ACCEPT-001`（引用）：验收证据链模板。
- `MTH-QUALITY-001`（引用）：项目等级决定要跑哪些检查。
