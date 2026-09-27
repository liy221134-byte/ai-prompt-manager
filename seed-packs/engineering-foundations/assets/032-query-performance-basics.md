---
id: MTH-PG-QUERY-PERF-001
title: 查得慢先看两处：有没有索引、是不是 N+1
asset_type: method
purpose: development
layer: data
tech_context:
  - postgres
priority: p2
scope: project
project_scale:
  - medium
  - large
  - regulated
lifecycle_phase:
  - build
  - operate
status: candidate
confidence: hypothesis
override_allowed: true
compile_target:
  - agents
verification: manual
evidence: []
source_references:
  - Supabase 官方 Agent Skills「supabase-postgres-best-practices」1.3.0，规则文件 query-missing-indexes
  - 同来源，规则文件 data-n-plus-one
  - seed-packs/external-sources/README.md（采集台账与来源说明）
related_assets:
  - PLAYBOOK-DEBUG-001
  - RULE-PG-FK-INDEX-001
version: 0.1.0
last_reviewed: 2026-09-27
---

# 查得慢先看两处：有没有索引、是不是 N+1

## 核心结论

数据库查询变慢，绝大多数落在两处：

1. **过滤、排序、JOIN 的列没有索引**——退化成全表扫描，数据越长越慢。
2. **在循环里一条条查（N+1）**——一次请求发出去几十上百条 SQL，每条都不慢，加起来才慢。

先量再改：别凭感觉加缓存。性能问题的第一步永远是拿到真实的执行数据和真实的 SQL 条数。

## 使用条件

- 接口或页面变慢，怀疑在数据库这一层。
- 刚上线一个新查询，想先确认它不会成为以后的坑。

## 不适用场景

- 数据量还小（几百行以内）时，这两条都不是瓶颈，先别急着建索引。
- 慢在外部服务或网络时，先看链路的哪一段慢，别一头扎进 SQL。

## 判断步骤

1. 先定位到**具体哪条 SQL** 慢，不是「页面慢」。
2. 对它跑 `EXPLAIN ANALYZE`，看实际行数、耗时，有没有 `Seq Scan`。
3. 有全表扫描 → 去看条件里用到的列有没有索引（外键列尤其容易漏，见 `RULE-PG-FK-INDEX-001`）。
4. 数一下一次请求发了几条 SQL：条数随数据量增长 → 大概率是 N+1，改成一次批量取。
5. 改完再 `EXPLAIN` 一次，用前后对比说话；没变快就说明改错了地方，回退。

## 失败模式

- 凭印象加缓存或加机器，掩盖了真正的问题。
- 加了索引但从没看过查询计划，索引根本没被用上。
- 把 N+1 改写成一条超长 JOIN，结果比原来更慢。
- 在开发库（几百行）上调优，到真实数据量上结论完全不成立。

## 验证证据

- 同一条 SQL 改动前后的 `EXPLAIN ANALYZE` 对比。
- 一次请求的 SQL 条数，改动前后对比。

## 相关资产

- `PLAYBOOK-DEBUG-001`（引用）：先复现再定位根因；这条是它在「性能问题」这一类的具体落点。
- `RULE-PG-FK-INDEX-001`（引用）：这两处里最常见、也最容易漏的一处。
