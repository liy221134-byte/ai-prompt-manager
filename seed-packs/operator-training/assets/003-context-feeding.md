---
id: OPS-CONTEXT-001
title: 给 AI 有效上下文
asset_type: method
audience: human
module: M2-派活
difficulty: L1
purpose: collaboration
layer: project
scope: global
project_scale:
  - personal
  - medium
tech_context:
  - generic
lifecycle_phase:
  - build
priority: p1
override_allowed: true
compile_target:
  - none
verification: manual
evidence:
  - docs/INDEX.md（开工先读索引和项目规则，再按任务读文档）
  - docs/engineering-map.md（改代码前先定位文件，不整篇读大文件）
status: candidate
confidence: provisional
source_references:
  - 12-Factor Agents：Own your context window（上下文要自己掌控，不是越多越好）
  - 本项目"开工先读文档"的固定顺序与工程地图
related_assets:
  - OPS-DEBUG-001
  - OPS-TASK-001
version: 0.2.0
last_reviewed: 2026-09-24
---

# 给 AI 有效上下文

## 核心结论

上下文不是越多越好，而是**和这次任务对得上**。优先给项目自己的文档和真实现象，
不要让 AI 去猜项目结构，也不要塞一整段无关聊天记录。

## 使用条件

- 每次开工（新任务、新版本）。
- 每次报 bug、每次要求返工。

## 不适用场景

- 一次性的问答、查资料。
- 项目规则文档已经完全覆盖的常规小改动（让它先读规则即可）。

## 该给什么

| 给什么 | 具体内容 | 为什么 |
| --- | --- | --- |
| 项目规则 | 项目根目录的规则文档、文档索引 | 让它按项目习惯做事，不自己发明流程 |
| 相关文档 | 这次任务的设计、验收、运维文档 | 决策和边界已经在文档里 |
| 真实现象 | 报错原文、截图、复现步骤、数据样本 | 现象比描述准，避免它猜 |
| 明确边界 | 不要动什么、不要引入什么 | 防止顺手重构、顺手加依赖 |

不要给：整篇历史聊天记录、无关模块的代码、别人项目的规范（除非你确认要照搬）。

## 失败模式

- 贴一大段无关内容，把真正的问题淹掉。
- 只说"不行"，不给现象、不给复现步骤。
- 让 AI 自己猜项目结构，它猜错了你还得收拾。

## 验证证据

- 交付说明里的"改了哪些文件、如何验证"——说明它确实读了项目文档。
- 报 bug 时的复现记录。

## 相关资产

- `OPS-DEBUG-001`（引用）：报 bug 的上下文怎么给，那条讲得更细。
- `MTH-DELIVERY-001`（引用）：端到端最小链路是给上下文的最好素材。
