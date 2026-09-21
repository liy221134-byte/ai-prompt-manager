---
id: CASE-MIGRATION-001
title: 迁移历史必须和仓库文件名一致
asset_type: case_note
purpose: release
layer: data
tech_context:
  - supabase
  - postgres
  - vercel
priority: p0
override_allowed: false
compile_target:
  - agents
  - readme
verification: gate
evidence:
  - docs/operations/database-migrations.md
  - docs/acceptance/week-08.md 发布记录（迁移历史曾为空，早期迁移是手工执行）
  - 提交 c8c46ff、45f0730（对齐迁移历史并验证自动迁移链路）
scope: project
project_scale:
  - personal
  - medium
  - large
lifecycle_phase:
  - release
  - operate
status: candidate
confidence: provisional
source_references:
  - docs/operations/database-migrations.md
  - docs/operations/release-rollback.md
related_assets:
  - PLAYBOOK-RELEASE-001
  - RULE-BOUNDARY-001
version: 0.2.0
last_reviewed: 2026-09-21
---

# 迁移历史必须和仓库文件名一致

## 核心结论

结构迁移、数据迁移和迁移历史必须一次对齐。手工在控制台执行的迁移如果不回写历史表，
等价于没有迁移记录，自动部署会按空历史重新执行旧迁移。

## 使用条件

- 数据库迁移改由平台自动部署时。
- 早期迁移是手工执行、历史表为空时。
- 迁移涉及权限策略改写时。

## 不适用场景

- 单人本地数据库、没有自动部署时，可以只保留文件记录。
- 不能把结论简化成"补两条记录"：历史、文件名和实际结构三者必须一致。

## 经过与根因

- 早期迁移是手工在 Supabase SQL Editor 里执行的，迁移历史表一直是空的。
- 仓库里已经有 `202609180001` 这类迁移文件，而自动部署是按历史表判断是否需要执行。
  历史为空意味着旧迁移可能被重复执行。
- 对齐历史后，顾问检查发现四条 `auth_rls_initplan` 性能告警：`prompt_versions` 的策略
  写成 `auth.uid()`，与 `prompts` 的 `(select auth.uid())` 写法不一致。
- 统一改法后重新应用并复查，告警消失。

## 改进与门禁

1. 一个迁移文件同时包含结构改动和数据迁移，并且可以重复执行。
2. 文件名与迁移历史表保持一致，按时间前缀排序。
3. 应用迁移后按清单核对：字段、索引、RLS 策略、函数和顾问检查结果。
4. 历史表没有对齐之前，不允许开启自动部署。
5. 迁移演练和回滚记录属于版本验收的一部分，不能只看"执行成功"。

## 失败模式

- 手工执行迁移但不回写历史表，自动部署时重复执行。
- 结构迁移和数据迁移拆成两次执行，中途失败留下半迁移状态。
- 只看迁移执行成功，不做顾问检查和权限策略复查。

## 验证证据

- `docs/acceptance/week-08.md` 发布记录：迁移历史已对齐为两条记录，四个函数都是
  `SECURITY INVOKER`，顾问检查没有 error，性能告警处理后清零。

## 相关资产

- `PLAYBOOK-RELEASE-001`（验证）：发布门禁需要包含迁移顺序和历史核对。
- `RULE-BOUNDARY-001`（引用）：权限策略由迁移维护，所有权变更要走同一条链路。
