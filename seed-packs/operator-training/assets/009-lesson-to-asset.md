---
id: OPS-SINK-001
title: 踩坑→规则：把一次教训变成资产
asset_type: method
audience: human
module: M7-沉淀
difficulty: L2
purpose: collaboration
layer: project
scope: global
project_scale:
  - personal
  - medium
tech_context:
  - generic
lifecycle_phase:
  - operate
priority: p1
override_allowed: true
compile_target:
  - none
verification: manual
evidence:
  - docs/pending-items.md（规则命中记录：一条规则被违反两次以上才允许改规则文件）
  - docs/acceptance/v2.11.0.md（演练发现三处问题，直接修进代码和运维文档）
status: candidate
confidence: provisional
source_references:
  - 本项目 AGENTS.md 的"一个版本、一份文档、三道门"与规则维护约定
  - 12-Factor Agents：Own your prompts（提示词和规则当资产管起来）
related_assets:
  - OPS-DEBUG-001
  - OPS-SESSION-001
version: 0.1.0
last_reviewed: 2026-09-24
---

# 踩坑→规则：把一次教训变成资产

## 核心结论

每次踩坑、返工、超支之后问三句：**这是哪一类问题、下次怎么提前发现、写进哪份文档**。
教训不落成资产，下个项目还会再踩一遍。

## 使用条件

- 事故、返工、明显超支之后。
- 一次演练或验收发现了"原来会这样"的问题之后。

## 不适用场景

- 一次性的环境问题（记一句备忘就够，不用立规则）。
- 还没弄明白根因的问题：先查清楚，再决定沉淀成什么。

## 三句 + 三个去向

| 问自己 | 去向 |
| --- | --- |
| 这是哪一类问题？ | 规则（项目规则文档或规则资产） |
| 下次怎么提前发现？ | 检查（自动化测试、发布门禁、清单） |
| 写进哪份文档？ | 文档（运维手册、FAQ、验收清单） |

两条纪律：

1. **先记录、后立规**：同一条规则被违反两次以上，才动规则文件；一次异常只记录。
2. **改规则要同时说明删了或并了哪条**：规则只增不减，最后没人会读。

## 失败模式

- 修完就忘，教训只留在聊天记录里。
- 每遇到一次小问题就加一条规则，规则文件越写越厚。
- 只改代码、不补检查，同类问题下次照样发生。

## 验证证据

- 规则命中记录（违反了几次、改了什么）。
- 新增的检查或测试，以及它挡住过的一次真实问题。

## 相关资产

- `OPS-DEBUG-001`（引用）：先有根因结论，才谈得上沉淀。
- `OPS-SESSION-001`（相关）：换对话之前，把这次学到的东西落下来。
- `MTH-QUALITY-001`（引用）：能变成门禁的教训优先变成门禁。
