---
id: TPL-ACCEPT-001
title: 验收证据链
asset_type: template
purpose: testing
layer: project
tech_context:
  - generic
priority: p0
override_allowed: true
compile_target:
  - template
verification: manual
evidence:
  - docs/acceptance/（week-01 至 week-09 与 v1.0.0 清单按"版本与结论、已通过项、发布门禁、发布记录"组织并逐项签署）
scope: project
project_scale:
  - medium
  - large
  - regulated
lifecycle_phase:
  - analysis
  - build
  - release
status: candidate
confidence: provisional
source_references:
  - docs/acceptance/week-07.md
  - docs/development-rules.md
related_assets:
  - MTH-REQ-002
  - MTH-QUALITY-001
version: 0.2.0
last_reviewed: 2026-09-21
---

# 验收证据链

## 核心结论

“已经完成”必须有证据。验收不应只记录任务是否勾选，而要把需求、验收条件、
测试步骤、实际结果、版本和已知问题关联起来。

## 使用条件

- 每个功能、修复、数据迁移和发布任务。
- 多方协作或存在返工、审计、回滚要求时。

## 不适用场景

- 一次性探索可以只记录结论，但正式交付不得省略证据。
- 不能用测试数量代替关键业务验收。

## 证据链结构

```text
需求编号
-> 验收条件
-> 测试步骤
-> 实际结果
-> 自动化或人工证据
-> 代码或提交版本
-> 已知问题和例外
```

## 最低内容

1. 要验证的用户可见行为。
2. 正常流程。
3. 空数据、边界、错误和重复操作。
4. 执行环境和数据条件。
5. 通过或失败结果。
6. 问题和修复版本。

## 失败模式

- 只有任务清单，没有实际结果。
- 验收条件不可观察。
- 修复后没有复验和回归。
- 文档勾选完成，但生产配置未验证。

## 验证证据

- 验收记录。
- 自动化和人工测试结果。
- 提交、版本、部署和回滚记录。

## 相关资产

- `MTH-QUALITY-001`：验收门禁由项目画像决定。
