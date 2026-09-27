---
id: RULE-WORKTREE-001
title: 隔离工作区的四条硬规则
asset_type: rule
rule_type: must
purpose: collaboration
layer: project
tech_context:
  - generic
priority: p1
scope: project
project_scale:
  - large
  - regulated
lifecycle_phase:
  - build
status: candidate
confidence: hypothesis
override_allowed: true
compile_target:
  - agents
verification: manual
evidence: []
source_references:
  - superpowers（obra/superpowers）的 using-git-worktrees 技能
  - seed-packs/external-sources/README.md（采集台账与来源说明）
related_assets:
  - RULE-PARALLEL-001
  - CASE-PARALLEL-001
version: 0.1.0
last_reviewed: 2026-09-27
---

# 隔离工作区的四条硬规则

## 核心结论

并行开发要隔离工作区，这一步有四个坑，每个都真出过事：

1. **建之前先检测「是不是已经在隔离环境里」。** 对照 `git rev-parse --git-dir` 与
   `--git-common-dir`：两个路径不同就是已经在链接工作区里，**别再建一个**。
   注意子模块也会让这两个路径不同——先用 `--show-superproject-working-tree` 排除。
2. **优先用平台自带的隔离工具。** 平台没有才手工建。有原生工具却手工建，会造出
   **平台看不见也管不了的幽灵状态**：目录、分支、清理都脱离管理。
3. **工作区目录必须先被 gitignore。** 建之前确认（`git check-ignore`），没有就先加进
   `.gitignore` 并提交。漏了这一步，**整棵工作树会被提交进仓库**。
4. **建完先跑一次基线测试。** 脏基线会让之后每一次失败都说不清：是你改坏的，还是本来就这样。

## 使用条件

- 开功能分支、要和其他会话并行工作时。
- 执行一份多任务的实施计划之前。

## 不适用场景

- 单人串行、改动很小：就地做，不必为形式建工作区。
- 已经在隔离环境里：**这条正是要拦「重复建」**。

## 判断步骤

1. 先检测是否已在隔离环境；在的话跳过创建。
2. 有原生工具就用原生工具；没有才手工建。
3. 项目内目录先确认被忽略，没忽略就先补 `.gitignore`。
4. 建完跑基线测试，报告「通过多少条」而不是「应该没问题」。
5. 基线本来就是红的：报告出来，由人决定继续还是先修。

## 失败模式

- 不检测就建，套了两层工作区，改的东西不知道该提交到哪。
- 有原生工具却手工建，平台管不到这个工作区，清理时留下垃圾。
- 目录没进 gitignore，一次提交把整棵工作树塞进仓库。
- 不跑基线，后来发现「原来就有三个测试是红的」，白排查半天。

## 验证证据

- 检测命令的输出（是不是已经在隔离环境）。
- `git check-ignore` 的结果。
- 基线测试的条数与结果。

## 相关资产

- `RULE-PARALLEL-001`（引用）：决定能不能并行之后，才轮到怎么隔离。
- `CASE-PARALLEL-001`（相关）：并行出过的真实事故。
