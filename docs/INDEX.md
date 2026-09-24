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
- [2.0 收口清单](2.0-closeout.md)
- [开发规则说明（给人看的版本）](development-rules.md)
- [生产级项目指南地图](project-map.md)
- [工程地图：文件职责与请求链路](engineering-map.md)
- [待确认与待办事项](pending-items.md)

### 产品

- [用户地图（功能在哪、点哪里）](user-map.md)
- [从沉淀到立项：链路断点评估](project-lifecycle-gaps.md)
- [零代码交付线需求草案（v3 暂定名，待确认）](v3-requirements-draft.md)
- [需求收敛：文档／模板边界、Spec 层与交互流程（待确认）](requirements-v2.md)
- [产品范围](product-brief.md)
- [8 周路线图](roadmap.md)
- [2.0 资产管理底座计划](v2-plan.md)
- [2.0 需求草案](v2-requirements-draft.md)
- [2.0 需求池](v2-backlog.md)

### 设计

- [v2.20.0 规则引用模型收尾设计（待确认）](superpowers/specs/2026-09-25-v2.20.0-rule-reference-closeout-design.md)
- [v2.20.0 挑资产引用模型设计](superpowers/specs/2026-09-25-v2.20.0-picked-rule-reference-design.md)
- [v2.19.0 本地与云端定期同步设计](superpowers/specs/2026-09-24-v2.19.0-cloud-sync-design.md)
- [v2.18.0 规则引用模型设计](superpowers/specs/2026-09-24-v2.18.0-rule-reference-design.md)
- [v2.17.0 项目资产两条链路设计（待确认）](superpowers/specs/2026-09-24-v2.17.0-asset-lanes-design.md)
- [v2.15.0 立项起步包设计](superpowers/specs/2026-09-24-v2.15.0-kickoff-pack-design.md)
- [v2.14.0 沉淀回流设计](superpowers/specs/2026-09-24-v2.14.0-sediment-flowback-design.md)
- [v2.13.0 关联录入与用法引导设计（待确认）](superpowers/specs/2026-09-24-v2.13.0-linking-and-guidance-design.md)
- [v2.12.0／v2.13.0 交互重构与问题修复设计（待确认）](superpowers/specs/2026-09-24-v2.12.0-workspace-split-and-fixes-design.md)
- [v2.2.0 规则包与种子资产包导入设计](superpowers/specs/2026-09-23-v2.2.0-rule-pack-and-seed-import-design.md)
- [v2.3.0 规则编译设计](superpowers/specs/2026-09-23-v2.3.0-rule-compile-design.md)
- [v2.4.0 模板中心设计](superpowers/specs/2026-09-23-v2.4.0-template-center-design.md)
- [v2.5.0 项目图谱设计](superpowers/specs/2026-09-23-v2.5.0-project-graph-design.md)
- [v2.6.0 工程导入设计](superpowers/specs/2026-09-23-v2.6.0-engineering-import-design.md)
- [v2.7.0 MCP 动态查询设计](superpowers/specs/2026-09-23-v2.7.0-mcp-dynamic-query-design.md)
- [v2.8.0 生产工程治理设计（质量等级）](superpowers/specs/2026-09-23-v2.8.0-quality-level-design.md)
- [v2.9.0 验收证据链设计](superpowers/specs/2026-09-23-v2.9.0-acceptance-evidence-design.md)
- [v2.10.0 发布门禁与故障演练设计](superpowers/specs/2026-09-23-v2.10.0-release-gate-design.md)
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

- [规则包格式说明](rule-pack-format.md)
- [v2.1.0 交接与待办](operations/v2.1.0-handoff.md)
- [本机 MCP 服务](operations/mcp-server.md)
- [数据库结构](database-schema.md)
- [数据库迁移](operations/database-migrations.md)
- [可用性与恢复目标](operations/availability-targets.md)
- [发布与回滚](operations/release-rollback.md)
- [备份与恢复](operations/backup.md)
- [常见问题](faq.md)

### 工程学习

- [工程能力学习计划](learning/engineering-readiness.md)
- [工程文档模板（九份）](../templates/engineering/architecture.md)：架构与请求链路、数据流、环境变量清单、发布与回滚、备份与恢复、安全检查、故障处理手册、成本与性能基线、故障演练记录，用「导入模板」装进项目
- [操作者训练包（试装）](../seed-packs/operator-training/README.md)：9 条「人怎么指挥 AI」的方法与清单，`npm run pack:operator` 生成可导入文件
- [工程方法种子资产包](../seed-packs/engineering-foundations/README.md)：25 条工程方法、规则、模板和案例，`0.4.0`（新增 7 条来自 2.0 开发过程复盘：三道门、版本边界、设计文档四块、证据只记一处、资产三层、沉淀分流、AI 写入边界），可作为文档包导入的样本
- [交付就绪包（M0）](../seed-packs/delivery-readiness/README.md)：3 条（交付前环境适配体检、交付环境档案模板、客户环境部署手册模板），`0.1.0`，`npm run pack:delivery` 生成导入文件。换环境交付那条「配置解决不了」的缝，第一条真项目跑完前是**假设**

### 验收与测试

- [用户故事与线上自测清单](user-stories.md)
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
- [v2.1.3 验收清单（MVP 加固，已并入 v2.11.0）](acceptance/v2.1.3.md)
- [v2.2.0 验收清单（规则包与种子资产包导入）](acceptance/v2.2.0.md)
- [v2.3.0 验收清单（规则编译）](acceptance/v2.3.0.md)
- [v2.4.0 验收清单（模板中心）](acceptance/v2.4.0.md)
- [v2.5.0 验收清单（项目图谱）](acceptance/v2.5.0.md)
- [v2.6.0 验收清单（工程导入）](acceptance/v2.6.0.md)
- [v2.7.0 验收清单（MCP 动态查询）](acceptance/v2.7.0.md)
- [v2.8.0 验收清单（项目质量等级与工程基线）](acceptance/v2.8.0.md)
- [v2.9.0 验收清单（验收证据链）](acceptance/v2.9.0.md)
- [v2.10.0 验收清单（发布门禁与故障演练）](acceptance/v2.10.0.md)
- [v2.11.0 验收清单（统一加固与验收）](acceptance/v2.11.0.md)
- [v2.12.0 验收清单（交互重构、浮窗修复与资产来源）](acceptance/v2.12.0.md)
- [v2.13.0 验收清单（关联录入与文档边界）](acceptance/v2.13.0.md)
- [v2.14.0 验收清单（沉淀回流）](acceptance/v2.14.0.md)
- [v2.15.0 验收清单（立项起步包）](acceptance/v2.15.0.md)
- [v2.16.0 验收清单（MCP 批量入库与沉淀分流建议）](acceptance/v2.16.0.md)
- [v2.17.0 验收清单（项目资产两条链路）](acceptance/v2.17.0.md)
- [v2.18.0 验收清单（规则引用模型）](acceptance/v2.18.0.md)
- [v2.19.0 验收清单（本地与云端定期同步）](acceptance/v2.19.0.md)
- [v2.20.0 验收清单（规则引用收尾）](acceptance/v2.20.0.md)

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
