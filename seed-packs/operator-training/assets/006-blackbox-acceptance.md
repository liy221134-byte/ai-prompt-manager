---
id: OPS-ACCEPT-001
title: 零代码黑盒验收：五状态走查
# 用 template 而不是新造 checklist 类型：装进产品时落成「模板」资产，
# 不为了一个词去动资产类型枚举
asset_type: template
audience: human
module: M4-验收
difficulty: L1
purpose: testing
layer: project
scope: global
project_scale:
  - personal
  - medium
tech_context:
  - generic
lifecycle_phase:
  - release
priority: p0
override_allowed: false
compile_target:
  - none
verification: manual
evidence:
  - docs/acceptance/v2.6.0.md（界面动作逐条实测：导入、解析、限制、云端禁用）
  - docs/acceptance/v2.11.0.md（演练都在真实数据副本上做，原始库不动）
status: candidate
confidence: provisional
source_references:
  - 本项目每版的"界面补验"记录（浏览器实际点一遍，不读代码）
  - superpowers：verification-before-completion（完成前必须实际验证）
related_assets:
  - OPS-ACCEPT-002
  - OPS-MINDSET-001
version: 0.2.0
last_reviewed: 2026-09-24
---

# 零代码黑盒验收：五状态走查

## 核心结论

不读代码也能验收：**按用户流程走一遍，五个状态都看，出错时看控制台和网络请求**。
只看主流程顺利，等于没验收。

## 使用条件

- 每次功能交付前，你自己点一遍。
- AI 说"做完了"之后、你签字之前。

## 不适用场景

- 纯文案、纯样式的微调：看一眼即可，不必走五状态。
- 已经在自动化测试里锁死的内部逻辑：抽查即可。

## 五状态走查

| 状态 | 怎么点 | 看什么 |
| --- | --- | --- |
| 正常 | 按主流程走一遍 | 结果对不对、下一步顺不顺 |
| 空数据 | 新建一个空项目/清空列表 | 有没有引导语，不是空白页 |
| 错误 | 故意填错、断网、给错权限 | 有没有中文提示，坏数据有没有落库 |
| 加载 | 操作慢的场景（大文件、慢网络） | 有没有转圈、会不会重复提交 |
| 边界 | 超长内容、特殊字符、重复提交、越权访问 | 被拦住还是写坏了数据 |

三眼看 bug：

1. 控制台有没有报错（界面看着正常也可能是错的）。
2. 网络请求状态码和返回内容对不对。
3. 数据到底有没有写进去（刷新页面再看一遍，不是只看界面回显）。

## 失败模式

- 只点主流程，看到"好像好了"就签收。
- 不看空数据和失败的样子，用户一用就撞上。
- 只信界面回显，不刷新、不看数据库。

## 验证证据

- 验收清单里的实测记录（点了什么、看到什么）。
- 控制台报错和网络请求的截图或原文（出问题时）。

## 相关资产

- `TPL-ACCEPT-001`（引用）：验收证据链模板，验收记录就写在那里。
- `OPS-ACCEPT-002`（相关）：让 AI 先自测，你只做抽查。
- `MTH-QUALITY-001`（引用）：质量等级越高，验收状态要看得越全。
