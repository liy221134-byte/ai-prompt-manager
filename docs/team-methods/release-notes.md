---
id: MTH-TEAM-RELEASENOTE-001
title: 发布说明：对用户说清这次变了什么
asset_type: method
purpose: collaboration
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
  - release
status: candidate
confidence: hypothesis
override_allowed: true
compile_target:
  - none
verification: manual
evidence: []
source_references:
  - 产品经理方法技能（外部来源采集 S7 的 7 个团队管理方法之一，台账见 seed-packs/external-sources/README.md 第六节的 S7 行）
  - 通用变更日志（Changelog）实践
related_assets:
  - PLAYBOOK-RELEASE-001
  - MTH-TEAM-ROADMAP-001
version: 0.1.0
last_reviewed: 2026-09-29
---

# 发布说明：对用户说清这次变了什么

## 核心结论

每次发布用用户视角的变更说明（新增 / 改进 / 修复 / 已知问题），让使用者不必读代码就知道影响。

## 使用条件

- 对外发布、内部版本上线。

## 不适用场景

- 纯内部重构且无外部可见变化——可简述，不必四分类。

## 执行方法

1. 按「新增 / 改进 / 修复 / 已知问题」四分类。
2. 每条用用户语言：做了什么、对我有什么用，不写技术实现。
3. 关联版本号与日期；重大变更单独标注。
4. 已知问题诚实列明，附临时规避或修复计划。
5. 链接到详细文档 / 验收记录，供深究者点开。

## 失败模式

- 写成 git commit 列表，用户看不懂。
- 只列修复不提已知问题，信任受损。
- 语气过于技术化。

## 验证证据

- 用户能凭说明判断「要不要更新 / 影响什么」。
- 重大变更有显眼提示。

## 相关资产

- `PLAYBOOK-RELEASE-001`（发布、回滚与恢复流程）。
- `MTH-TEAM-ROADMAP-001`（发布内容对应路线图上的主题）。
