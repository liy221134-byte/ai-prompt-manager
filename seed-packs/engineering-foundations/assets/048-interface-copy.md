---
id: RULE-DESIGN-COPY-001
title: 界面文案也是设计
asset_type: rule
rule_type: must
purpose: development
layer: project
tech_context:
  - generic
priority: p1
scope: global
project_scale:
  - personal
  - medium
  - large
  - regulated
lifecycle_phase:
  - design
  - build
status: candidate
confidence: hypothesis
override_allowed: true
compile_target:
  - agents
verification: manual
evidence: []
source_references:
  - Claude Skills 的 frontend-design 技能「More on writing in design」一节：从用户视角命名、按钮说清结果、同一动作同名、错误与空状态的处理
  - seed-packs/external-sources/README.md（采集台账与来源说明）
related_assets:
  - RULE-DESIGN-TEMPLATE-LOOK-001
  - MTH-DESIGN-GATE-001
  - RULE-EVIDENCE-BOUNDARY-001
version: 0.1.0
last_reviewed: 2026-09-28
---

# 界面文案也是设计

## 核心结论

界面里的字是**设计内容**，不是装饰。五条：

1. **从用户视角命名**：用户管理的是「通知」，不是「webhook 配置」——名字用用户听得懂的话，不用系统怎么实现的话。
2. **主动语态，按钮说清做完会发生什么**：「保存修改」，不是「提交」。
3. **同一个动作贯穿流程用同一个词**：按钮写「发布」，提示就该是「已发布」。用词一致，是人学会这套界面的路标。
4. **错误不道歉、不含糊；空状态是行动邀请**：说清出了什么事、怎么修；空页面要告诉人下一步能做什么。
5. **每段文字只干一件事**：平实动词、句子大小写、删掉填充词。

## 使用条件

- 写按钮、菜单、表格列名、表单标签、提示语、空状态、错误提示、引导文案时。
- 定稿档和沿用档的界面都适用。

## 不适用场景

- 营销页面里刻意的品牌语言——那是另一个工种。
- 项目已经定了术语表：按术语表执行，不逐条重命名。

## 判断步骤

1. 先问这段字要帮人做成什么。
2. 按「用户会怎么理解」命名，不按系统实现命名。
3. 按钮写成它会带来的结果；同一个动作全流程同名。
4. 错误写清「发生了什么 + 怎么修」，不道歉、不含糊。
5. 空状态给一个明确的下一步。
6. 通读一遍：每段是不是只干一件事，有没有填充词。

## 失败模式

- 界面上出现「提交」「确定」这类没说清结果的动作。
- 同一个动作在不同地方换了三个名字（创建 / 新增 / 添加）。
- 错误提示只有「操作失败」或者一句道歉，不给出路。
- 空状态是一句「暂无数据」，没有下一步。
- 每段文字想说三件事，结果一件都没说清。

## 验证证据

- 界面上能直接指出：按钮写的是结果、同一个动作同名、错误和空状态都有下一步。
- 抽查一条流程：按钮名、提示语、结果状态用的是同一个词。

## 相关资产

- `RULE-DESIGN-TEMPLATE-LOOK-001`（配套）：视觉和文字一起避免模板味。
- `MTH-DESIGN-GATE-001`（上游）：先澄清要做什么，再决定怎么写。
- `RULE-EVIDENCE-BOUNDARY-001`（相关）：文案改动的验收要真打开页面看，不能只读代码。
