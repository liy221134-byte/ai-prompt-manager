---
id: RULE-PG-MIGRATION-001
title: 加约束要写成幂等迁移
asset_type: rule
rule_type: must
purpose: release
layer: data
tech_context:
  - postgres
priority: p1
scope: project
project_scale:
  - personal
  - medium
  - large
  - regulated
lifecycle_phase:
  - release
  - operate
status: candidate
confidence: hypothesis
override_allowed: false
compile_target:
  - agents
verification: manual
evidence: []
source_references:
  - Supabase 官方 Agent Skills「supabase-postgres-best-practices」1.3.0，规则文件 schema-constraints
  - seed-packs/external-sources/README.md（采集台账与来源说明）
related_assets:
  - PLAYBOOK-RELEASE-001
version: 0.1.0
last_reviewed: 2026-09-27
---

# 加约束要写成幂等迁移

## 核心结论

**Postgres 不支持 `ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS`**——这句话看着合理，
写进迁移文件就是语法错误，整个迁移失败。列和索引有 `IF NOT EXISTS`，约束**没有**。
所以加约束必须自己写成幂等的：先查系统表确认不存在，再加。

## 使用条件

- 任何加约束的迁移：`FOREIGN KEY`、`CHECK`、`UNIQUE`、`PRIMARY KEY`。
- 迁移可能被重复执行的环境（重跑、回滚后重放、多环境串跑）。

## 不适用场景

- 一次性的手工 SQL，跑完就扔，不进仓库——但那就不是迁移了。
- 迁移工具能保证「一份迁移只执行一次」且从不需要重放时，风险小；但幂等仍然是更省心的默认。

## 判断步骤

1. 加约束前先写一段存在性检查：查 `pg_constraint` 里有没有同名约束。
2. 把「检查 + 加约束」包在 `DO $$ ... $$` 块里，或用迁移工具的守卫语法。
3. 对照着记清楚：**列**用 `ADD COLUMN IF NOT EXISTS`，**索引**用 `CREATE INDEX IF NOT EXISTS`，
   **约束**只能自己判。
4. 迁移跑完用 `\d 表名` 复核约束在不在。

## 失败模式

- 直接写 `ADD CONSTRAINT IF NOT EXISTS`，迁移在第一句就语法报错。
- 只写了「加」，没写「加之前先确认没有」，重跑时报「约束已存在」。
- 加约束的同时在同一份迁移里改数据，约束校验失败导致整份回滚（约束和数据要分两步）。

## 验证证据

- 迁移文件本身：能看到存在性检查。
- 同一份迁移连跑两次都成功，且第二次不产生变化。

## 相关资产

- `PLAYBOOK-RELEASE-001`（引用）：发布顺序与回滚；这条是它「迁移那一步」里最常见的写法陷阱。
