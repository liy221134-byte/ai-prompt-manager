---
id: MTH-DESIGN-GATE-001
title: 动手设计前先过一道澄清门
asset_type: method
purpose: analysis
layer: project
tech_context:
  - generic
priority: p1
scope: project
project_scale:
  - personal
  - medium
  - large
  - regulated
lifecycle_phase:
  - analysis
  - design
status: candidate
confidence: hypothesis
override_allowed: true
compile_target:
  - agents
verification: manual
evidence: []
source_references:
  - product-design 的 get-context 技能：设计前的 briefing 门与 playback
  - seed-packs/external-sources/README.md（采集台账与来源说明）
related_assets:
  - MTH-REQ-001
  - RULE-DESIGN-QA-001
version: 0.1.0
last_reviewed: 2026-09-27
---

# 动手设计前先过一道澄清门

## 核心结论

开始画界面或搭原型之前，先把三件事问清：

1. **设计的是什么**——哪个产品、哪个功能、哪个页面或哪一块组件。
2. **它要帮用户做成什么**——用一句话说清预期结果。
3. **目标是哪种形态**——网站、桌面应用还是移动应用（从视觉稿或需求里看不出来时才问）。

规则是：**已经答过的不重复问**。三件都清楚时，**把理解复述一遍就往下走**——
复述是同步认知，**不是求批准**，人可以随时纠正风格、范围或交互。

**硬边界：设计目标和预期结果还缺着的时候，不许动手实现界面、不许搭脚手架、不许起服务。**

## 使用条件

- 要设计、重做、扩展或生成产品界面时。
- 拿着一个模糊的想法开始动手之前。

## 不适用场景

- 纯实现任务，设计已经定了（例如照着已有 Figma 稿写代码）。
- 局部的文案、间距、图标调整。

## 判断步骤

1. 先扫一遍：三件事里有几件是明确的？
2. 缺的才问，一次问完，不挤牙膏。
3. 都清楚了：用一段话复述「设计什么 + 给谁 + 要做成什么 + 我接下来做什么」。
4. 复述完继续走，不等确认。
5. 只有「目标或预期结果还缺着」这一种情况必须停住不动手。

## 失败模式

- 需求还糊着就开画，画完发现画的不是人家要的。
- 反着来：把已经答过的问题又问一遍，浪费人的时间。
- 把复述当成请示批准，每轮都停下来等人点头。
- 「先随便画两版」——没有目标的两版，等于两次返工。

## 验证证据

- 那段复述本身：设计什么、给谁、要做成什么。
- 设计稿和这段复述对得上。

## 相关资产

- `MTH-REQ-001`（相关）：那条澄清的是业务需求；这条澄清的是界面目标和形态，是它的下游。
- `RULE-DESIGN-QA-001`（引用）：澄清完之后，实现要按源设计对比验收。
