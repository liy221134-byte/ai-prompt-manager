---
id: MTH-SINK-001
title: 沉淀分流：通用升公共，点名项目留项目
asset_type: method
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
lifecycle_phase:
  - build
  - operate
status: candidate
confidence: provisional
override_allowed: true
compile_target:
  - agents
verification: manual
evidence:
  - docs/acceptance/v2.14.0.md（提升为公共资产：公共库多一份副本、两边记"同源"、项目那份不动）
  - docs/acceptance/v2.16.0.md（分流建议：讲通用约束的→建议升，点名项目/带版本号/带本机路径的→建议留）
  - CHANGELOG.md（v2.14.0 与 v2.16.0 两条沉淀链路的边界说明）
source_references:
  - docs/project-lifecycle-gaps.md
  - docs/superpowers/specs/2026-09-24-v2.14.0-sediment-flowback-design.md
related_assets:
  - MTH-ASSET-LAYER-001
  - MTH-EVIDENCE-001
  - MTH-GATES-001
version: 0.1.0
last_reviewed: 2026-09-24
---

# 沉淀分流：通用升公共，点名项目留项目

## 核心结论

项目里攒下来的东西要定期分流：**讲通用约束的升到公共库，点名了本项目/版本号/本机路径的留在
项目里**。分流只给建议和理由，搬不搬要人点一下；提升是**复制**，项目里那份保持不动，两边各记
一条同源关系。

## 使用条件

- 开新项目之前，先把上一个项目积累的规则、模板、方法升到公共库。
- 项目里同一条规则在两个项目各自改过一次之后。

## 不适用场景

- 一次性脚本、临时演练记录：不进公共库。
- 还没被第二个项目验证过的经验：留在项目里，等复用第二次再升。
- 提示词这类账号级资产：本来就在公共层维护，不参与提升。

## 判断口诀与动作

| 信号 | 判断 | 动作 |
| --- | --- | --- |
| 出现"必须／禁止／一律／统一／任何项目" | 通用约束 | 建议升公共 |
| 只有一条规则、换项目还成立 | 方法 | 建议升公共 |
| 正文点名了本项目名称 | 项目专属 | 留在项目 |
| 带版本号（v2.x）、带本机绝对路径 | 项目专属 | 留在项目 |
| 看不出通用性 | 不确定 | 先留项目，复用第二次再升 |

配套动作：升的时候在两边记"同源"；公共库那份改过之后，打开项目那份能看到"上游改过"的提示，
拉取是**显式动作**（拉完产生新版本，旧正文留在历史里），不自动覆盖。

## 失败模式

- 项目里改过的规则不升公共，下个项目从旧版本重新踩一遍。
- 把带着本项目名称和路径的规则升到公共库，别的项目装进去全是噪音。
- 两边同时改、又想让它们自动合并，最后谁也不知道哪份是对的。
- 提升时原地改写项目那份，项目里丢了本项目的口径。

## 验证证据

- 公共资产库里凡点名项目的条目数量（应当为 0）。
- 项目详情里的"同源"关系与上游更新时间提示。
- 提升动作是否只新增、不删除（旧内容仍在版本记录里）。

## 相关资产

- `MTH-ASSET-LAYER-001`（引用）：先分层，再决定往哪边沉淀。
- `MTH-EVIDENCE-001`（引用）：沉淀后的结论只记一处。
- `MTH-GATES-001`（引用）：提升属于会改变公共约定的动作，走设计门。
