---
id: RULE-VERIFY-001
title: 回归测试要看到红-绿循环
asset_type: rule
rule_type: must
purpose: testing
layer: file
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
  - build
status: candidate
confidence: hypothesis
override_allowed: false
compile_target:
  - agents
verification: manual
evidence: []
source_references:
  - superpowers（obra/superpowers）的 verification-before-completion 技能，回归测试那一段要求红-绿循环
  - seed-packs/external-sources/README.md（采集台账与来源说明）
related_assets:
  - PLAYBOOK-DEBUG-001
  - RULE-VERIFY-002
version: 0.1.0
last_reviewed: 2026-09-27
---

# 回归测试要看到红-绿循环

## 核心结论

修完 bug 补的那条测试，**必须证明它真的挡得住这个 bug**：把修复回退掉，它得失败。
少了这一步，你只是「写了一个测试」——不知道它是挡住问题的那道闸，还是碰巧通过的路人。

五步走：

1. 写测试。
2. 跑一遍：修复还在，**应该通过**。
3. **把修复回退**（只回退根因那一处）。
4. 再跑：**必须失败**。不失败，说明这条测试没测到根因。
5. 恢复修复，再跑：通过。

## 使用条件

- 修完 bug、补回归测试时。
- 给已有代码补测试，想确认它确实覆盖了某个失败场景时。

## 不适用场景

- 新功能的常规测试：没有「修复」可回退，那条走「先写测试再实现」，第一次本来就是红的。
- 一行笔误这类改动：补一条检查的意义大于证明它会失败。

## 判断步骤

1. 先确认这条测试盯的是**哪个根因**——一条测试对一个根因。
2. 跑通过（绿）。
3. 只回退根因那一处，别顺手回退别的改动。
4. 跑，看到失败（红）。**看不到红就回去改测试**，不是改断言去迁就。
5. 恢复，跑通过。这三步的结果都写进交付说明。

## 失败模式

- 写完测试跑一次通过，就宣布「回归测试加好了」——那条测试可能根本没覆盖到 bug。
- 回退修复时把无关改动一起退了，看到的红不是这条 bug 的红。
- 看到的红其实是别的测试挂了，没细看是谁挂的。
- 让 AI 补回归测试，它说「已加测试」，但没人验证过它会失败。

## 验证证据

- 三次运行的结果：绿（修复在）→ 红（修复回退）→ 绿（恢复）。
- 交付说明里写明回退的是哪一处根因。

## 相关资产

- `PLAYBOOK-DEBUG-001`（引用）：那条讲「先复现再定位根因」，这条讲最后的回归怎么才算数。
- `RULE-VERIFY-002`（相关）：说「测过了」之前，得先有这次跑出来的证据。
