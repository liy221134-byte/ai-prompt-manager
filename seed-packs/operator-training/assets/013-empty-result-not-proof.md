---
id: OPS-EMPTY-001
title: 搜不到不等于不存在：让 AI 换词再搜一遍
asset_type: method
audience: human
module: M4-验收
difficulty: L1
purpose: analysis
layer: project
tech_context:
  - generic
lifecycle_phase:
  - build
priority: p1
scope: global
project_scale:
  - personal
  - medium
  - large
  - regulated
override_allowed: true
compile_target:
  - none
verification: manual
evidence: []
status: candidate
confidence: hypothesis
source_references:
  - Exomem（github.com/Artexis10/exomem）的助手使用指南：空结果只意味着「用那个查询和范围没找到」，不是「这个东西不存在」，要先换同义词、相邻词、单复数或放宽范围
  - Exomem 的助手使用指南：解释信息只用来检查排序，排序指标不是置信度
  - 采集台账：seed-packs/external-sources/README.md（来源 S9）
related_assets:
  - OPS-ACCEPT-001
  - OPS-ACCEPT-002
version: 0.3.0
last_reviewed: 2026-09-30
---

# 搜不到不等于不存在：让 AI 换词再搜一遍

## 核心结论

AI 说「没有找到」时，它真正说的是**「用这个查询、在这个范围里没找到」**。
这不是「不存在」的证明。

正确的下一步不是接受结论，而是让它**换三种方式再搜一遍**：

1. 换词：同义词、相邻概念；
2. 换形态：单数／复数、中英文、全称／简称；
3. 换范围：放宽目录、放宽时间、去掉过滤条件。

三种都空，才能说「按目前能找到的材料，没有」——并且要说清找过哪些词。

## 使用条件

- AI 说「没有相关文档」「没有这条记录」「这个功能没实现」。
- 你在验收一件「应该不存在的东西是不是真的不存在」。

## 不适用场景

- 检索范围本身就是确定且完整的（例如「这个文件里有没有这一行」）。
- 你要的答案是**它现在拿着什么**，不是**库里有什么**：那问它原文，不给它搜。

## 判断步骤

1. 听到「没找到」，先问一句：**你搜的是什么词？在哪个范围搜的？**
2. 让它换同义词／相邻词再搜一次。
3. 还空 → 放宽范围（跨目录、跨项目、跨时间）再搜一次。
4. 三次都空 → 接受结论，但要求它写清「搜过哪些词、范围是哪、仍然是空」。
5. 排序分数只能用来解释「为什么这条排前面」，**不能当作可靠程度**。

## 失败模式

- 把一次空结果当成结论，据此决定「重做一个已经有了的东西」。
- 只换一次说法就放弃——同义词往往差一个词就命中。
- 把搜索排序分当成「可信度」，按分数高低判断结论真假。
- 承认找不到，但不记录找过什么，下次又从零开始。

## 验证证据

- 抽查一次「没找到」的结论：能列出搜过的词与范围。
- 故意用一个偏门的词问一件确实存在的事，看它会不会换词找到。
- 结论里出现「按目前能找到的材料」这类限定语，而不是「不存在」。

## 相关资产

- `OPS-ACCEPT-001`（引用）：验收时同样要区分「没看到」和「没有」。
- `OPS-ACCEPT-002`（引用）：让 AI 先自测——自测里也该包含换词再搜这一条。
- `RULE-EVIDENCE-BOUNDARY-001`（引用）：证据能证明什么、不能证明什么，这条是它在检索上的实例。
