---
id: RULE-AGENT-TASK-001
title: 给智能体派活要四样给全，且不让它继承你的对话
asset_type: rule
rule_type: must
purpose: collaboration
layer: project
tech_context:
  - generic
priority: p1
scope: project
project_scale:
  - large
  - regulated
lifecycle_phase:
  - build
  - operate
status: candidate
confidence: hypothesis
override_allowed: true
compile_target:
  - agents
verification: manual
evidence: []
source_references:
  - superpowers（obra/superpowers）的 dispatching-parallel-agents 与 subagent-driven-development 技能
  - seed-packs/external-sources/README.md（采集台账与来源说明）
related_assets:
  - RULE-AGENT-VERIFY-001
  - RULE-PARALLEL-001
  - CASE-PARALLEL-001
version: 0.1.0
last_reviewed: 2026-09-27
---

# 给智能体派活要四样给全，且不让它继承你的对话

## 核心结论

派给一个智能体的任务，**四样缺一不可**：

1. **具体范围**——一个测试文件、一个子系统。不是「把所有测试修好」。
2. **清晰目标**——让它做到什么算完。
3. **约束**——不许改什么（例如「只改测试，别动生产代码」）。
4. **期望产出**——要它回什么（例如「根因是什么、改了哪些文件」）。

还有一条更根本的：**它的上下文由你精确构造，不让它继承你的会话历史。** 你手上那些
来回试错的过程对它全是噪音；给它的应该是「这个问题 + 相关的报错 + 边界」。

## 使用条件

- 把任务交给子智能体、或另一个会话的 AI 时。
- 同一个问题需要多人或多智能体分头处理时。

## 不适用场景

- 单人单会话、任务就在眼前：不需要「构造上下文」这一步。
- 探索性任务（还不知道坏在哪）：先自己摸清楚再派，否则派出去也是乱撞。

## 判断步骤

1. 写清范围：一句话说清「只碰哪一块」。
2. 写清目标：做到什么算完，最好带可判定的结果。
3. 写清约束：明确禁止的动作（改别的模块、顺手重构、加依赖）。
4. 写清产出：要它回什么形状的东西。
5. 检查一遍：**只给这些，它能不能独立理解？** 需要你口头补充的，就是没给全。

## 失败模式

- 范围太宽（「修一下测试」），智能体到处乱改。
- 没给上下文（「修那个竞态」），它不知道你说的是哪一处。
- 没给约束，它顺手重构了整个模块。
- 产出要求含糊（「修好就行」），你收回来不知道它到底动了什么。
- 把整段会话历史丢过去，重要的那三行淹没在几百行里。

## 验证证据

- 派活任务书本身：范围、目标、约束、产出四样都在。
- 收回来的产出对得上你要求的形状。

## 相关资产

- `RULE-AGENT-VERIFY-001`（引用）：派得清楚，收回来照样要自己验。
- `RULE-PARALLEL-001`（引用）：派之前先确认这些任务真的可以并行。
- `CASE-PARALLEL-001`（相关）：不分边界地并行，会重复实现同一件事。
