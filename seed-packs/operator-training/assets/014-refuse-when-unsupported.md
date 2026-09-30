---
id: OPS-REFUSE-001
title: 环境不支持就让它明说，别让它硬跑
asset_type: method
audience: human
module: M5-排错
difficulty: L1
purpose: collaboration
layer: project
tech_context:
  - generic
lifecycle_phase:
  - build
  - release
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
  - Exomem（github.com/Artexis10/exomem）仓库说明：某个平台上服务直接拒绝运行，并由体检命令说明原因，而不是勉强跑起来
  - Exomem 仓库说明：接管既有资料时先给只读报告，不先动文件
  - 采集台账：seed-packs/external-sources/README.md（来源 S9）
related_assets:
  - OPS-ACCEPT-001
  - OPS-DEBUG-001
version: 0.3.0
last_reviewed: 2026-09-30
---

# 环境不支持就让它明说，别让它硬跑

## 核心结论

当一套东西在某个环境里**本来就不成立**（平台不支持、缺底层能力、缺权限）时，
正确的结果是**明确拒绝并说明原因**，不是想办法让它看起来跑起来了。

你要在提示里给 AI 的指令是：

> 如果这个环境做不到，直接告诉我做不到、为什么，不要用别的办法凑。

## 使用条件

- 换机器、换系统、换运行环境之后第一次跑。
- 装一个新工具、接一个新服务之前。
- 交付给别人之前：先问「你这台机器上它成立吗」。

## 不适用场景

- 你明确要求「先凑一个能看的版本，问题后面再说」：那是显式的降级要求，
  但要它同时说清近似点在哪。
- 纯文档、纯内容类的交付：没有环境依赖。

## 判断步骤

1. 开工前先让它跑一次**环境体检**：这台机器上什么有、什么没有。
2. 缺的关键能力问清楚：是「没装」还是「这个平台根本没有」。
3. 「没装」→ 可以装，但要你先同意；「根本没有」→ 直接放弃这条路，换方案。
4. 交付说明里写清：这个环境成立、那个环境不成立，各自的原因。

## 失败模式

- 工具在半支持的环境里勉强跑起来，结果时对时错，最难排查。
- 用别的方式凑出一个「看起来能跑」的版本，把「做不到」藏起来。
- 体检命令存在但输出没人看得懂，等于没有。
- 换环境交付时才发现整套东西不成立，前面做的全都白做。

## 验证证据

- 在一个确实不满足条件的环境里跑一次：得到的是一句明确的原因，不是一团报错。
- 交付说明里能看到「哪些环境成立、哪些不成立」这一节。
- 体检输出能指名缺的是哪一项能力。

## 相关资产

- `OPS-ACCEPT-001`（引用）：验收时要能区分「跑通了」和「看起来跑通了」。
- `OPS-DEBUG-001`（引用）：环境不成立不是 bug，别按 bug 的路子去修。
- `MTH-TECH-001`（引用）：技术选型时的场景对照，就是提前问「这个环境成立吗」。
