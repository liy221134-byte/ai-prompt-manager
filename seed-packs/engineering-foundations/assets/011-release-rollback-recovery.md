---
id: PLAYBOOK-RELEASE-001
title: 发布、回滚与恢复
asset_type: playbook
scope: project
project_scale:
  - medium
  - large
  - regulated
lifecycle_phase:
  - release
  - operate
status: candidate
confidence: provisional
source_references:
  - docs/operations/release-rollback.md
  - docs/operations/backup.md
related_assets:
  - MTH-QUALITY-001
  - PLAYBOOK-INCIDENT-001
version: 0.1.0
last_reviewed: 2026-09-20
---

# 发布、回滚与恢复

## 核心结论

建代码、数据库和配置不能独立发布。上线前必须确定迁移顺序、数据备份、
环境变量范围、回滚目标和发布后验证。

## 使用条件

- 所有生产发布和数据库迁移。
- 存在外部依赖、持久化数据或用户影响时。

## 不适用场景

- 纯文档或无运行环境影响的变更可以简化。
- 简化不能取消版本记录和可回退性。

## 执行顺序

1. 评审代码、数据库和配置变更。
2. 完成工程检查。
3. 导出并验证备份。
4. 先执行兼容性数据库迁移并验证。
5. 确定上一个正常部署和回滚目标。
6. 部署应用。
7. 验证登录、核心数据流和外部接口。
8. 记录发布证据和未解决问题。

## 发布门禁证据

- 工程检查结果。
- 迁移名称、时间和验证结果。
- 备份时间、位置和数据量。
- 环境变量范围。
- 回滚目标。
- 发布后的基础验收结果。

## 失败模式

- 先部署代码，后补数据库结构。
- 没有备份就迁移或合并数据。
- Preview 使用生产密钥。
- 回滚只恢复代码，不处理数据兼容。

## 验证证据

- 发布检查表。
- 回滚和恢复演练记录。
- 生产监控和错误记录。

## 相关资产

- `PLAYBOOK-INCIDENT-001`：使用受控故障验证恢复能力。
