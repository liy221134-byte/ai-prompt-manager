---
id: RULE-PG-PRIVILEGE-001
title: 应用连接只用最小权限，绝不用 superuser
asset_type: rule
rule_type: forbidden
purpose: safety
layer: data
tech_context:
  - postgres
  - supabase
priority: p0
scope: project
project_scale:
  - personal
  - medium
  - large
  - regulated
lifecycle_phase:
  - build
  - operate
status: candidate
confidence: hypothesis
override_allowed: false
compile_target:
  - agents
verification: gate
evidence: []
source_references:
  - Supabase 官方 Agent Skills「supabase-postgres-best-practices」1.3.0，规则文件 security-privileges
  - seed-packs/external-sources/README.md（采集台账与来源说明）
related_assets:
  - RULE-PG-RLS-001
  - RULE-AI-WRITE-001
  - MTH-TECH-001
version: 0.1.0
last_reviewed: 2026-09-27
---

# 应用连接只用最小权限，绝不用 superuser

## 核心结论

**跑业务查询的那条数据库连接，只给它需要的权限。** 不用 `superuser`，也不要用能绕过行级安全的
高权限角色（例如服务角色密钥）。那把钥匙只在少数管理动作里用一次，而且只能待在服务端。
理由很直白：应用一旦被注入或写错，攻击面就是「它这条连接能碰到的全部」——
连接是 superuser，那就等于把整库递过去了。

## 使用条件

- 应用连数据库的每一条通道：后端接口、定时任务、脚本、AI 工具。
- 引入新的数据库账号或密钥时。

## 不适用场景

- 本机一次性排障：临时用高权限登录可以，但不能写进代码、不能进配置。
- 迁移工具需要 DDL 权限：那是单独的连接，只在发布时用，不跟业务连接共用。

## 判断步骤

1. 列出应用实际要做的事：读哪些表、写哪些表、要不要 DDL。
2. 按这张清单建一个专用角色，只授这些权限。
3. 高权限密钥从应用配置里拿掉；确实要用的管理动作单独走一条通道。
4. 确认客户端代码和预览环境里**没有任何**高权限密钥。
5. 用应用角色试一次「建表 / 删表 / 读别人的数据」——都该被拒绝。

## 失败模式

- 为了省事，应用直接拿服务角色密钥跑业务查询，行级安全形同虚设。
- 高权限密钥进了客户端代码或预览环境（预览环境往往没有生产数据那么严的看护）。
- 业务连接带着 DDL 权限，于是应用代码里任何一处拼错的 SQL 都能改表结构。
- 权限只写了一次、从没复核：加过几次功能之后，那个角色早就不是「最小」了。

## 验证证据

- 应用角色权限清单，逐项对得上它实际要做的事。
- 一次「用应用角色去建表 / 删表」的实测：被拒绝。
- 客户端代码与预览环境配置的检查记录：没有高权限密钥。

## 相关资产

- `RULE-PG-RLS-001`（引用）：RLS 管「能看哪些行」，这条管「能碰哪些表」。
- `RULE-AI-WRITE-001`（引用）：AI 能做的写入受限；这条把同样的边界落在数据库账号上。
- `MTH-TECH-001`（引用）：那条讲「预览环境不得持有生产密钥」，这条讲数据库角色本身。
