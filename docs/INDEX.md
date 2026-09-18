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

### 产品

- [产品范围](product-brief.md)
- [8 周路线图](roadmap.md)
- [2.0 需求草案](v2-requirements-draft.md)
- [2.0 需求池](v2-backlog.md)

### 决策

- [技术选型](decisions/0001-tech-stack.md)
- [本地存储](decisions/0002-local-storage.md)
- [备份格式](decisions/0003-backup-format.md)
- [本机 SQLite](decisions/0004-local-sqlite.md)
- [云端架构](decisions/0005-cloud-architecture.md)
- [AI 供应商抽象](decisions/0006-ai-provider-abstraction.md)

### 数据与运维

- [数据库结构](database-schema.md)
- [发布与回滚](operations/release-rollback.md)
- [备份与恢复](operations/backup.md)
- [常见问题](faq.md)

### 验收与测试

- [第 1 周验收](acceptance/week-01.md)
- [第 2 周验收](acceptance/week-02.md)
- [第 2 周手动测试](testing/week-02-manual-test-guide.md)
- [第 3 周验收](acceptance/week-03.md)
- [第 4 周验收](acceptance/week-04.md)
- [第 5 周验收](acceptance/week-05.md)
- [第 6 周验收](acceptance/week-06.md)

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

