---
id: PLAYBOOK-INCIDENT-001
title: 生产故障演练
asset_type: playbook
purpose: release
layer: project
tech_context:
  - generic
priority: p2
override_allowed: true
compile_target:
  - agents
verification: manual
evidence:
  - docs/learning/engineering-readiness.md（演练一到七的计划；其中"配置错误时安全关闭"已由真实事故间接验证，其余尚未执行）
scope: project
project_scale:
  - medium
  - large
  - regulated
lifecycle_phase:
  - operate
status: candidate
confidence: hypothesis
source_references:
  - docs/learning/engineering-readiness.md
  - docs/operations/release-rollback.md
related_assets:
  - PLAYBOOK-RELEASE-001
  - MTH-QUALITY-001
version: 0.2.0
last_reviewed: 2026-09-21
---

# 生产故障演练

## 核心结论

恢复能力不能只靠文档证明。应在隔离环境中制造可控故障，记录发现、恢复时间
和真实改进项。

## 使用条件

- 项目具备备份、回滚和基础监控后。
- 每个大版本至少一次。
- 关键架构、权限、数据或部署方式变化后。

## 不适用场景

- 不在唯一生产数据上直接制造故障。
- 没有备份、恢复路径和负责人时不执行破坏性演练。

## 首批演练

1. 使用错误环境变量验证系统安全关闭。
2. 导出测试数据，修改后完成恢复。
3. 回滚到上一个正常部署并完成基础验收。
4. 检查 Preview 不包含生产密钥。
5. 使用测试数据学习慢查询、配额和成本边界。

## 记录模板

```text
演练目标
开始前状态
执行操作
观察结果
证据
是否恢复
恢复时间
学到什么
改进事项
```

## 失败模式

- 只看备份文件存在，不验证恢复。
- 只回滚代码，不验证数据。
- 没有记录恢复时间和失败步骤。
- 演练结果没有进入发布和运维改进。

## 验证证据

- 演练记录。
- 恢复前后对比。
- 改进任务和关闭证据。

## 相关资产

- `PLAYBOOK-RELEASE-001`（依赖）：演练前必须先具备备份、回滚和发布门禁。
- `MTH-QUALITY-001`（引用）：演练结论会回头修正项目的必选门禁。
