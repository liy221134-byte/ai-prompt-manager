---
id: MTH-REFERENCE-001
title: 引用优先于复制
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
  - design
  - build
  - operate
status: candidate
confidence: provisional
override_allowed: true
compile_target:
  - agents
verification: manual
evidence:
  - docs/acceptance/v2.18.0.md（本项目把 4 条复制来的规则改成 28 条引用：改公共库一处，所有引用它的项目跟着变）
  - docs/superpowers/specs/2026-09-24-v2.18.0-rule-reference-design.md
source_references:
  - docs/project-lifecycle-gaps.md
  - docs/pending-items.md
related_assets:
  - MTH-ASSET-LAYER-001
  - MTH-SINK-001
  - MTH-EVIDENCE-001
version: 0.1.0
last_reviewed: 2026-09-24
---

# 引用优先于复制

## 核心结论

同一份内容需要出现在多个地方时，**留一个来源，其他位置只引用它**；复制只在"这份要脱钩、
之后自己改"时才做，而且要明确记下是什么时候脱的钩。复制一次就是两个真相，两边迟早不一致，
而维护者永远不知道该信哪一份——这和 `MTH-EVIDENCE-001`「证据只记一处」是同一条道理的另一面。

## 使用条件

- 公共方法库（规则、模板、清单）与多个项目之间。
- 同一份清单要被多个版本、多个环境引用时。

## 不适用场景

- **需要按项目改写**的内容：先复制再改是合理的，但要在复制的那一刻就把「这份是项目专属」记下来
  （去掉来源标记），别让它继续挂着"来自公共库"的名头。
- 一次性产物（编译结果、导出文件）：它们是快照，本来就该独立存在。
- 无法建立引用关系的场合（纸质清单、外部系统里的字段）：复制可以接受，但要写清唯一的正本在哪。

## 判断步骤

1. 问一句：这份内容**换项目还成立吗**？
   - 成立 → 它属于公共层，项目里只放引用（见 `MTH-ASSET-LAYER-001`）。
   - 只对这一次成立 → 它是项目实例，本来就不用跨项目复用。
2. 再问：这个项目**需要改它吗**？
   - 不需要 → 引用，公共层改一处，所有引用它的地方跟着变。
   - 需要 → 复制一份并脱钩，同时写清"为什么这个项目和公共那份不一样"。
3. 最后确认：有没有第三条路——**向上修改**（把公共那份改成大家都要的样子）？
   大多数"想复制"的冲动，其实是公共那份该更新了。

## 失败模式

- 复制之后两边各自被人改，出现两个版本，谁也不知道哪个是当前有效的。
- 复制了一大堆，公共那份更新了没有人拉取，项目里继续用旧口径。
- 复制时保留了"来自公共库"的来源标记，看的人以为改公共库就能生效。
- 用复制来规避"改公共库会影响别人"的顾虑，结果问题被复制了 N 份。

## 验证证据

- 公共资产库里点名某个项目的条目数量（越接近 0 越好）。
- 项目里那份副本与公共库正本是否重复显示（重复说明引用没打通）。
- 公共库改一处之后，引用它的项目是否立刻看到变化。

## 相关资产

- `MTH-ASSET-LAYER-001`（引用）：先分层，再决定哪层是正本。
- `MTH-SINK-001`（引用）：沉淀往哪边去，决定谁是正本。
- `MTH-EVIDENCE-001`（引用）：同一条纪律在文档上的说法。
