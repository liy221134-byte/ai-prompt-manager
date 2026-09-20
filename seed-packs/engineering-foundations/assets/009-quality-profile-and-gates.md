---
id: MTH-QUALITY-001
title: 项目质量画像与必选门禁
asset_type: method
scope: project
project_scale:
  - personal
  - medium
  - large
  - regulated
lifecycle_phase:
  - analysis
  - design
  - build
  - release
status: candidate
confidence: hypothesis
source_references:
  - docs/acceptance/week-07.md
  - docs/operations/release-rollback.md
  - docs/learning/engineering-readiness.md
related_assets:
  - MTH-PROJECT-001
  - TPL-ACCEPT-001
  - PLAYBOOK-RELEASE-001
version: 0.1.0
last_reviewed: 2026-09-20
---

# 项目质量画像与必选门禁

## 核心结论

不同风险等级应自动选择不同门禁。门禁的目标是控制真实风险，不是让所有项目
都生成相同数量的文档。

## 使用条件

- 创建项目或项目风险等级变化时。
- 发布、数据迁移、权限变更和外部集成前。
- 需要判断哪些验证不能被跳过时。

## 不适用场景

- 不能用门禁替代具体验收标准。
- 不能因为免费或预算低就跳过关键数据安全。
- 不能把所有门禁都设为强制，导致小型项目无法推进。

## 推荐门禁

| 画像 | 必选门禁 |
| --- | --- |
| 个人工具 | 可运行、基本验收、数据导出 |
| 中型产品 | 工程检查、登录保护、备份、回滚、账号隔离 |
| 大型平台 | 架构基线、接口契约、端到端骨架、性能、可观察性、发布门禁 |
| 监管或高敏 | 等保、安全审计、密钥管理、可信环境、恢复演练和合规证据 |

## 执行步骤

1. 确定项目质量画像。
2. 选择该画像的必选门禁。
3. 标记可以裁剪或延后的门禁。
4. 将门禁映射到责任人、证据和阶段。
5. 风险变化时重新计算门禁。

## 失败模式

- 个人项目生成大型项目全套文档。
- 涉及用户数据的项目没有备份和回滚。
- 门禁只有复选框，没有证据和责任人。

## 验证证据

- 质量画像。
- 门禁适用矩阵。
- 每项门禁的证据和豁免记录。

## 相关资产

- `PLAYBOOK-RELEASE-001`：发布时执行质量门禁。
