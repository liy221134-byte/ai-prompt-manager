# 验收：线索 3 生态采集沉淀 · M0（零代码）

日期：2026-09-29
对应设计文档：`docs/leads-3-design-and-tasks.md`（v0.2.0）
分支：`feat/leads-3-m0`（基于 `main` `c8b99be`）

## 一、范围

M0 只做零代码文档活：S7 剩余技能处置落地 + 采集台账补四字段 + 两条参考文档规范化 +
七个团队管理方法资产新建 + 三个模板层资产核对。M1（进产品只读视图）、M2（采腾讯生态）不在本版。

## 二、验收标准与判定

| # | 验收标准 | 判定 | 证据 |
| --- | --- | --- | --- |
| 1 | S7 剩余技能每个都有明确处置结论，无"待定" | ✅ 通过 | 设计文档第三节处置表 16 项全部定稿（不采 2、进模板层 3、进参考文档层 2、单独立片 7、不相关 1、暂缓 1），台账 S7 行与处置表一致 |
| 2 | 台账每条来源都能看到四字段：来源链接 + 核实日期 + 处置结论 + 落到哪条资产 | ✅ 通过 | `seed-packs/external-sources/README.md` 第六节 23 条来源全部补齐四字段；原「采集日期」已统一改名为「核实日期」 |
| 3 | 进参考文档层的 2 条、团队管理片都写了 `source_references`、默认 `candidate`/`hypothesis` | ✅ 通过 | `docs/reference/prioritization-frameworks.md`、`ui-checklist.md` 加 frontmatter（REF-PRIORITIZATION-001 / REF-UI-CHECKLIST-001）；`docs/team-methods/` 七个资产（MTH-TEAM-OKR-001 等）均带 `source_references` + `status: candidate` + `confidence: hypothesis` |
| 4 | 不重复建已存在的 3 个模板层资产（核对通过即算完成） | ✅ 通过 | `templates/methods/{user-story,job-story,wwa}.md` 已存在（v2.25.0 落地），均引用 `MTH-REQ-FORMAT-001`，与 S7「进模板层」处置一致，未重建 |
| 5 | 改动都经你逐次点头后落地，无未经确认的资产库写入 | ✅ 通过 | T3/T4 实建经用户 2026-09-29 拍板（原设计门拟"先只记账"，本次改为实建）；仅改动仓库文档，未写入云端生产库、未动 `src/` |

## 三、验收结论

**M0 全部 5 条验收标准通过，可签核。**

- 交付物：采集台账四字段（23 条来源）、2 条规范化参考文档、7 个团队管理方法资产（独立片 `docs/team-methods/`）、3 个模板层资产核对完成。
- 未决项：无。M1/M2 按立项留待后续版本；M1 已在 `docs/leads-3-4-requirements-draft.md` 立项定义（"进产品只读视图 + 检查"），本轮不做。
- 备注：资产文件为仓库内文档（`docs/reference/`、`docs/team-methods/`），尚未导入本机/云端资产库；如需进库，走 `scripts/import-local-content.ts` 同步（只写本机，不碰云端），可另立一项做。

## 四、本次规则命中

无。本版为纯文档活，未违反 `AGENTS.md` 已写规则；设计偏差（T4 由"先只记账"改为"实建"）经用户 2026-09-29 明确拍板，不计入命中。
