---
id: RULE-NO-PERSONAL-LEAK-001
title: 交付模板里不许带个人或客户标识，用测试挡且不许加白名单
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
  - release
status: candidate
confidence: hypothesis
override_allowed: true
compile_target:
  - none
verification: test
evidence: []
source_references:
  - Exomem（github.com/Artexis10/exomem）仓库根约定文件的「编辑分发给新用户的脚手架」一节：自带测试在脚手架里发现任何个人名、产品名或库结构标签就失败，并要求泛化而不是加白名单
  - 采集台账：seed-packs/external-sources/README.md（来源 S9）
related_assets:
  - CASE-ENV-PREFIX-001
  - RULE-AI-WRITE-001
  - RULE-DESIGN-TEMPLATE-LOOK-001
version: 0.1.0
last_reviewed: 2026-09-30
---

# 交付模板里不许带个人或客户标识，用测试挡且不许加白名单

## 核心结论

凡是**会被复制到别人项目里**的内容——模板、脚手架、示例、种子资产——不得包含个人姓名、
真实客户或产品名、以及某个具体项目的目录结构标签。

这条不靠人检查，靠一条**自动化检查挡在提交前**。命中的处理方式是**把内容泛化掉**，
不是把词加进白名单。

## 使用条件

- 仓库里存在「分发给别人用」的目录时（模板库、种子包、新手脚手架）。
- 每次往这些目录里加内容之后。

## 不适用场景

- 内部专用、本来就不外发的文件。
- 项目内容里**必须**出现的产品名：判断依据是这个文件会不会被人复制走，
  不是文件里有没有出现过专有名词。

## 判断步骤

1. 圈定「会被人复制走」的目录，写进检查脚本的扫描范围。
2. 检查里维护一份**禁用词**（人名、客户名、私有库结构标签）。
3. 命中之后只有一种处置：把这个词泛化成通用说法，改内容而不是改检查。
4. 白名单是禁用的：一旦允许「这几个词可以留」，这条检查就退化成摆设。

## 失败模式

- 模板里留着上一个项目的名字，被复制进下一个项目，命名污染一路扩散。
- 检查命中了，处理方式是往白名单加一行——从此这条测试只证明「没被改坏」，
  不再证明「干净」。
- 只在文档里写『注意别泄漏』，没有机器挡：靠自觉的约定一定会漏。
- 把「示例数据」当成可以夹带真实信息的理由。

## 验证证据

- 做一次红-绿：故意在模板目录里塞进一个真实名字，检查必须变红；拿掉之后必须变绿。
- 对交付模板目录跑一次扫描：零命中。
- 检查脚本里不存在白名单式的豁免分支。

## 相关资产

- `CASE-ENV-PREFIX-001`（相关）：那次的教训是集成前缀把命名错误放大成密钥泄露风险；
  这条管的是同一类「命名带着私有信息出门」的风险。
- `RULE-AI-WRITE-001`（相关）：同属对「AI 会顺手把上下文里的东西带出去」的防线。
- `RULE-DESIGN-TEMPLATE-LOOK-001`（相关）：那条管模板的**视觉**别千篇一律，
  这条管模板的**内容**别带着出处。
