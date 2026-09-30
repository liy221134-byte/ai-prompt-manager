---
id: RULE-DANGEROUS-TOOLS-SWITCH-001
title: 危险工具面独立成层，默认可一键关掉
asset_type: rule
rule_type: must
purpose: safety
layer: project
tech_context:
  - generic
priority: p0
scope: global
project_scale:
  - medium
  - large
  - regulated
lifecycle_phase:
  - build
  - operate
status: candidate
confidence: hypothesis
override_allowed: true
compile_target:
  - none
verification: manual
evidence: []
source_references:
  - Exomem（github.com/Artexis10/exomem）仓库说明：把列目录、建文件、移动页面、清空回收站这类文件系统逃生口归为第二层工具，并提供一个环境变量把它们整体隐藏
  - Exomem 的助手使用指南：真正的修复写入由宿主运维口执行，远端工具只做审计与试运行
  - 采集台账：seed-packs/external-sources/README.md（来源 S9）
related_assets:
  - RULE-PG-PRIVILEGE-001
  - RULE-BOUNDARY-001
  - RULE-APPROVAL-IS-EXPLICIT-001
version: 0.1.0
last_reviewed: 2026-09-30
---

# 危险工具面独立成层，默认可一键关掉

## 核心结论

把「能移动、删除、清空回收站、跨目录操作」这类**不可逆**能力，从日常能力里切出来
单独一层，并给整层配一个开关，关掉之后这些能力**直接在工具清单里看不到**。

理由很朴素：Agent 平时用不上它们，但只要它们存在，迟早会被用上。

## 使用条件

- 系统把能力以「工具／接口」的形式暴露给 Agent 或脚本时。
- 工具清单里出现任何不可逆动作时。

## 不适用场景

- 单人本地、没有 Agent 接入的一次性脚本。
- 环境本身就是一次性的（容器、临时沙箱），删了也不心疼。

## 判断步骤

1. 分两层：**日常能力**（读、搜、写新内容）与**危险能力**（移动、删除、清空回收站、
   跨目录批量操作）。
2. 危险层给一个独立开关；关掉后连能力描述都不出现。
3. 验证关掉之后主流程仍然跑得通——跑不通说明分层没切干净。
4. 把「这一层有哪些能力」列成清单，纳入交接材料。

## 失败模式

- 危险能力默认开着，而且没有任何开关。
- 开关存在，但关掉之后主流程报错：说明日常能力偷偷依赖了危险能力。
- 用「我在提示词里写了不许删」代替真实的能力开关——那是靠自觉，不是靠设计。
- 工具一层平铺，Agent 分不清哪个是只读、哪个会改文件。

## 验证证据

- 关掉危险层跑一遍主流程：主流程通、危险工具确实不在清单里。
- 工具清单能按层列出能力，交接时能一眼看出「哪些是不可逆的」。
- 抽查一次 Agent 操作记录：在危险层关闭的状态下，没有任何一次不可逆动作发生。

## 相关资产

- `RULE-PG-PRIVILEGE-001`（同源）：那条管数据库连接只用最小权限，这条把同样的
  「默认最小能力」用在工具面上。
- `RULE-BOUNDARY-001`（相关）：工具边界也是接口契约的一部分。
- `RULE-APPROVAL-IS-EXPLICIT-001`（引用）：危险层开着的时候，每次不可逆动作
  按那条走——要有单独一次明确同意。
