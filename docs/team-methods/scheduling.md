---
id: MTH-TEAM-SCHEDULE-001
title: 排期与估计：把工作拆到可承诺
asset_type: method
purpose: development
layer: project
scope: global
project_scale:
  - personal
  - medium
  - large
  - regulated
tech_context:
  - generic
lifecycle_phase:
  - build
status: candidate
confidence: hypothesis
override_allowed: true
compile_target:
  - none
verification: manual
evidence: []
source_references:
  - 产品经理方法技能（外部来源采集 S7 的 7 个团队管理方法之一，台账见 seed-packs/external-sources/README.md 第六节的 S7 行）
  - 通用软件估算实践（三点估计 / 宽 Band 规划）
related_assets:
  - MTH-TEAM-ROADMAP-001
  - MTH-SCOPE-001
version: 0.1.0
last_reviewed: 2026-09-29
---

# 排期与估计：把工作拆到可承诺

## 核心结论

估计靠「拆小 + 历史参照」，不靠拍脑袋；承诺用范围（乐观 / 最可能 / 悲观）而非单点数字。

## 使用条件

- 版本进入实现前。
- 需要给干系人交付预期时。

## 不适用场景

- 探索性研究——先 spike（技术探针）再估。

## 执行方法

1. 任务拆到 0.5–3 天可完成；超过则继续拆。
2. 三点估计：乐观 a、最可能 m、悲观 b；期望 ≈ (a + 4m + b) / 6，缓冲 ≈ (b − a) / 6。
3. 参照历史同类任务的实际耗时，不凭印象。
4. 识别关键路径与并行空间；依赖方先排。
5. 留 20–30% 缓冲给返工与未预见项。

## 失败模式

- 单点乐观估计，承诺即失信。
- 把估计当承诺压给团队。
- 不记录实际耗时，下次还是不会估。

## 验证证据

- 版本结束有「估计 vs 实际」对照。
- 下一次估计明显更准。

## 相关资产

- `MTH-TEAM-ROADMAP-001`（路线图标出主题，排期落地）。
- `MTH-SCOPE-001`（一个版本只做一个子系统，缩小排期范围）。
