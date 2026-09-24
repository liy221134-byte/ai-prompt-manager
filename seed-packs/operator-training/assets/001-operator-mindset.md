---
id: OPS-MINDSET-001
title: 你是指挥官，不是程序员
asset_type: principle
audience: human
module: 心法
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
  - analysis
priority: p0
override_allowed: false
compile_target:
  - none
verification: manual
evidence:
  - docs/acceptance/v2.11.0.md（2.0 整条线由产品负责人逐版签收，范围、验收和发布都是人定的）
status: candidate
confidence: provisional
source_references:
  - 12-Factor Agents：Contact humans with tool calls（关键节点必须能停下来叫人）
  - 本项目两轮真实交付（1.0 与 2.0 共 20 多个版本，每版一份验收清单）
related_assets:
  - OPS-TASK-001
  - OPS-ACCEPT-001
version: 0.2.0
last_reviewed: 2026-09-24
---

# 你是指挥官，不是程序员

## 核心结论

代码是 AI 写的，但有三件事必须由你定：**定范围**（做什么、不做什么）、
**做验收**（点一遍、看结果）、**定发布**（什么时候上、出事退到哪）。
把这三件事抓住，零代码也能把项目交付出去；这三件事一放手，AI 写得再快也没用。

## 使用条件

- 用 AI 做任何一个项目，尤其是刚开始不知道从哪下手的时候。
- 换了新工具、新模型时也要重新建立这三件事的习惯。

## 不适用场景

- 只是让 AI 查一段资料、写一句话，用完就扔的场景。
- 已经有团队规范替你兜底时——仍然要自己看过一遍范围和验收标准。

## 三句话心法

1. **定范围**：一句话说清这次做什么、明确不做什么；范围由你砍，不由 AI 扩。
2. **做验收**：不信"我做好了"，按用户流程点一遍，看结果对不对。
3. **定发布**：什么时候上线、上线前必须留下哪些证据、出事退回哪个版本，都由你定。

## 失败模式

- 把"AI 说已完成"当成验收。
- 不敢砍需求，每轮都想全做完，结果哪件都没做完。
- 让 AI 自己决定什么时候上线，出事时不知道退回哪里。

## 验证证据

- 每个版本一份验收清单，清单上有你的签字。
- 每个发布版本一条发布记录（门禁勾选情况）。

## 相关资产

- `MTH-REQ-001`（依赖）：定范围的具体做法在这里。
- `MTH-QUALITY-001`（引用）：你定的验收强度要和项目质量等级对得上。
