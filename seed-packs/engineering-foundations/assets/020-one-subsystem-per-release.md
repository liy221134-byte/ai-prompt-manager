---
id: MTH-SCOPE-001
title: 一个版本只做一个子系统
asset_type: method
purpose: development
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
status: candidate
confidence: provisional
override_allowed: true
compile_target:
  - agents
verification: manual
evidence:
  - docs/acceptance/（v2.2.0 至 v2.16.0 每版一个主题，版本号与子系统一一对应）
  - CHANGELOG.md（每版开头一句话说清这一版解决什么，不混第二个主题）
  - AGENTS.md（"一个版本只做一个子系统；需要同时改数据和界面、或涉及多条链路时，拆成两次发布"）
source_references:
  - docs/v2-plan.md
  - docs/roadmap.md
related_assets:
  - MTH-ROUTE-001
  - MTH-GATES-001
  - MTH-MODULE-001
version: 0.1.0
last_reviewed: 2026-09-24
---

# 一个版本只做一个子系统

## 核心结论

一个版本只解决**一个**子系统的问题，并且能用一句话说清"这一版解决什么"。需要同时改数据和
界面、或者一次牵动多条链路时，拆成两次发布。拆版本的成本，远低于一版混装之后无法判断
"是哪一处改动坏了什么"的成本。

## 使用条件

- 单人主导、AI 执行的持续迭代项目。
- 每版都要给出验收清单、版本号和变更记录的项目。

## 不适用场景

- 修一个 bug 顺带补测试：属于同一个目标，不用拆。
- 纯文档整理：不产生运行时行为变化，可以合并处理。

## 怎么切版本

1. 先写这一版的一句话主题（写在变更记录开头）。
2. 把候选改动按"改的是哪一层"分组：数据层、服务层、界面层。
3. 同一版里只留一个主题；次要主题写进待排期清单，不进本版范围。
4. 一次提交只处理一个清晰目标，提交信息用 `feat:`、`fix:`、`docs:`、`test:`、`chore:` 前缀。
5. 版本做完先签验收清单，再开下一个版本；有未签项先补验收，不开新功能。

## 失败模式

- 一版里塞三个主题，出问题时只能整版回滚，连带回滚掉已经好的改动。
- 为了"顺手"，把重构和新功能放同一次提交，diff 里看不出真正的行为变化。
- 上一个版本还没验收就开新版本，未验收的改动在下一版里被当成既有事实。

## 验证证据

- 变更记录里每版的一句话主题。
- 提交历史里同一版内的提交是否都指向这一个目标。
- 验收清单的签署记录（签完才开新版本）。

## 相关资产

- `MTH-GATES-001`（引用）：需求门外还需要版本边界。
- `MTH-ROUTE-001`（引用）：不确定性高时先做最小链路，再谈拆分。
- `MTH-MODULE-001`（引用）：模块按业务能力拆，版本按子系统拆，两者不要混。
