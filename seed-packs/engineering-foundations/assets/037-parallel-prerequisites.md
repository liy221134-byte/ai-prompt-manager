---
id: RULE-PARALLEL-001
title: 只有互相独立、没有共享状态的任务才并行
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
status: candidate
confidence: hypothesis
override_allowed: true
compile_target:
  - agents
verification: manual
evidence: []
source_references:
  - superpowers（obra/superpowers）的 dispatching-parallel-agents 技能：When to Use 与 When NOT to Use
  - seed-packs/external-sources/README.md（采集台账与来源说明）
related_assets:
  - RULE-AGENT-TASK-001
  - RULE-WORKTREE-001
  - MTH-SCOPE-001
  - CASE-PARALLEL-001
version: 0.1.0
last_reviewed: 2026-09-27
---

# 只有互相独立、没有共享状态的任务才并行

## 核心结论

并行不是「人多干得快」，它有**硬前提**：这些任务彼此独立、没有共享状态。
判断标准只有两条——**能不能各自独立理解？会不会碰到同一处？** 两条都过，才能并行。

可以并行：几个测试文件因不同根因失败、几个互不相干的子系统各自坏了。

**不能并行**（这几种最容易被误判成能）：

- 失败的根因相关：修好一个，另一个可能自己就好了——先一起查。
- 需要看全局状态才能判断：拆开谁都看不全。
- 还在探索、不知道坏在哪：先自己定位，别派出去乱撞。
- 会改同一批文件或用同一份资源：并行就是互相踩。

## 使用条件

- 手上有多个问题，正在决定是自己串着做还是派几路并行。

## 不适用场景

- 只有一件事：没什么可并行的。
- 任务虽多但串起来更快（依赖链很短）：拆开反而多出协调成本。

## 判断步骤

1. 把它们按**根因**分组，不是按现象分组。
2. 逐组问：换一个人独立看，能看懂吗？
3. 再问：它们会改到同一批文件吗？
4. 两条都过 → 可以并行，并且给每组配一个隔离的工作区。
5. 有一条不过 → 串行，或先做一次共同的调研。

## 失败模式

- 三个失败其实同一个根因，派了三路，各修一遍，合起来打架。
- 两路都要改同一个核心文件，合并时冲突一片。
- 还在「不知道哪儿坏了」的阶段就派活，智能体各自猜一套。
- 以为「并行总是更快」，忽略协调和合并的成本。

## 验证证据

- 并行前的分组记录：每组的根因、涉及的文件、彼此有没有重叠。
- 合并时没有冲突，或冲突可解释。

## 相关资产

- `RULE-AGENT-TASK-001`（引用）：确认能并行之后，怎么派活。
- `RULE-WORKTREE-001`（引用）：并行必须配隔离工作区，否则互相踩。
- `MTH-SCOPE-001`（引用）：版本按子系统拆，并行也按子系统分。
- `CASE-PARALLEL-001`（相关）：没有边界的并行，会重复实现同一件事。
