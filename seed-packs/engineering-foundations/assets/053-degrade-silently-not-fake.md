---
id: RULE-DEGRADE-SILENT-NOT-FAKE-001
title: 能力缺失就安静降级，绝不用替代品冒充
asset_type: rule
rule_type: forbidden
purpose: development
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
  - Exomem（github.com/Artexis10/exomem）仓库说明的 Degradation modes 一节：可选能力「absent 时退化为沉默，而不是退化为替代品」
  - Exomem 仓库说明中关于校验器缺失时的约定：绝不出现「用另一种方式产出的标签」冒用原名
  - 采集台账：seed-packs/external-sources/README.md（来源 S9）
related_assets:
  - RULE-DESIGN-ASSET-001
  - RULE-EVIDENCE-BOUNDARY-001
  - RULE-CONFIDENCE-COMPILE-001
version: 0.1.0
last_reviewed: 2026-09-30
---

# 能力缺失就安静降级，绝不用替代品冒充

## 核心结论

可选能力（模型、检索方式、校验器、抽取器）缺失时，正确做法是**降级并说明**，
而不是换一个便宜的实现顶上、还挂着原来那个名字。

三条做法：

1. **缺能力 → 走降级路径**：功能仍然可用，结果照常给出来，不报错、不空转。
2. **降级路径在任何界面上都不冒用被替代者的名字**：关键词检索代替语义检索可以，
   但不能把关键词结果标成「语义搜索」；没有校验器时，审核队列里**不许**出现
   任何形似「模型判定」的标签。
3. **有一条只读的体检出口**，明确说出当前缺的是哪一层能力。

一句话口径：**缺能力是沉默，不是替代品。**

## 使用条件

- 系统有「装了更好、不装也能跑」的可选层时。
- 交付前要回答「这套东西现在到底有没有开语义检索／有没有校验」时。

## 不适用场景

- 缺的是校验、安全、数据完整性这类**红线能力**：那不属于降级，属于拒绝执行并说明原因。
- 用户明确要求「用近似实现先跑通」，且你已在交付说明里写明近似点与上限：那是显式约定，
  不算冒充。

## 判断步骤

1. 列出本系统的可选层，逐层写清「有它是什么行为、没它是什么行为」。
2. 检查每个界面与每条输出：有没有地方用了原能力的名字，实际走的是降级路径。
3. 提供一条只读体检命令，输出当前生效的层。
4. 写进交付说明：本次「省掉了什么能力」，以及省掉之后结论的边界在哪。

## 失败模式

- 校验器没装，审核队列里照样出现「模型判定过」的标签。
- 语义检索模型还没下完，界面照旧显示「语义搜索」。
- 用降级后的结果去支撑一个只有原能力才能支撑的结论。
- 把「降级」当成「可以悄悄少做一步」的借口，而不是一个需要说出来的状态。

## 验证证据

- 关掉任意一个可选层，跑一遍主流程：结果照常出，且没有任何一处冒用被替代者的名字。
- 体检输出能指名缺失的那一层。
- 交付说明里出现一句「本次省掉了什么」。

## 相关资产

- `RULE-DESIGN-ASSET-001`（同源）：那条是这条纪律在图片资产上的特例——源设计里的图片
  不许用代码近似，本质同样是「不许用替代品冒充」。
- `RULE-EVIDENCE-BOUNDARY-001`（相关）：降级之后证据能证明到哪，必须一起说清。
- `RULE-CONFIDENCE-COMPILE-001`（相关）：没验证过的规则不参与编译，和这里
  「没装的能力不要假装装了」是同一类诚实要求。
