---
id: RULE-PG-TRANSACTION-001
title: 事务里不放外部调用，保持短
asset_type: rule
rule_type: forbidden
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
  - build
status: candidate
confidence: hypothesis
override_allowed: false
compile_target:
  - agents
verification: manual
evidence: []
source_references:
  - Supabase 官方 Agent Skills「supabase-postgres-best-practices」1.3.0，规则文件 lock-short-transactions
  - seed-packs/external-sources/README.md（采集台账与来源说明）
related_assets:
  - RULE-PG-RLS-001
  - PLAYBOOK-RELEASE-001
version: 0.1.0
last_reviewed: 2026-09-27
---

# 事务里不放外部调用，保持短

## 核心结论

**事务一开就持有锁，锁跟着事务一起结束。** 所以事务里只要有耗时不可控的动作——
调 AI 接口、发通知、读大文件、等外部系统返回、等人工确认——锁就会跟着它一起变长，
别人全在门外排队。规矩很简单：**事务里只做数据库操作，外部调用放在它前面或后面。**

## 使用条件

- 任何显式事务（`BEGIN ... COMMIT`）或事务包装函数。
- 「先查状态 → 调外部服务 → 再写库」这类流程。

## 不适用场景

- 本机单人脚本、没有并发：慢一点没人排队，但习惯还是别养坏。
- 事务里本来就只做数据库操作的正常情况——这条正是要保住它。

## 判断步骤

1. 把事务块里的每一行读一遍，标出所有非数据库动作。
2. 能挪到事务外的全部挪出去：外部调用先做完，拿到结果再开事务写库。
3. 挪不出去的，问一句「它超时了事务怎么办」——答不上来就说明它不该在里面。
4. 事务里保持「读要用的数据、写该写的行、提交」三件事。

## 失败模式

- 在事务里调 AI 接口：几秒到几十秒，期间相关行一直被锁。
- 在事务里发通知或写日志到外部服务：外部一慢，事务超时回滚，数据白写。
- 事务里等人工确认：锁会一直挂到人回来。
- 把事务当成「一大段代码的包裹」，而不是「一组必须同时成立的数据库操作」。

## 验证证据

- 事务代码块里没有网络调用、文件读写和等待。
- 一次真实流程的耗时拆分：外部调用占的时间不在事务内。

## 相关资产

- `RULE-PG-RLS-001`（引用）：同为数据库层的边界规则，一个管可见性，一个管持锁时长。
- `PLAYBOOK-RELEASE-001`（引用）：发布与回滚；长事务是回滚时最容易卡住的环节。
