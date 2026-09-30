---
id: OPS-BURDEN-001
title: 它能安全跑的命令，别让它丢给你跑
asset_type: method
audience: human
module: M2-派活
difficulty: L1
purpose: collaboration
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
  - Exomem（github.com/Artexis10/exomem）仓库的 agent 指引分册 worktrees：不要把可以安全自行执行的命令交给用户去跑
  - Exomem 同一分册：共享检出里可以放心自行执行的白名单（只读 git、干净状态下只前进的拉取、不碰代码树的操作）
  - 采集台账：seed-packs/external-sources/README.md（来源 S9）
related_assets:
  - OPS-MINDSET-001
  - OPS-TASK-001
version: 0.3.0
last_reviewed: 2026-09-30
---

# 它能安全跑的命令，别让它丢给你跑

## 核心结论

AI 常常把一个命令贴给你，让你复制到终端里跑。判断标准只有一条：

> **这个操作它自己能安全做完吗？** 能，就别交给你。

交给你跑的成本不只是一次复制粘贴：你不知道结果对不对、出错时看不出是命令错了还是环境错了、
中间还有一次上下文丢失。

只有当操作**动到你正在做的事**、**不可逆**、或**需要你的身份**时才交给你——
而且要交得明白：说清为什么必须你来、会发生什么、怎么退回去。

## 使用条件

- AI 回你一条命令让你「自己跑一下」时。
- 你在派活时写清「哪些你必须自己动手、哪些交给它」。
- 它说「我帮你做了，但我需要你做一步」时。

## 不适用场景

- 操作需要你的账号、你的身份、你的确认：那必须你来。
- 操作不可逆或会丢数据：先经你同意，也由你掌控节奏。
- 操作在你的机器上权限不同、它够不着：那也确实只能你来。

## 判断步骤

1. 收到一条「你来跑」的命令，先问：**它为什么不能自己跑？**
2. 答不出实质理由 → 让它自己跑，并把真实输出贴回来。
3. 理由是「需要你的身份」或「不可逆」 → 你来跑，但要求它给三样：
   为什么必须你来、会发生什么、出问题怎么退。
4. 在项目规则里写死这条偏好，省得每轮都问。

## 失败模式

- 每改一点东西就丢一串命令给你，你变成它的执行器。
- 你跑了、报错，但你分不清是命令的问题还是环境的问题。
- 反过来：它把该让你确认的不可逆操作自己做了——这是两个方向的同一类失衡。
- 因为它怕出错，把所有事都推给你：结果谁都不快。

## 验证证据

- 抽查一轮协作：你手动跑的命令，每条都能说出「为什么必须我来」。
- 项目规则文件里能找到「能自己跑的不要交给用户」这一条。
- 交付说明里，AI 自己跑掉的动作有真实输出贴回来。

## 相关资产

- `OPS-MINDSET-001`（引用）：你是指挥官——指挥包括「拒绝当执行器」。
- `OPS-TASK-001`（引用）：派活时说清边界，其中一条边界就是谁动手。
- `RULE-WORKTREE-001`（引用）：工程包那条白名单，是「它能自己跑」的实例。
