# 操作者训练包

## 用途

工程方法种子资产包管的是「AI 该守什么规矩」；这个包管的是「**人该怎么指挥 AI**」——
面向零代码或低代码用 AI 交付软件的操作者（先是本人，将来是要带的同事）。

来源有三条：本项目两轮开发的真实经验、成熟工具与资料里的方法（superpowers、12-Factor
Agents），以及豆包整理的外部来源评估（`seed-packs/external-sources`）。

## 和工程包的关系

| | 工程方法种子资产包 | 操作者训练包（本包） |
| --- | --- | --- |
| 训练对象 | AI | 人 |
| 回答的问题 | AI 该守什么规矩 | 人该怎么指挥 AI |
| 编译产物 | `AGENTS.md` / `START_PROMPT.md` | 操作手册、检查清单（**还没实现**） |

两条约定：

1. **每条人的动作都回链到 AI 规则**：资产的 `related_assets` 指向工程包里对应的规则，
   凡是需要 AI 配合的部分，最终都落在 `AGENTS.md` 里。
2. **暂不动 schema**：`compile_target` 现在只有 `agents`、`readme`、`start_prompt`、
   `template`、`none`，没有「操作手册」这一项，所以本包的资产都填 `none`
   （意思是"不编译进 AGENTS.md"）。等这一包真用过一轮，再决定要不要加编译去向。

## 当前版本

- 版本：`0.1.0`（试装第一批 9 条）
- 状态：`candidate`，等产品负责人确认后升 `active`
- 覆盖模块：心法、M2 派活、M3 驭程、M4 验收、M5 排错、M7 沉淀
- 未覆盖：M1 开工（`templates/new-project/START_PROMPT.md` 和工程包 `MTH-REQ-001` 已覆盖）、
  M6 上线（工程包 `PLAYBOOK-RELEASE-001`、`PLAYBOOK-INCIDENT-001` 已覆盖）

## 怎么装进产品

```bash
npm run pack:operator
```

生成 `seed-packs/operator-training/operator-training.pack.json`，在产品里走
「导入规则包」装进项目；方法、流程类落成规则资产，模板类落成模板资产，都带包内编号
（例如 `OPS-SESSION-001`），以后能按包筛选。

## 去重说明

- 与工程包不重复：工程包讲"该怎么做工程"，本包讲"人怎么操作 AI"。
- 与提示词不重复：那些是让 AI 干活的正文，本包是给人看的操作动作。
- 每条资产的 `related_assets` 都指回工程包里对应的规则或模板，方便对照。

## 版本变化

### 0.1.0

- 试装第一批 9 条：指挥官心法、需求翻译、给上下文、会话管理、思考等级与成本、
  黑盒验收五状态、让 AI 自测、让 AI 找根因、踩坑→规则。
- 格式门禁：`tests/operator-pack.test.mjs` 随 `npm run check` 执行，校验字段、取值、
  章节、模块/难度取值和跨包引用。
