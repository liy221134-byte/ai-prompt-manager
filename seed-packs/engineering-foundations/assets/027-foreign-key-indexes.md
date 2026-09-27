---
id: RULE-PG-FK-INDEX-001
title: 外键列必须自己建索引
asset_type: rule
rule_type: must
purpose: development
layer: data
tech_context:
  - postgres
priority: p1
scope: project
project_scale:
  - medium
  - large
  - regulated
lifecycle_phase:
  - design
  - build
status: candidate
confidence: hypothesis
override_allowed: false
compile_target:
  - agents
verification: manual
evidence: []
source_references:
  - Supabase 官方 Agent Skills「supabase-postgres-best-practices」1.3.0，规则文件 schema-foreign-key-indexes
  - seed-packs/external-sources/README.md（采集台账与来源说明）
related_assets:
  - RULE-BOUNDARY-001
  - MTH-PG-QUERY-PERF-001
version: 0.1.0
last_reviewed: 2026-09-27
---

# 外键列必须自己建索引

## 核心结论

**Postgres 不会自动给外键列建索引。** 主键和唯一约束会自动带索引，外键**只有约束、没有索引**。
没索引的外键会让 JOIN、`ON DELETE CASCADE` 和按外键列过滤的查询退化成全表扫描——
表小的时候看不出来，数据一长就是十倍到百倍的差距。

## 使用条件

- 建表时写了 `REFERENCES` 的外键。
- 已经有外键、但从没为它单独建过索引的表。

## 不适用场景

- 外键列上已经有索引，或者它本身就是某个复合索引的**第一列**。
- 表小到全表扫描比走索引还快——但补一个索引的成本也很低，「省掉」通常不划算。

## 判断步骤

1. 列出所有带外键的列。
2. 逐个查有没有索引：`\d 表名`，或查 `pg_indexes`。
3. 没有的补上：`CREATE INDEX ON 子表 (外键列);`
4. 复合索引只看第一列——外键列排在复合索引第二位以后的，等于没索引。
5. 有 `ON DELETE CASCADE` 的尤其要补：没有索引时，删主表一行会全表扫子表。

## 失败模式

- 以为「写了 REFERENCES 就有索引」，等 JOIN 变慢才发现。
- 只给主表建索引，子表的外键列漏掉。
- 复合索引 `(a, b)` 里 b 是外键，误以为 b 也被加速了——这个索引只对 a 有用。

## 验证证据

- `pg_indexes` 的查询结果，逐个外键列都能对上一条索引。
- 迁移文件里能看到对应的 `CREATE INDEX`。

## 相关资产

- `RULE-BOUNDARY-001`（引用）：数据归谁所有；这条讲外键怎么建，两者不同层。
- `MTH-PG-QUERY-PERF-001`（引用）：查得慢先看有没有索引，这条是其中最常见的一处。
