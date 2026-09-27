---
id: RULE-PLAN-RULING-001
title: 跑计划时「裁决，不卡住」——只有四类事才停下来问
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
override_allowed: false
compile_target:
  - agents
verification: manual
evidence: []
source_references:
  - superpowers（obra/superpowers）的 subagent-driven-development 技能：Rulings, not stalls 与四条停止条件
  - seed-packs/external-sources/README.md（采集台账与来源说明）
related_assets:
  - RULE-AGENT-VERIFY-001
  - MTH-GATES-001
version: 0.1.0
last_reviewed: 2026-09-27
---

# 跑计划时「裁决，不卡住」——只有四类事才停下来问

## 核心结论

一份已经批准的计划在执行时，**不该每遇到一个小岔路就停下来问人**。冲突、歧义、计划本身的
小缺陷——自己裁决，留痕，继续走。

留痕的固定写法：

```text
决定：<我定了什么> — 为什么：<依据> — 错的话代价：<付什么>
```

有这一行，人回头能看见你替他做过哪些判断；判断错了，返工是有痕迹、可撤销的。
而停下来问，代价是他的整段时间。

**只有这四类事必须停下来问：**

1. **不可逆或破坏性操作**（删数据、删历史、强制覆盖）。
2. **安全敏感动作**（动密钥、动权限、动生产环境）。
3. **工作区之外的副作用**——合并、推共享分支、发布，这些按惯例要先问。
4. **计划烂到前面每条路都是猜**：不是有歧义，是整份计划的前提不成立。

## 使用条件

- 执行一份已经批准的多任务计划时。
- 计划执行中出现计划没写到的岔路时。

## 不适用场景

- 计划还没被批准：那是需求门和设计门的事，不在这一条里。
- 单人单任务的小改：没有「跑计划」这个语境。

## 判断步骤

1. 先判断眼前这件事属不属于上面四类。属于 → 停，问。
2. 不属于 → 当场裁决，并写下「决定／为什么／错了代价」。
3. 继续往下走，不因为「想确认一下」而中断。
4. 全部跑完后，把决策清单随交付一起给人。

## 失败模式

- 每做完一个任务就问一句「要继续吗」——把人当成每步都要按确认的按钮。
- 遇到歧义不裁决也不说明，闷头选一条，事后没人知道他替你决定了什么。
- 把「不可逆操作」也当成可以自己裁决的小事。
- 计划已经明显不成立，还在硬着头皮往下跑。

## 验证证据

- 执行过程中的决策清单（决定／为什么／错了代价）。
- 停下来问的那几次，属于四类之一。

## 相关资产

- `RULE-AGENT-VERIFY-001`（引用）：委派出去的任务收回来要验；这条讲的是执行中什么时候中断。
- `MTH-GATES-001`（引用）：三道门管的是「开不开始」，这条管的是「跑到一半要不要停」。
