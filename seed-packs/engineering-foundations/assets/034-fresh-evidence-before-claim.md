---
id: RULE-VERIFY-002
title: 声明完成前，证据必须是这次跑出来的
asset_type: rule
rule_type: must
purpose: collaboration
layer: project
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
  - release
status: candidate
confidence: hypothesis
override_allowed: false
compile_target:
  - agents
verification: manual
evidence: []
source_references:
  - superpowers（obra/superpowers）的 verification-before-completion 技能：Iron Law、Gate Function 五步与 Rationalization Prevention 表
  - seed-packs/external-sources/README.md（采集台账与来源说明）
related_assets:
  - RULE-VERIFY-001
  - MTH-QUALITY-001
  - TPL-ACCEPT-001
version: 0.1.0
last_reviewed: 2026-09-27
---

# 声明完成前，证据必须是这次跑出来的

## 核心结论

**没有这次跑出来的证据，就不许说「完成 / 修好了 / 通过了」。** 三句硬话：

1. **先说清是哪条命令能证明这个结论，再去跑它。** 不是「我检查过了」，是「跑了
   `npm run check`，0 失败」。
2. **不能引用上一次的结果。** 这条消息里没跑过，就不能拿昨天的绿灯说今天的事——
   哪怕这次只改了一行。
3. **部分验证不算数。** 跑了一个文件 ≠ 全部通过；代码检查过了 ≠ 编译过了；
   日志看着对 ≠ 真的跑过。

## 使用条件

- 任何要说出「完成了」「修好了」「通过」的时候。
- 提交、交付、进入下一个任务之前。
- 让 AI 汇报结果时——它的「已完成」和你的证据是两回事。

## 不适用场景

- 只读的排查、看文件：没有「完成」可声明，不适用。
- 纯讨论、没产生产物时：不适用。

## 判断步骤

1. **认出结论**：接下来这句话是哪类断言——测试通过／构建成功／bug 修好／需求满足？
2. **定位命令**：哪条命令能证明它？找不到，就说明这个结论还不该说。
3. **跑完整命令**：不截断、不换小范围。
4. **读完整输出**：看退出码、数失败数，不看「看起来没问题」。
5. **对得上才说**；对不上就照实说当前状态。

## 失败模式

- 「应该没问题」「应该能过」——这几个字一出现，基本等于没跑。
- 拿上一次的检查结果说这次的事。
- 跑了类型检查就说「检查通过」，落地时没跑构建。
- 只跑了一个测试文件，说「测试全过」。
- 让 AI 汇报，它说「已修复并验证」，直接照抄进交付说明。
- 「就这一次不跑了吧」「我有信心」。

## 验证证据

- 交付说明里每条结论后面都能找到对应的命令和输出。
- 抽查一条：把命令重跑一遍，结果对得上。

## 相关资产

- `RULE-VERIFY-001`（相关）：回归测试那条，是这条在「修 bug」场景里的具体化。
- `MTH-QUALITY-001`（引用）：该跑哪几档检查由项目质量画像决定。
- `TPL-ACCEPT-001`（引用）：验收证据链是这些证据的归档位置。
