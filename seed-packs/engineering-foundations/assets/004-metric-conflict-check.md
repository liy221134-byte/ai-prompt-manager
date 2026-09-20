---
id: MTH-REQ-002
title: 定量指标与冲突检查
asset_type: method
scope: project
project_scale:
  - medium
  - large
  - regulated
lifecycle_phase:
  - analysis
  - design
status: candidate
confidence: provisional
source_references:
  - docs/acceptance/week-07.md
  - docs/operations/release-rollback.md
related_assets:
  - MTH-REQ-001
  - TPL-ACCEPT-001
version: 0.1.0
last_reviewed: 2026-09-20
---

# 定量指标与冲突检查

## 核心结论

并发、响应时间、吞吐量、可用性和恢复指标必须有场景、负载、环境、统计口径
和验收方法。否则数字无法设计，也无法验收。

## 使用条件

- 需求中出现性能、容量、可靠性和安全数字时。
- 多个章节对同一指标给出不同数值时。
- 指标将直接影响架构、硬件、成本和工期时。

## 不适用场景

- 两套指标面向不同场景且已经明确区分时，不能强行视为冲突。
- 没有业务价值的微小精度差异不应占用过多评审时间。

## 检查步骤

1. 提取所有定量指标。
2. 为每项指标标注业务场景。
3. 标注用户量、请求量、数据量和并发模型。
4. 标注平均值、峰值或分位数。
5. 标注测试环境和是否包含网络、存储和外部系统。
6. 对同类指标进行换算和一致性比较。
7. 建立唯一指标基线和验收方法。

## 失败模式

- 同文档同时出现多个并发用户数。
- 分钟吞吐量与每秒吞吐量混用。
- 端到端响应时间与数据库查询时间混为一谈。
- 指标没有测试环境和数据规模，无法复现。

## 验证证据

- 指标澄清表。
- 指标负责人和确认记录。
- 性能测试模型和验收脚本。

## 相关资产

- `TPL-ACCEPT-001`：将指标转成可验证的验收证据。
