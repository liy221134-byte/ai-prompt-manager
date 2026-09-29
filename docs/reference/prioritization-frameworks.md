---
id: REF-PRIORITIZATION-001
title: 优先级框架对照（9 种）
asset_type: method
purpose: analysis
layer: project
scope: global
project_scale:
  - personal
  - medium
  - large
  - regulated
tech_context:
  - generic
lifecycle_phase:
  - analysis
  - design
status: candidate
confidence: hypothesis
override_allowed: true
compile_target:
  - none
verification: manual
evidence: []
source_references:
  - Claude Skills 的 prioritization-frameworks 技能（外部来源采集 S7，采集台账见 seed-packs/external-sources/README.md 第六节的 S7 行）
related_assets:
  - MTH-REQ-001
version: 0.1.0
last_reviewed: 2026-09-29
---

# 优先级框架对照（9 种）

> 用途：要在多个需求／想法里排序时，先选一个框架，再按它的公式打分。
> 来源：Claude Skills 的 `prioritization-frameworks` 技能（外部来源采集第六批，
> 采集台账见 `seed-packs/external-sources/README.md`）。
> 定位：这是**参考清单**，不是规则——框架会随实践变，别当成铁律用。

## 一条总原则

**不要让用户替你设计解决方案，排的是「问题（机会）」，不是「功能」。**

## 三种推荐用法

### 机会分（Opportunity Score）——排「用户的问题」首选

对每个需求问两件事：**重要度**和**当前满意度**（都归一化到 0～1）：

- 当前价值 = 重要度 × 满意度
- **机会分 = 重要度 ×（1 − 满意度）**
- 创造的价值 = 重要度 ×（改进后的满意度 − 改进前的满意度）

重要度高、满意度低 = 机会分最高。画在「重要度 × 满意度」图上，左上角就是甜点区。

### ICE——快速排「想法／举措」

- **I**（Impact，影响）= 机会分 × 受影响的人数
- **C**（Confidence，信心）1～10
- **E**（Ease，容易度）1～10

**得分 = I × C × E**，高的先做。比机会分多考虑了风险和成本。

### RICE——大团队要更细时用

把 ICE 的「影响」拆成两个因子：

- **R**（Reach）：受影响人数
- **I**（Impact）：单用户价值（就是机会分）
- **C**（Confidence）：信心，0～100%
- **E**（Effort）：工作量（人月）

**得分 =（R × I × C）/ E**

## 9 种框架速查

| 框架 | 适合什么 | 关键点 |
| --- | --- | --- |
| 艾森豪威尔矩阵 | 个人任务 | 紧急 / 重要两轴，管自己的待办 |
| 影响 × 成本 | 任务、举措 | 最简单的 2×2，适合快速分诊，不适合战略决策 |
| 风险 × 回报 | 举措 | 像影响 × 成本，但把不确定性算进去 |
| **机会分** | 用户问题 | **推荐。**重要度 ×（1 − 满意度），先归一化到 0～1 |
| Kano 模型 | 理解用户期望 | 必备型 / 期望型 / 兴奋型 / 无差异 / 反向。用来**理解**，不是用来排序 |
| 加权决策矩阵 | 多因素决策 | 给标准加权再打分，适合拉干系人对齐 |
| **ICE** | 想法、举措 | 影响 × 信心 × 容易度，适合快速排序 |
| **RICE** | 规模化的想法池 | 在 ICE 上加「触达」，除以工作量 |
| MoSCoW | 需求范围 | 必须 / 应该 / 可以 / 不做。**注意**：它来自项目管理，别拿它排产品价值 |

## 使用时注意

- 同一批需求只用一个框架，混用等于没排序。
- 打分前先把「影响」的口径写下来（谁受益、受益多少），否则分数没法复核。
- 框架是帮人达成一致的，不是替人做决定的：算完还要有人拍板。
