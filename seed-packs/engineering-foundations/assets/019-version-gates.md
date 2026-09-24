---
id: MTH-GATES-001
title: 一个版本的三道门：需求门、设计门、交付门
asset_type: playbook
purpose: development
layer: project
tech_context:
  - generic
priority: p0
scope: global
project_scale:
  - personal
  - medium
  - large
lifecycle_phase:
  - analysis
  - design
  - build
status: candidate
confidence: provisional
override_allowed: true
compile_target:
  - agents
  - start_prompt
verification: manual
evidence:
  - AGENTS.md（三道门是项目唯一的规则来源，日常开发只读它）
  - docs/acceptance/（v2.12.0 至 v2.16.0 每版都是先出设计文档、再开发、再逐条对照验收）
  - docs/pending-items.md（规则命中记录：同一条规则被违反两次以上才允许改规则文件）
source_references:
  - docs/development-rules.md
  - docs/superpowers/specs/2026-09-24-v2.15.0-kickoff-pack-design.md
  - docs/project-lifecycle-gaps.md
related_assets:
  - MTH-REQ-001
  - MTH-QUALITY-001
  - MTH-DESIGN-DOC-001
version: 0.1.0
last_reviewed: 2026-09-24
---

# 一个版本的三道门：需求门、设计门、交付门

## 核心结论

每个版本按三道门走：**需求门**（需求说不清就先谈，不写代码）、**设计门**（会留长期痕迹的改动
先出《设计 + 任务清单》等确认）、**交付门**（先写测试再实现，跑完检查，逐条对照验收标准）。
门的价值不是审批，而是**在"现在该停下来说话"的那一刻停住**，把靠脑补的地方补成文字。

## 使用条件

- 由人提需求、AI 执行的开发方式。
- 任何要合并进主干的功能、修复、数据变更和发布。

## 不适用场景

- 界面、文案、样式的局部调整，以及已有测试覆盖的重构：不必过设计门，动手前用自然语言说清
  改什么、为什么改、影响哪些文件和功能就够了。
- 一次性探索脚本：可以跳过设计门，但结论要落回文档，否则下次还得重来一遍。

## 三道门的判定表

| 门 | 什么时候必须停 | 停下来的产物 | 谁拍板 |
| --- | --- | --- | --- |
| 需求门 | 需求模糊、涉及新方向、存在多种做法 | 一次对话，把目标、边界、成功标准说清 | 产品负责人 |
| 设计门 | 数据表／字段／迁移／回滚语义；对外约定（接口输入输出、优化与合并规则、鉴权与数据隔离）；外部依赖、外部服务或持续成本 | 《设计 + 任务清单》四块内容 | 产品负责人 |
| 交付门 | 每次交付 | 自动化检查结果、逐条验收对照、未完成事项与风险 | 产品负责人 |

写设计文档的边界：**只写决定，不写实现过程**，不写成段 SQL 和代码，不写自检章节和覆盖率
对照表——正确性由验收保证，不由文档自己声明。

## 失败模式

- 需求还模糊就开始写代码，做完发现方向不对，返工成本最高。
- 设计文档写成实现说明书：写了一大篇，人还是不知道"这次到底做什么、不做什么"。
- 设计门只在"数据结构变更"时才走，忽略了"改变对外约定"这一类。
- 交付时只说"应该没问题"，没有真实跑过的检查结果。
- 交付后不逐条对照验收标准，实现和设计悄悄分叉。

## 验证证据

- 设计文档：每版 `docs/superpowers/specs/` 下的一份《设计 + 任务清单》。
- 验收清单：`docs/acceptance/` 下逐条签署的记录。
- 检查记录：交付说明里的实际命令与结果。

## 相关资产

- `MTH-DESIGN-DOC-001`（引用）：设计门具体该写哪四块内容。
- `MTH-REQ-001`（引用）：需求门里怎么澄清边界与外部依赖。
- `MTH-QUALITY-001`（引用）：交付门跑哪几档检查由项目质量画像决定。
- `TPL-ACCEPT-001`（引用）：交付门的证据链结构。
