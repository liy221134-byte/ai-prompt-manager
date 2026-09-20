# 资产结构

## 文件格式

每条资产使用 Markdown，文件顶部包含 YAML Front Matter。

```yaml
---
id:
title:
asset_type:
scope:
project_scale:
lifecycle_phase:
status:
confidence:
source_references:
related_assets:
version:
last_reviewed:
---
```

## 字段说明

| 字段 | 说明 |
| --- | --- |
| `id` | 稳定标识，不随标题变化 |
| `title` | 人类可读标题 |
| `asset_type` | `principle`、`method`、`playbook`、`rule`、`template` 或 `case_note` |
| `scope` | `global`、`project` 或 `task` |
| `project_scale` | `personal`、`medium`、`large` 或 `regulated` |
| `lifecycle_phase` | `analysis`、`design`、`build`、`release` 或 `operate` |
| `status` | `draft`、`candidate`、`active` 或 `deprecated` |
| `confidence` | `hypothesis`、`provisional` 或 `verified` |
| `source_references` | 支撑该资产的文档、决策或验证结果 |
| `related_assets` | 相关、依赖或可能冲突的资产 |
| `version` | 资产自身的语义版本 |
| `last_reviewed` | 最近一次人工复核日期 |

## 正文结构

每份资产至少包含：

1. 核心结论。
2. 使用条件。
3. 不适用场景。
4. 执行方法或判断步骤。
5. 失败模式。
6. 验证证据。

## 可信度规则

- `hypothesis`：只有推导，没有实际项目验证。
- `provisional`：已在至少一个真实项目中使用并经人工确认。
- `verified`：已在三个不同项目画像中验证，且有反例检查。

任何来自聊天讨论但没有进入确认文档的内容，不得标记为 `provisional`。
