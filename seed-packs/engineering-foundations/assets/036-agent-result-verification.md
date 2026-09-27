---
id: RULE-AGENT-VERIFY-001
title: 收智能体的成果必须自己验，不能信它说成功
asset_type: rule
rule_type: must
purpose: testing
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
override_allowed: false
compile_target:
  - agents
verification: manual
evidence: []
source_references:
  - superpowers（obra/superpowers）的 dispatching-parallel-agents 技能：Review and Integrate 与 Verification
  - seed-packs/external-sources/README.md（采集台账与来源说明）
related_assets:
  - RULE-AGENT-TASK-001
  - RULE-VERIFY-002
  - RULE-PARALLEL-001
version: 0.1.0
last_reviewed: 2026-09-27
---

# 收智能体的成果必须自己验，不能信它说成功

## 核心结论

**智能体的「已完成」是一句话，不是证据。** 它回来之后，四步做完才算收工：

1. **读每份总结**——它说做了什么、根因是什么。
2. **查冲突**——几路并行时，有没有两路改了同一处。
3. **跑全量测试**——不是你派给它的那个文件，是**全套**。它自己那份跑绿，不代表合起来是绿的。
4. **抽查**——智能体会犯**系统性**错误：同一个错误认知会在它改的每一处重复。抽一两处看细节。

## 使用条件

- 子智能体或另一个会话说「已完成」「已修复」「测试通过」时。
- 多路并行、成果需要合到一起之前。

## 不适用场景

- 只读的调研任务（它只是查了东西、没改代码）：核对事实即可，不需要跑全量。
- 明确的探索性产出（「列出三种方案」）：属于讨论，不是交付。

## 判断步骤

1. 拿到改动面：它改了哪些文件（看 diff，不看它的描述）。
2. 查重叠：并行几路有没有碰同一个文件。
3. 合起来跑全量测试；**红就退回，别挑着跑**。
4. 抽查一两处实现细节，看它是不是按你给的约束做的。
5. 全绿且抽查没问题，才对外说这次委派成功。

## 失败模式

- 直接采信「已修复并验证」，把这句话写进交付说明。
- 只跑它负责的那个测试文件，合起来之后别处坏了不知道。
- 几路并行各改各的，合的时候冲突才发现。
- 不抽查：它把同一个错误在十处重复了十遍。

## 验证证据

- 合并后的全量测试结果（不是分片结果）。
- diff 层面的冲突检查记录。
- 抽查过的具体位置。

## 相关资产

- `RULE-AGENT-TASK-001`（引用）：派得越清楚，验起来越省事。
- `RULE-VERIFY-002`（引用）：那条讲「证据必须是这次跑出来的」，这条是它在委派场景的落地。
- `RULE-PARALLEL-001`（引用）：并行才有的冲突检查，前提是并行本身成立。
