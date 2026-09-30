---
id: OPS-EFFECT-001
title: 按效果判断危不危险，别背命令清单
asset_type: method
audience: human
module: 心法
difficulty: L1
purpose: safety
layer: project
tech_context:
  - generic
lifecycle_phase:
  - build
priority: p1
scope: global
project_scale:
  - personal
  - medium
  - large
  - regulated
override_allowed: true
compile_target:
  - none
verification: manual
evidence: []
status: candidate
confidence: hypothesis
source_references:
  - Exomem（github.com/Artexis10/exomem）仓库的 agent 指引分册 worktrees：判断一个操作按它的效果，而不是按背下来的命令清单
  - Exomem 同一分册：在共享检出里会丢改动的操作清单，作为效果判断的样例而不是逐条背诵的表
  - 采集台账：seed-packs/external-sources/README.md（来源 S9）
related_assets:
  - OPS-MINDSET-001
  - OPS-DEBUG-001
version: 0.3.0
last_reviewed: 2026-09-30
---

# 按效果判断危不危险，别背命令清单

## 核心结论

规则如果写成「不许敲某几条命令」，它只能挡住你想到过的那几条。换一种写法：

> **这个操作会不会让某样东西永久消失？会不会动到别人正在做的事？**

按**效果**判断，而不是按命令名字判断。命令清单可以当例子，不能当规则。

## 使用条件

- 要把「什么能做、什么不能做」讲给 AI 或新同事时。
- 你自己拿不准一个操作该不该做时。
- 发现规则清单越来越长、但仍然会出事的时候。

## 不适用场景

- 纯粹的个人沙箱、里面没有任何需要保住的东西：这时只要一句「随便折腾」。
- 已经明确列出白名单的场景（例如只读命令）：白名单是另一回事，可以照样列。

## 判断步骤

1. 把要判断的操作按效果归三类：**可逆**、**可恢复**（有备份／有版本）、**不可逆**。
2. 不可逆的那类，改问一句：**谁批准了？**
3. 会动到别人正在做的事（共享目录、别人的分支、正在跑的服务）→ 归到不可逆一档处理。
4. 把这次判断的结论写成**判据**，不是写成「以后不许敲 X」。

## 失败模式

- 规则清单越写越长，真正出事的操作不在清单上。
- 换个工具、换个命令名，同一件危险事照样做——说明规则绑在名字上而不是效果上。
- 拿「以前这么干没出事」当安全证明。
- 把可恢复的操作当成不可逆来拦，导致正常干活也被卡住，最后规则被整体忽略。

## 验证证据

- 拿三个**不在**原先清单里的新命令做测试：按判据能正确分出可逆与不可逆。
- 规则文件里能找到一句以「会不会……」开头的判据，而不只是命令列表。

## 相关资产

- `OPS-MINDSET-001`（引用）：你是指挥官——判断责任在你，不在命令清单。
- `OPS-DEBUG-001`（引用）：同一个思路用在排错上：找根因，不猜着改。
- `RULE-WORKTREE-001`（引用）：工程包里那条是这条判据在并行开发上的实例。
- `RULE-DESTRUCTIVE-GIT-001`（引用）：会丢改动的那几个 git 操作，是这条判据的样板。
