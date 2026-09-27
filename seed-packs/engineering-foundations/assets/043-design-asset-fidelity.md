---
id: RULE-DESIGN-ASSET-001
title: 源设计里的图片资产不许用代码近似
asset_type: rule
rule_type: forbidden
purpose: development
layer: file
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
  - build
status: candidate
confidence: hypothesis
override_allowed: false
compile_target:
  - agents
verification: manual
evidence: []
source_references:
  - product-design 的 design-qa 技能：素材保真那一条（不许用代码画替画面资产）
  - seed-packs/external-sources/README.md（采集台账与来源说明）
related_assets:
  - RULE-DESIGN-QA-001
  - MTH-TECH-001
version: 0.1.0
last_reviewed: 2026-09-27
---

# 源设计里的图片资产不许用代码近似

## 核心结论

设计稿里出现的 **logo、插画、装饰图形、产品图、非标准图标**，实现时必须**用那份素材本身**。
**不许**用这些替代：

- 内联 SVG / 手写的 SVG 路径
- `div`、`span` 拼出来的形状
- CSS 画的圆角块、渐变、阴影充当图形
- emoji、文字符号、Unicode 图形
- 灰块、占位方块、「以后再补」

判断标准很直白：**照设计稿对比时，这一处对不对得上**。对不上就是不合格，不是「风格接近」。

为什么要单独立一条：**AI 最容易在这里偷工**。它能把布局、间距做得像，但遇到图形资产会
顺手用代码画一个近似品，而这一处的失真在整体上看不出来、在细节上一眼看穿。

## 使用条件

- 照着设计稿实现界面时，稿里有位图或矢量素材。
- 验收时走「图片与素材质量」那一面。

## 不适用场景

- 项目本来就没有素材，风格是纯代码建的（例如只用系统图标库）——那不算近似，是另一种选择。
- 设计稿本身就只给了占位稿，明确说了素材后补。

## 判断步骤

1. 过一遍设计稿，**列出所有图片类资产**（logo、插画、装饰、产品图、非标准图标）。
2. 逐个确认实现里用的是原始素材，不是代码画的替身。
3. 拿不准的做局部对比：源图裁一块，实现裁同一块，并排看。
4. 对不上的，要么换成真素材，要么回去问设计：这块能不能简化。

## 失败模式

- logo 用文字 + CSS 变形凑一个「差不多的」。
- 插画用几个圆角矩形拼出来，远看像、近看全是破绽。
- 图标库没有对应图标，就自己画一个形状接近的。
- 图片位置放个灰块写「待补」，然后当成做完了。
- 交付时说「这些图后面会换真素材」，但没人记得。

## 验证证据

- 素材清单：设计稿里每个图片资产 → 实现里用的是哪个文件。
- 局部对比图：源图与实现同一区域并排。

## 相关资产

- `RULE-DESIGN-QA-001`（引用）：这条是那个验收里「图片与素材质量」那一面的硬要求。
- `MTH-TECH-001`（相关）：素材怎么进仓库、走不走 CDN，属于技术选型里的实现方式。
