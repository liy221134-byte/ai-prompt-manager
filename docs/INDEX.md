# 项目文档索引

## 用途

这份索引是项目文档的入口。Codex 开始工作前，应先阅读本文件和 `AGENTS.md`，再按任务读取对应文档。

## 阅读顺序

1. `AGENTS.md`：强制开发与交互规则。
2. `README.md`：项目概览、启动命令和当前阶段。
3. `docs/INDEX.md`：文档入口与更新规则。
4. `docs/product-brief.md`：产品定位、范围和核心流程。
5. `docs/roadmap.md`：当前阶段和后续路线。
6. `docs/acceptance/week-XX.md`：当前阶段验收标准。
7. `docs/decisions/`：重要技术决策。
8. 与任务直接相关的数据库、运维或测试文档。

## 当前文档

### 规则与协作

- [项目规则（唯一规则源）](../AGENTS.md)
- [开发规则说明（给人看的版本）](development-rules.md)
- [生产级项目指南地图](project-map.md)
- [工程地图：文件职责与请求链路](engineering-map.md)
- [待确认与待办事项](pending-items.md)

### 产品

- [产品范围](product-brief.md)
- [8 周路线图](roadmap.md)
- [2.0 资产管理底座计划](v2-plan.md)
- [2.0 需求草案](v2-requirements-draft.md)
- [2.0 需求池](v2-backlog.md)

### 设计

- [v2.2.0 规则包与种子资产包导入设计](superpowers/specs/2026-09-23-v2.2.0-rule-pack-and-seed-import-design.md)
- [2.1.2 技术档案、资产关系与备份升级设计](superpowers/specs/2026-09-22-v2.1.2-tech-profile-relations-backup-design.md)
- [2.1.1 文档包导入与元数据编辑设计](superpowers/specs/2026-09-21-v2.1.1-import-and-metadata-design.md)
- [提示词写入路径切换到统一资产设计](superpowers/specs/2026-09-21-v2.1.0-prompt-write-path-design.md)
- [2.0.0 项目与统一资产底座设计](superpowers/specs/2026-09-21-v2.0.0-asset-foundation-design.md)
- [v0.8.0 AI 合并与垃圾箱设计](superpowers/specs/2026-09-20-ai-prompt-merge-design.md)
- [v0.8.0 AI 合并与垃圾箱实施计划（已归档）](archive/2026-09-20-ai-prompt-merge-plan.md)
- [v0.9.0 提示词 AI 优化设计](superpowers/specs/2026-09-20-ai-prompt-optimize-design.md)
- [v0.9.1 变量管理设计](superpowers/specs/2026-09-21-variable-management-design.md)

### 决策

- [技术选型](decisions/0001-tech-stack.md)
- [本地存储](decisions/0002-local-storage.md)
- [备份格式](decisions/0003-backup-format.md)
- [本机 SQLite](decisions/0004-local-sqlite.md)
- [云端架构](decisions/0005-cloud-architecture.md)
- [AI 供应商抽象](decisions/0006-ai-provider-abstraction.md)
- [生产配置安全关闭](decisions/0007-production-configuration-hardening.md)

### 数据与运维

- [v2.1.0 交接与待办](operations/v2.1.0-handoff.md)
- [数据库结构](database-schema.md)
- [数据库迁移](operations/database-migrations.md)
- [可用性与恢复目标](operations/availability-targets.md)
- [发布与回滚](operations/release-rollback.md)
- [备份与恢复](operations/backup.md)
- [常见问题](faq.md)

### 工程学习

- [工程能力学习计划](learning/engineering-readiness.md)
- [工程方法种子资产包](../seed-packs/engineering-foundations/README.md)：17 条工程方法、规则、模板和案例，`0.2.1` 已确认，可作为文档包导入的样本

### 验收与测试

- [第 1 周验收](acceptance/week-01.md)
- [第 2 周验收](acceptance/week-02.md)
- [第 2 周手动测试](testing/week-02-manual-test-guide.md)
- [第 3 周验收](acceptance/week-03.md)
- [第 4 周验收](acceptance/week-04.md)
- [第 5 周验收](acceptance/week-05.md)
- [第 6 周验收](acceptance/week-06.md)
- [第 7 周验收](acceptance/week-07.md)
- [第 8 周验收](acceptance/week-08.md)
- [第 9 周验收](acceptance/week-09.md)
- [v1.0.0 整体验收](acceptance/v1.0.0.md)
- [v2.0.0 整体验收](acceptance/v2.0.0.md)
- [v2.1.0 整体验收](acceptance/v2.1.0.md)
- [v2.1.1 整体验收](acceptance/v2.1.1.md)
- [v2.1.2 验收清单（已签字）](acceptance/v2.1.2.md)
- [v2.1.3 验收清单（统一加固，挂起）](acceptance/v2.1.3.md)
- [v2.2.0 验收清单（规则包与种子资产包导入）](acceptance/v2.2.0.md)

### 云端部署

- [Vercel + Supabase 部署指南](cloud-deployment.md)

### 提示词包

- [开发规范提示词包](../prompt-packs/development-rules.md)

## 文档更新规则

1. 产品范围变化时更新 `product-brief.md`。
2. 阶段目标变化时更新 `roadmap.md`。
3. 新增重要技术选择时增加 ADR。
4. 数据结构变化时更新 `database-schema.md` 和迁移文件。
5. 每阶段开始前创建验收清单，完成后逐项验证。
6. 部署、备份或回滚方式变化时更新运维文档。
7. 文档必须描述当前真实状态，不能保留已经失效的“待配置”说明。
