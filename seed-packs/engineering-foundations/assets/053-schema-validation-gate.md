---
id: RULE-SCHEMA-CHECK-001
title: AI 产出与外部输入先过 schema 校验
asset_type: rule
rule_type: must
purpose: safety
layer: feature
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
status: candidate
confidence: provisional
override_allowed: false
compile_target:
  - agents
verification: gate
evidence:
  - src 中已用 zod 校验外部 / AI 输入（产品已有实践）
  - AGENTS.md 交付门第 7 条（本次新增）
source_references:
  - AGENTS.md §交付门（凡 AI 产出或外部输入先过 schema 再进业务逻辑）
  - DEV-SYSTEM.md §交付门
related_assets:
  - RULE-AI-WRITE-001
  - MTH-EVIDENCE-001
  - RULE-VERIFY-002
version: 0.1.0
last_reviewed: 2026-09-30
---

# AI 产出与外部输入先过 schema 校验

## 核心结论

任何来自 AI 生成、外部 API、或不可信用户输入的数据，在进业务逻辑之前，必须先用 schema（如 zod）校验一遍结构、类型和必填项。结构拿不准时，显式停下来问清楚，绝不让 AI 自己脑补一个结构继续跑。这是挡住"AI 幻觉变成脏数据"的最后一道防线——对应胶水编程法里用 Zod schema 锁死 AI 输出的做法；我们产品里已装 zod，可零成本落地。

## 使用条件

- 接收 AI 生成内容（提示词优化结果、采集提炼结果、任意模型输出）的边界。
- 接收外部 API 响应、文件导入、或用户原始输入的边界。

## 不适用场景

- 纯内部、来源可信、已被强类型约束的函数间调用。
- 数据库内部已约束且来源可信的读取（仍建议入口校验，但非强制）。

## 判断步骤

1. 在进入业务处理前，为该输入定义一份 schema（字段、类型、必填、取值范围）。
2. 在入口处 `schema.parse(input)`（或等价校验），失败立即返回结构化错误，不吞掉、不降级继续。
3. 校验不过的数据不进入任何写操作（落库、发请求、改状态）。
4. 当 schema 本身无法确定某字段含义时，停下问人，不要把猜测当默认值填进去。

## 失败模式

- **直接信任 AI 输出**：模型漏字段 / 改类型，业务在运行期崩溃或写入脏数据。
- **校验失败静默继续**：catch 住异常后照样往下走，等于没校验。
- **用 `any` 绕过**：表面过了类型检查，实则放弃了运行期保护。
- **只在测试里校验、生产路径裸奔**：幻觉恰恰发生在生产。

## 验证证据

- 对关键入口写单元测试：喂非法 / 缺字段输入，断言被拒而非被吞。
- 类型检查 + 运行期校验双保险；引入新外部源时把 schema 作为必改项。

## 相关资产

- `RULE-AI-WRITE-001`（AI 写入边界）：校验后才能写，写要留版本。
- `MTH-EVIDENCE-001`（证据只记一处）：校验规则与失败样例只在一处维护。
- `RULE-VERIFY-002`（声明完成前证据必须是这次跑出来的）：校验是否真挡住脏数据，要实测。
