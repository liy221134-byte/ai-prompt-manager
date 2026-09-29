---
id: MTH-TEAM-STAKEHOLDER-001
title: 干系人地图：谁影响、谁被影响
asset_type: method
purpose: collaboration
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
status: candidate
confidence: hypothesis
override_allowed: true
compile_target:
  - none
verification: manual
evidence: []
source_references:
  - 产品经理方法技能（外部来源采集 S7 的 7 个团队管理方法之一，台账见 seed-packs/external-sources/README.md 第六节的 S7 行）
  - 通用干系人分析（权力 / 利益矩阵）实践
related_assets:
  - MTH-REQ-001
  - MTH-TEAM-MEETING-001
version: 0.1.0
last_reviewed: 2026-09-29
---

# 干系人地图：谁影响、谁被影响

## 核心结论

开工前画出干系人矩阵（影响力 × 利益），决定沟通频率与参与深度，避免关键人掉线或过度打扰。

## 使用条件

- 新项目 / 新版本启动。
- 涉及多方（老板、客户、运营、研发）时。

## 不适用场景

- 纯个人项目，没有需要对齐的外部方。

## 执行方法

1. 列出所有相关方，标注关注点与诉求。
2. 按「影响力 × 利益」分四象限：
   - 高影响高利益：重点管理，频繁对齐。
   - 高影响低利益：令其满意，定期通报。
   - 高利益低影响：及时告知，邀请反馈。
   - 双低：监控即可。
3. 为每类定沟通节奏（周报 / 双周会对齐 / 里程碑同步）。
4. 识别隐性关键人（不署名但能否决）。
5. 定期更新，人员变动即重画。

## 失败模式

- 只盯老板，忽略执行层。
- 对低利益方完全不沟通，引发反弹。
- 地图画完不用，信息仍靠口头。

## 验证证据

- 关键决策前相关方已对齐。
- 无「怎么没人告诉我」事件。

## 相关资产

- `MTH-REQ-001`（需求澄清时同步对齐关键干系人）。
- `MTH-TEAM-MEETING-001`（按沟通节奏开会与留痕）。
