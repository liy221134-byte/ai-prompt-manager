---
id: RULE-DESTRUCTIVE-GIT-001
title: 共享检出里丢改动的 git 操作要先获批，且任何检出都禁用 stash
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
  - regulated
lifecycle_phase:
  - build
status: candidate
confidence: hypothesis
override_allowed: true
compile_target:
  - none
verification: manual
evidence: []
source_references:
  - Exomem（github.com/Artexis10/exomem）仓库的 agent 指引分册 worktrees：Concurrent sessions share ONE checkout 一节
  - MemOS（github.com/MemTensor/MemOS）仓库根约定文件的 Never do 一节（禁止 force push 与 reset --hard）
  - 采集台账：seed-packs/external-sources/README.md（来源 S9）
related_assets:
  - RULE-WORKTREE-001
  - CASE-PARALLEL-001
  - RULE-AI-WRITE-001
version: 0.1.0
last_reviewed: 2026-09-30
---

# 共享检出里丢改动的 git 操作要先获批，且任何检出都禁用 stash

## 核心结论

判据是「这个操作会不会让某个没提交的改动消失」，不是背一张禁用命令清单。
凡是会丢弃未提交改动、或重写工作树的 git 操作，在共享检出里**必须先拿到明确同意**。

四类要批：切分支（checkout／switch，会换掉工作树里的文件）、reset --hard、
丢单个文件的现场（checkout -- 文件 / restore / clean）、会重写工作树的 rebase 与 merge。

另有一条**无条件禁令：任何检出都禁用 `git stash`**。原因是 stash 栈属于**仓库**不属于
工作树（`refs/stash` 是仓库级的），多个工作区共用同一份；`pop` 取的是栈顶，可能是别人
压进去的。更麻烦的是 `git stash push -- <路径>` 在这些路径本来就干净时会**零退出但什么
都没存**，紧接着的 `pop` 就静默作用到别人的条目上。

## 使用条件

- 两个或更多会话共用同一个检出时，这条是硬约束。
- 动手前问一句：这个操作会不会让某个未提交的改动消失。

**免批白名单**——共享检出里可以随时做：

1. 只读 git：`status`、`log`、`diff`、`fetch`。
2. 干净状态下的 `git pull --ff-only`：它只会前进，要冲突时**拒绝**而不是覆盖。
3. 不碰 git 树的操作：装依赖、跑服务、改你自己刚建的那个文件。

## 不适用场景

- 你独占的一次性检出，且确认没有第二个会话在跑：白名单之外的操作风险低，但建议仍说一声。
- 已经在隔离工作区里做本任务的改动：那条路径上的操作不涉及别人的现场。

## 判断步骤

1. 分类：这个操作属于「丢现场」还是「只前进」。
2. 丢现场 → 停，说清「会丢什么」，拿到明确同意再做。
3. 不同意或拿不准 → 换成不丢改动的做法：要跟某个提交比对，就另起一个一次性工作区去看，
   不动原来的现场。
4. 未提交的任务成果必须临时让路 → 在任务工作区里做一个**临时提交**，不要用 stash、
   也不要用 checkout／restore 把它藏起来。

## 失败模式

- 把「记住的禁用命令清单」当安全规则：清单没覆盖到的操作照做，照样出事。
- 在共享检出里切分支，把别人正在改的文件换掉（已经发生过编辑中的碰撞）。
- `git stash pop` 拉到别人的成果并静默半应用（已经发生过：半应用了另一个会话的依赖
  锁文件改动，跑出了一个假失败）。
- `git stash push` 指定路径时零退出、无提示，让人误以为已经存好了。

## 验证证据

- 抽查任意一次「丢现场」操作，能说清：它属于哪一类、谁批的、批的是哪一次。
- 仓库里不出现「没人认领的改动」——即被 pop 错工作区那一类事故的痕迹。
- 做一次低成本演练：在临时仓库里把工作树弄脏，验证「零退出但没存」这个行为，
  确认执行的人真的知道这条，而不只是读过。

## 相关资产

- `RULE-WORKTREE-001`（相关）：那条给的是隔离工作区的四条硬规则，这条给的是
  在共享检出里动手时的动作判据；两条配合使用。
- `CASE-PARALLEL-001`（相关）：多会话并行重复实现，和这里是同一类事故的两种表现。
- `RULE-AI-WRITE-001`（相关）：同属「不许静默覆盖别人的东西」这一族。
