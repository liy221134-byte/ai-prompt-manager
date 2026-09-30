---
id: RULE-CHANGE-TEST-MAP-001
title: 建一张改哪跑哪的映射表
asset_type: rule
rule_type: process
purpose: testing
layer: project
tech_context:
  - generic
priority: p1
scope: global
project_scale:
  - medium
  - large
  - regulated
lifecycle_phase:
  - build
  - release
status: candidate
confidence: hypothesis
override_allowed: true
compile_target:
  - none
verification: manual
evidence: []
source_references:
  - MemOS（github.com/MemTensor/MemOS）仓库根约定文件的 Change → Test Mapping 一节：按改动落点规定至少要跑的检查
  - MemOS 仓库根约定文件的行为边界一节：碰了对外接口定义就要重跑并确认契约没有意外变化
  - 采集台账：seed-packs/external-sources/README.md（来源 S9）
related_assets:
  - MTH-QUALITY-001
  - RULE-VERIFY-002
  - CASE-MIGRATION-001
version: 0.1.0
last_reviewed: 2026-09-30
---

# 建一张改哪跑哪的映射表

## 核心结论

把「改了哪个目录 → 至少跑哪组检查」写成一张表，和代码放在一起。它解决的不是
「要不要测」，而是**「这次具体该跑什么」**。

只有两档（日常快检查 / 合并前全量）时会出现两个问题：改一行文档要跑全量，浪费时间；
改了对外契约只跑快检查，漏掉真正的风险。映射表把这两头都收掉。

## 使用条件

- 项目已经有稳定的目录结构和不止一条检查命令时。
- 出现「这次该跑什么」需要靠讨论来决定的时候。

## 不适用场景

- 只有一条检查命令、改动范围单一的小项目：一张表是多余的。
- 探索期、目录结构还在天天变：先等结构稳定，否则这张表只会过期。

## 判断步骤

1. 先把目录按「改动风险」分层，而不是按业务分类。
2. 逐层写下**至少**要跑什么，例如（以本仓库为例，其他项目照自己的结构替换）：

| 改了 | 至少跑 |
| --- | --- |
| `docs/`（纯文档） | 内容与合规检查 |
| `seed-packs/` 某个包 | 重新生成该包 + 该包的格式测试 |
| `src/lib/` 共享逻辑 | 类型检查 + 相关单测 |
| 对外契约（工具定义、包格式、接口模型） | 上面全部 + 生产构建 |

3. 动手前先查表；跑完把真实输出留在交付说明里。
4. 表里每加一行，就顺手把那条命令跑一遍，确认它是活的。

## 失败模式

- 只有「快检查 / 全检查」两档，危险改动被漏检或被过度检查。
- 表存在但没人查，最后仍然拍脑袋决定跑什么。
- 表里写的命令已经失效：脚本改名了、命令删了，表没跟着改。
- 把表当成「检查清单打勾」，只勾不跑。

## 验证证据

- 抽查三次不同类型的改动，每次都能说清：按表该跑什么、实际跑了什么。
- 表里的命令逐条跑一遍，没有失效条目。
- 出现过至少一次「因为查表才发现要跑某条检查」的记录。

## 相关资产

- `MTH-QUALITY-001`（补强）：那条定的是质量画像与必选门禁，这条把门禁落到
  「改动落点」这一级。
- `RULE-VERIFY-002`（相关）：证据必须是这次跑出来的；这条负责回答「这次该跑哪条」。
- `CASE-MIGRATION-001`（相关）：迁移历史与文件名不一致那次事故，正是「改了 A
  却没跑 B 的检查」的典型。
