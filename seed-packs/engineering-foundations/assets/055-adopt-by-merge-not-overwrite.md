---
id: RULE-ADOPT-NOT-OVERWRITE-001
title: 接管既有环境先备份、合并、打差异，你没建的文件算别人的
asset_type: rule
rule_type: must
purpose: development
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
  - release
status: candidate
confidence: hypothesis
override_allowed: true
compile_target:
  - none
verification: manual
evidence: []
source_references:
  - Exomem（github.com/Artexis10/exomem）仓库说明的安装一节：不是它建的配置文件当作用户的，先备份再合并、并把差异打印出来
  - Exomem 仓库说明的接管既有资料一节：只读扫描在前、明确复制在后，原有文件保持不动
  - 采集台账：seed-packs/external-sources/README.md（来源 S9）
related_assets:
  - RULE-AI-WRITE-001
  - MTH-TECH-001
  - TPL-TECH-001
version: 0.1.0
last_reviewed: 2026-09-30
---

# 接管既有环境先备份、合并、打差异，你没建的文件算别人的

## 核心结论

工具第一次接管一个**已经存在**的环境（写配置、装依赖、接 MCP、初始化目录、导数据）时，
默认动作必须是**合并**，不是覆盖。三条：

1. **不是它建的文件，当作用户的**——合并不覆盖。
2. **动手前先备份**，并说清备份在哪。
3. **把合并后的差异打出来给人看**。

重跑一次接管动作必须是**幂等**的：已经做过的步骤报「已跳过」，不重做、不覆盖。

## 使用条件

- 安装脚本、初始化向导、导入工具第一次接触一个非空环境时。
- 换环境交付：同一套东西要在别人的机器上落地时。

## 不适用场景

- 全新空环境：没有可覆盖的东西，这套流程自然不触发。
- 用户明确说「这套配置我不要了，直接覆盖」：属于当次显式授权，仍要留一句记录说明覆盖了什么。

## 判断步骤

1. 先扫一遍目标环境：哪些文件是这次要写的，哪些是本来就有的。
2. 本来就有的 → 备份 → 合并 → 打印差异。
3. 新写的 → 正常写，但也要出现在差异里。
4. 结束时报三样：改了哪些文件、各自改了什么、备份在哪。

## 失败模式

- 一次性覆盖掉用户手写的配置，用户事后不知道原来有什么。
- 合并了但不说改了什么：用户下次看到陌生配置，无法判断来源与去留。
- 备份了但没告诉备份路径，等于没备份。
- 「重跑一遍安装」把用户后来的调整抹掉——说明幂等没做。
- 把「合并」理解成「我读一遍再整份写回去」，实际仍然覆盖了并发改动。

## 验证证据

- 接管前后各留一次差异对比，能看出只增加了什么。
- 备份文件存在，且交付说明里能指名路径。
- 对同一环境重复执行接管动作：第二次只报「已跳过」，文件内容不变。

## 相关资产

- `RULE-AI-WRITE-001`（相关）：那条管 AI 写内容时不静默覆盖；这条把同一条纪律
  延伸到「工具接管你的环境」这个场景。
- `MTH-TECH-001`（引用）：接管方式的取舍属于技术选型的一部分。
- `TPL-TECH-001`（引用）：接管了哪些配置、怎么回滚，写进技术档案。
