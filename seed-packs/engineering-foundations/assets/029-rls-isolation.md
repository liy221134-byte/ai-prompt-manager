---
id: RULE-PG-RLS-001
title: 隔离放在数据库层：RLS 要开，策略里别对每行调函数
asset_type: rule
rule_type: must
purpose: safety
layer: data
tech_context:
  - supabase
priority: p0
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
verification: gate
evidence: []
source_references:
  - Supabase 官方 Agent Skills「supabase-postgres-best-practices」1.3.0，规则文件 security-rls-basics
  - 同来源，规则文件 security-rls-performance
  - seed-packs/external-sources/README.md（采集台账与来源说明）
related_assets:
  - RULE-BOUNDARY-001
  - RULE-PG-PRIVILEGE-001
version: 0.1.0
last_reviewed: 2026-09-27
---

# 隔离放在数据库层：RLS 要开，策略里别对每行调函数

## 核心结论

两件事必须一起做：

1. **隔离由数据库兜底。** 多账号、多租户的数据，靠应用层「记得加 where user_id = ...」迟早漏一次，
   漏一次就是数据泄露。开行级安全（RLS），让数据库在任何人绕过应用直接查时也拦得住。
2. **策略里不要对每一行调函数。** 把 `auth.uid()` 这类调用直接写进策略，Postgres 会对扫描到的
   **每一行**求值一次；包成子查询 `(select auth.uid())` 才会只算一次。写法不对时查询慢 5～10 倍，
   策略里用到的列也要有索引。

## 使用条件

- 一张表里存着多个用户／租户的数据。
- 有客户端直连数据库的通道（例如浏览器用匿名密钥查表）。

## 不适用场景

- 单人使用、库里没有任何别人的数据：开了也不会错，但没有收益。
- 表里只有公共配置、谁都能读：不需要按行隔离。

## 判断步骤

1. 列出「谁的数据只有谁能看」的表。
2. 逐张表开启 RLS，并写清四类策略：读、插、改、删。
3. 策略里的身份判断包成子查询，不要裸调函数。
4. 策略里用到的列建索引。
5. 用「另一个账号的令牌」真去查一次，确认查不到——这是唯一算数的验证。

## 失败模式

- 只在应用层过滤，客户端换个查询方式就绕过去了。
- 开了 RLS 但没写策略：默认全拒，功能莫名其妙不可用。
- 策略里裸调 `auth.uid()`，小数据量看不出来，数据一多就成瓶颈。
- 只在测试账号上验过，没试过「用别人的身份去读」。

## 验证证据

- 每张多租户表都显示 RLS 已启用，且四类策略齐全。
- 一次「拿 A 的登录态去读 B 的数据」的实测记录：读不到。
- 策略的查询计划里，身份判断只算了一次。

## 相关资产

- `RULE-BOUNDARY-001`（引用）：数据所有权与接口契约；这条是它在行级的落地。
- `RULE-PG-PRIVILEGE-001`（引用）：RLS 管「能看哪些行」，那条管「能碰哪些表」。
