---
id: MTH-ASSET-LAYER-001
title: 资产分三层：方法参考、项目实例、可复用骨架
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
  - analysis
  - build
  - operate
status: candidate
confidence: provisional
override_allowed: true
compile_target:
  - agents
verification: manual
evidence:
  - docs/acceptance/v2.13.0.md（把 5 条"文档类型=模板"的资产归位成真正的模板，解决"文档和模板像在维护同一批内容"）
  - docs/database-schema.md（参考文档、项目文档、模板在库里是三类资产，不是同一个页签）
  - docs/user-map.md（"参考文档"页签只放方法级参考，项目文档才是"这次做的事"）
source_references:
  - docs/requirements-v2.md
  - docs/operations/database-migrations.md
related_assets:
  - MTH-SINK-001
  - MTH-GATES-001
  - TPL-TECH-001
version: 0.1.0
last_reviewed: 2026-09-24
---

# 资产分三层：方法参考、项目实例、可复用骨架

## 核心结论

沉淀物必须分清三层，混在一起就会出现"两份内容在维护同一件事"：

1. **方法参考**（跨项目复用）：怎么做、什么条件下适用、失败模式——画像、案例、方法说明。
2. **项目实例**（只对当前项目成立）：这次的需求、这次的实现规格、这次的验收记录。
3. **可复用骨架**（换项目还能用，但要填变量）：模板、清单、提示词。

同一份内容只能属于一层。判断口诀：**"换了项目还成立吗"**——成立就是方法参考，"换项目就
不成立"是项目实例，"换个项目还能当起点但要重填"是可复用骨架。

## 使用条件

- 公共资产库和项目资产库开始出现同名或高度相似内容时。
- 把项目里的产物"升"到公共库之前。

## 不适用场景

- 一次性的临时文件、演练记录：归到项目实例里就行，不用分三层。
- 只有一份、还没被第二个项目用过的经验：先留在项目里（见 `MTH-SINK-001`）。

## 怎么判断

| 问题 | 答案 | 归到哪一层 |
| --- | --- | --- |
| 换项目还成立吗 | 成立 | 方法参考 |
| 换个项目能当起点、但要重填吗 | 能 | 可复用骨架 |
| 只对这一次成立吗 | 是 | 项目实例 |

三层同时出现的典型症状：同一个标题在库里有两份，一份在公共库、一份在项目里，改了一处另一处
不知道——这时应该确定哪一份是正的，另一边改成同源引用。

## 失败模式

- 把项目实例当成通用方法升到公共库，公共库被一次性的细节污染。
- 把方法参考当成项目文档，改方法等于改这个项目的承诺。
- 模板里写进某个项目的具体数据，换项目时带着旧事实一起搬走。

## 验证证据

- 公共资产库里是否存在点名某个项目的条目。
- 项目资产的标题是否和公共库重复且内容雷同。

## 相关资产

- `MTH-SINK-001`（引用）：三层分完之后，往哪边沉淀。
- `TPL-TECH-001`（引用）：技术档案是典型的项目实例，不是模板正文。
- `MTH-GATES-001`（引用）：归层判断属于设计门的一部分。
