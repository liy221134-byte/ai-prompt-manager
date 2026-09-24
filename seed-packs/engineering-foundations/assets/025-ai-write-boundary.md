---
id: RULE-AI-WRITE-001
title: AI 写入边界：只新增与更新、留版本、不静默覆盖
asset_type: rule
rule_type: forbidden
purpose: safety
layer: project
tech_context:
  - generic
priority: p0
scope: global
project_scale:
  - personal
  - medium
  - large
lifecycle_phase:
  - build
  - operate
status: candidate
confidence: provisional
override_allowed: false
compile_target:
  - agents
verification: gate
evidence:
  - AGENTS.md（"AI 不得静默覆盖我的内容；AI 生成、优化、合并的结果必须先预览，由我确认后再保存"）
  - docs/operations/mcp-server.md（MCP 开放的能力清单里没有删除类工具，AI 能做的永远只是人在界面上能做的）
  - docs/acceptance/v2.16.0.md（批量入库只新增、不覆盖：同编号跳过、节点说明必填）
source_references:
  - docs/decisions/0006-ai-provider-abstraction.md
  - docs/decisions/0007-production-configuration-hardening.md
related_assets:
  - RULE-BOUNDARY-001
  - MTH-SINK-001
  - MTH-QUALITY-001
version: 0.1.0
last_reviewed: 2026-09-24
---

# AI 写入边界：只新增与更新、留版本、不静默覆盖

## 核心结论

AI 对数据的写入必须满足三条：**只新增或更新，不删除**；**每次写入都留一条历史版本**；
**生成、优化、合并的结果先预览，由人确认后再保存**。禁止静默覆盖——人看不见的改动等于没被
同意过。

## 使用条件

- 任何让 AI 直接读写业务数据的通道（编辑器里的 AI 动作、本地服务、接口工具）。
- 批量入库、批量关联、批量状态变更这类一次影响多条数据的操作。

## 不适用场景

- 只读查询：不进这条边界，但查询结果会进入对话上下文，要按数据敏感度判断。
- 人自己在界面上做的删除：走产品的垃圾箱与保留期规则，不在这条约束里。

## 边界清单

| 能力 | 允许 | 不允许 |
| --- | --- | --- |
| 新建 | 允许（只新增，重复时跳过并说明原因） | 不许覆盖同名条目的正文 |
| 修改 | 允许（产生新版本，旧正文可恢复） | 不许只改主表、不留版本 |
| 状态 | 允许归档、待确认、已废弃 | 不许永久删除、不许清空垃圾箱 |
| 批量 | 允许先空跑列出会改哪些、再确认执行 | 不许先斩后奏、不许跳过确认 |

还要守住两条数据纪律：**密钥不进入浏览器代码和版本库**；**业务正文不写进日志**。

## 失败模式

- 让 AI 直接改正文又不留版本，改错了回不去。
- 批量导入时"看到同名的就覆盖"，人自己改过的内容被悄悄冲掉。
- 用"更自然"的理由跳过预览，等人发现时已经改了一批数据。
- 把删除能力也开放给 AI，误删之后连回溯线索都没有。

## 验证证据

- 每次写入是否产生一条版本记录。
- 批量操作是否支持"先空跑、后确认"。
- 开放给 AI 的能力清单里是否存在删除类动作（应当没有）。

## 相关资产

- `RULE-BOUNDARY-001`（引用）：接口契约与数据所有权，是这条边界在数据层的版本。
- `MTH-SINK-001`（引用）：沉淀提升同样是"只新增不覆盖"。
- `MTH-QUALITY-001`（引用）：这类边界要靠门禁和测试固定，不能靠自觉。
