---
id: RULE-APPROVAL-IS-EXPLICIT-001
title: 提案、计数、队列都不算批准，写操作要带校验值和理由
asset_type: rule
rule_type: forbidden
purpose: safety
layer: project
tech_context:
  - generic
priority: p0
scope: global
project_scale:
  - personal
  - medium
  - large
  - regulated
lifecycle_phase:
  - build
  - operate
status: candidate
confidence: hypothesis
override_allowed: true
compile_target:
  - none
verification: manual
evidence: []
source_references:
  - Exomem（github.com/Artexis10/exomem）的助手使用指南：绝不把提案、重复出现次数或队列条目当成批准，只有单独一次带校验值和理由的写入才算
  - Exomem 仓库说明：会话管理动作不暴露成给 Agent 的工具
  - 采集台账：seed-packs/external-sources/README.md（来源 S9）
related_assets:
  - RULE-AI-WRITE-001
  - MTH-REFERENCE-001
  - MTH-EVIDENCE-001
version: 0.1.0
last_reviewed: 2026-09-30
---

# 提案、计数、队列都不算批准，写操作要带校验值和理由

## 核心结论

系统给出「建议做某事」的结果，那只是建议。**下面这些都不构成同意：**

- 一条待处理的提案；
- 同一个建议重复出现的次数；
- 待办／审核队列里的一个条目；
- 一个清单上被打过的勾（勾选是**声明**，不是证据）。

真正的写入要满足两条：

1. **单独一次显式写入动作**，不是「上次那条提案还在，那就顺手做了」。
2. 带上**当时看到的校验值**和**一句理由**。如果对象在这期间被别人改过，
   写入必须**失败**，而不是覆盖。

## 使用条件

- 系统里有「建议 / 待办 / 审核队列」这类中间状态时。
- 任何会把建议变成实际改动的地方。

## 不适用场景

- 用户在这次对话里明确说了「就按这个改」：那是当次授权，记一条即可，不必再要一次确认。
- 纯读取、试运行、生成预览：本来就不需要批准。

## 判断步骤

1. 写入前先问：我现在做的这件事，对应的是**哪一次**明确的同意？
2. 答不上来 → 停下来，把提案拿给人看，等一句明确的话。
3. 写入时带上校验值和理由；写入失败要**当作正常结果**报出来，不要重试到成功。
4. 批准和写入之间的上下文不能丢：批的是 A，就必须写 A。

## 失败模式

- 界面上排着一个「建议合并」，没人点，攒了几次之后被当成「已经默认同意」。
- 同一个待办出现三遍，被理解成「用户催了三次」。
- 写入不校验版本，覆盖掉别人刚做的改动。
- 批准和写入拆成两步，第二步丢掉了第一步的对象，批的是 A 写的是 B。
- 把勾选框当成证据：勾上就算做完。

## 验证证据

- 抽查任意一次写入，能指出：谁批的、批的是哪一条、提交时的校验值是多少。
- 造一次并发冲突：先记下校验值，让别人改一下对象，再提交——写入必须被拒绝，
  且提示是「对象已变化」而不是「权限不足」之类的误导信息。

## 相关资产

- `RULE-AI-WRITE-001`（补强）：那条讲 AI 只新增与更新、不静默覆盖；这条补的是
  「**什么不算确认**」这一面。
- `MTH-REFERENCE-001`（相关）：批准的对象要能被唯一指向，靠引用而不是靠描述。
- `MTH-EVIDENCE-001`（相关）：同意与否这类事实，同样只记一处。
