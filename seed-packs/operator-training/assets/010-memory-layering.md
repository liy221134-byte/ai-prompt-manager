---
id: OPS-MEMORY-001
title: 记忆分层：哪些事该让 AI 记，哪些事该写进文档
asset_type: principle
audience: human
module: 心法
difficulty: L2
purpose: collaboration
layer: project
tech_context:
  - generic
lifecycle_phase:
  - build
  - operate
priority: p0
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
  - Exomem（github.com/Artexis10/exomem）仓库根约定文件的 Memory boundary 一节：助手原生记忆只当短期与行为记忆，长期受治理的知识单独存
  - Exomem 的助手使用指南：偏好与路由归原生记忆，项目背景、决策、证据、可复用结论归受治理的长期库
  - 采集台账：seed-packs/external-sources/README.md（来源 S9）
related_assets:
  - OPS-CONTEXT-001
  - OPS-SESSION-001
version: 0.3.0
last_reviewed: 2026-09-30
---

# 记忆分层：哪些事该让 AI 记，哪些事该写进文档

## 核心结论

不要把「AI 记住我」当成一件事。分两层放，各管各的：

| 放哪儿 | 放什么 | 特征 |
| --- | --- | --- |
| AI 的**原生记忆**／自定义指令 | 偏好、习惯、怎么跟你说话、常用路径 | 短期的、行为层面的 |
| **受治理的文档库**（你的仓库、资产库、笔记） | 项目背景、做过的决定、踩过的坑、证据、可复用的结论 | 长期的、要能被搜到、被引用、被推翻的 |

一句话判据：**这件事将来要不要被找到、被引用、被推翻？** 要，就写进文档，别指望 AI 记住。

## 使用条件

- 你会发现同一件事要对不同的 AI 会话重复说第二遍。
- 上一个会话做的决定，新会话不知道。
- 你想让 AI「记住」某个业务规则或项目事实。

## 不适用场景

- 一次性的、这次聊完就不再用的小事：写进文档反而是负担。
- 已经在项目文档里写着的内容：那是让 AI 去读，不是让它记住。

## 判断步骤

1. 想让它记住的东西，逐条问：**换个会话还会用到吗？**
2. 不会 → 留在对话里，不用管。
3. 会、而且是「我怎么跟你配合」 → 放进 AI 的原生记忆或项目规则文件。
4. 会、而且是「这个项目是怎么运作的」 → 写成文档，进仓库或资产库。
5. 文档写完，新会话的第一件事是**先读文档**，不是让它回忆。

## 失败模式

- 把项目事实当偏好塞进原生记忆：换个工具就丢了，而且人和 AI 都说不清它存在过。
- 反过来，把偏好写成一堆文档：新会话读不完，反而没人看。
- 记忆里存的是结论，但结论的前提没存 → 新会话照着一个过期的结论干活。
- 以为「AI 记得」就可以不写文档：长期记忆最容易在换环境、换工具时归零。

## 验证证据

- 关掉当前会话，新起一个：只给它项目文档，它能接着干——说明该落的都落了。
- 项目文档里能指到至少一条「上个会话做的决定」。
- 偏好类的东西不在文档里、项目事实不在原生记忆里，两边不混。

## 相关资产

- `OPS-CONTEXT-001`（引用）：给 AI 有效上下文是这一层的操作面。
- `OPS-SESSION-001`（引用）：换会话之前按那条把该落的落下来。
- `MTH-ASSET-LAYER-001`（引用）：文档这边再按三层分——方法、项目实例、可复用骨架。
- `MTH-SINK-001`（引用）：哪些内容值得从对话沉淀成文档，按那条判断。
