# 资产结构

## 版本

- `0.2.1`：新增约束驱动技术选型和技术档案模板两条资产；资产包版本与资产自身版本分开，
  资产只在自己内容变化时升版本。
- `0.2.0`：补齐 2.0 资产管理需要的元数据字段：用途、作用层级、技术上下文、优先级、
  覆盖权限、编译去向、验证方式和已产出的证据。
- `0.1.0`：首批 12 条资产使用的字段。

## 文件格式

每条资产使用 Markdown，文件顶部包含 YAML Front Matter。

```yaml
---
id:
title:
asset_type:
rule_type:        # 仅 asset_type 为 rule 时必填
purpose:
layer:
scope:
project_scale:
tech_context:
lifecycle_phase:
priority:
status:
confidence:
override_allowed:
compile_target:
verification:
evidence:
source_references:
related_assets:
version:
last_reviewed:
---
```

## 字段说明

| 字段 | 取值 | 说明 |
| --- | --- | --- |
| `id` | 文本 | 稳定标识，不随标题变化 |
| `title` | 文本 | 人类可读标题 |
| `asset_type` | `principle`、`method`、`playbook`、`rule`、`template` 或 `case_note` | 资产类型 |
| `rule_type` | `must`、`forbidden`、`recommended`、`process`、`acceptance` 或 `technology` | 规则类型，仅规则类资产填写 |
| `purpose` | `analysis`、`development`、`testing`、`release`、`data`、`safety` 或 `collaboration` | 主要用途 |
| `layer` | `project`、`module`、`feature`、`file` 或 `data` | 作用层级 |
| `scope` | `global`、`project` 或 `task` | 适用范围 |
| `project_scale` | `personal`、`medium`、`large` 或 `regulated` | 适用的项目规模 |
| `tech_context` | `generic`、`nextjs`、`supabase`、`postgres`、`vercel` | 技术上下文，与技术无关时填 `generic` |
| `lifecycle_phase` | `analysis`、`design`、`build`、`release` 或 `operate` | 执行阶段 |
| `priority` | `p0`、`p1` 或 `p2` | `p0` 不可覆盖、`p1` 冲突时告警、`p2` 普通建议 |
| `status` | `draft`、`candidate`、`active` 或 `deprecated` | 资产生命周期状态 |
| `confidence` | `hypothesis`、`provisional` 或 `verified` | 可信度 |
| `override_allowed` | 布尔 | 是否允许项目或任务规则覆盖；为 `false` 时覆盖必须先写例外记录 |
| `compile_target` | `agents`、`readme`、`start_prompt`、`template` 或 `none` | 编译去向 |
| `verification` | `manual`、`test`、`gate` 或 `runtime` | 验证方式 |
| `evidence` | 文本列表 | 已经产出的证据，指向真实文件、提交或验收记录；没有就留空列表 |
| `source_references` | 文本列表 | 支撑该资产的来源文档、决策或验证结果 |
| `related_assets` | 文本列表 | 相关、依赖或可能冲突的资产标识；关系类型写在正文「相关资产」里 |
| `version` | 语义版本 | 资产自身的版本，不高于资产包版本 |
| `last_reviewed` | 日期 | 最近一次人工复核日期 |

`evidence` 和 `source_references` 的区别：`source_references` 说明这条资产从哪里推导而来，
`evidence` 记录这条资产在本项目或其它项目里实际用过并留下了什么结果。可信度升级必须有
`evidence` 支撑。

## 字段与 2.0 规则元数据的对应

| 2.0 规则元数据 | 本资产包字段 |
| --- | --- |
| 规则类型 | `rule_type` |
| 规则用途 | `purpose` |
| 适用范围 | `scope` |
| 作用层级 | `layer` |
| 技术上下文 | `tech_context` |
| 执行阶段 | `lifecycle_phase` |
| 优先级 | `priority` |
| 生命周期 | `status` |
| 覆盖权限 | `override_allowed` |
| 来源与证据 | `source_references`、`evidence` |
| 关系 | `related_assets` 加正文「相关资产」 |
| 编译去向 | `compile_target` |
| 验证方式 | `verification` |
| 版本原因 | 提交信息和本文件版本小节 |

## 正文结构

每份资产至少包含：

1. 核心结论。
2. 使用条件。
3. 不适用场景。
4. 执行方法或判断步骤。
5. 失败模式。
6. 验证证据。
7. 相关资产。

`case_note` 类型把第 4 节写成「经过与根因」和「改进与门禁」，其余相同。

## 可信度规则

- `hypothesis`：只有推导，没有实际项目验证。
- `provisional`：已在至少一个真实项目中使用并经人工确认。
- `verified`：已在三个不同项目画像中验证，且有反例检查。

任何来自聊天讨论但没有进入确认文档的内容，不得标记为 `provisional`。可信度升级时，
`evidence` 字段必须能指向具体文件、提交或验收记录。
