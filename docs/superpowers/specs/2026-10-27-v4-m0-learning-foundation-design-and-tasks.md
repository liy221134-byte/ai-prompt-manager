# v4 学习系统 M0：数据地基 · 设计 + 任务清单（设计门）

日期：2026-10-27
输入：
- PRD `docs/requirements/v4-learning-system-prd.md`（2026-10-27 已确认，本文的唯一上游）
- 全线规划 `docs/learning/v4-plan.md`（路线评估，含能力五层定义）
- 中项主题包 `docs/learning/topics/rk-mid-integration.yaml`（同批产出，用于反向验证 schema）
- 仓库实测：`practice_questions` 云端**实际 135 行**（2026-10-27 用 service key 查得）、`difficulty` 字段已存在。
  **更正**：此前的「119 题」是数迁移文件得出的，漏掉了后续补录的 16 题；「127 题」是更早的文档数。以 135 为准。

本次需求：**只做数据层**。定死主题包 schema、补齐字段、建好四张表、让中项主题包能导入。
状态：**已确认（2026-10-27 拍板），可开工**。

**拍板结论**
1. 第一节两处需求偏差 → **按「改需求」处理**，见第一节。
2. 任务量级 T1—T6 → **接受**。
3. down 迁移 → **不写**（纯新增，无破坏性）。
4. **新增第 7 条改动**：`learning_stages` 表名改 `learning_modules`，题目表加 `level` 字段。理由见第二节末「一处改名」。

---

## 一、先处理两处需求偏差（设计阶段发现需求不成立）

按 `AGENTS.md` 交付门第 5 条，偏差单列，由你决定改设计还是改实现。**我建议都改需求**，理由如下。

### 偏差 1：`difficulty` 不是"新增字段"，是"已有字段回填"

需求草案第四节写"加 `difficulty`"。实测建表语句里已经有：
`difficulty text not null default 'medium'`。

**处理**：M0 不新增该字段，只在回填任务里给它填真实值。需求草案该处应改为「回填 `difficulty`」。

### 偏差 2：现有 135 题的打标，不该放在 M0

需求草案第七节验收标准有一条「`knowledge_point` 空值为 0」，指的是 135 题全部打标。

**这条在 M0 做不到，原因不是工程量，而是逻辑顺序**：
- 135 题的 `category` 属于**AI 编程**主题（Web 与接口基础、AI 编码基础、工程化与质量保障…）
- 中项主题包是**软考**主题
- 要给 135 题打 `knowledge_point`，得先有**「AI 编程」主题包的知识点树**——那是另一套内容工作

**处理**：M0 的验收标准改为「新导入的题 100% 有 `knowledge_point`」；
135 题打标单列为 **M0.5**（依赖 AI 编程主题包知识点树，另立需求）。
理由：一次迭代只做一件事，M0 的目标是验证 schema，中项主题包已经足够验证，不必同时动两套主题的内容。

**以上两处，已于 2026-10-27 裁定为「改需求」，需求草案已按此改口径，并被 PRD 取代。**

---

## 二、做什么 / 不做什么

### 做什么

1. **定死主题包 schema**，写成 `docs/learning/topic-pack-schema.md`（正本，独立于本文件）。
2. **迁移补字段**：
   - `practice_questions` 加 `knowledge_point` / `source` / `source_url` / `topic_id` / `module_id` / `level`
   - `practice_attempts` 加 `duration_ms` / `context`
3. **新建四张表**：`learning_topics` / `learning_modules` / `knowledge_points` / `learning_diagnostics`。
   本版只建表与索引，**不写业务逻辑**。
4. **主题包导入器**：`scripts/import-topic-pack.mjs`，读 yaml → 写三张表 + 题目。
   幂等：同一 `topic.id` 重复导入不产生重复行。
5. **用中项主题包跑通导入**，作为本版的核心验收证据。

### 不做什么

- **不改任何界面**（`/practice` 一个像素都不动）
- 不做诊断、自适应出题、素材表、知识图谱
- 不改进现有练习流程（筛选、错题重练、两栏布局、随机练习）
- 不做多用户、权限、分享
- **不给现有 135 题打标**（见偏差 2，移到 M0.5）
- 不写完整的 AI 编程主题包

### 一处改名：`learning_stages` → `learning_modules`

**为什么在 M0 就改，而不是等 M1**：
原表名用的是 `stages`，而 v4 全线规划（`docs/learning/v4-plan.md` 判断 1）已经确认
**现在的 S1—S6 是内容分区，不是能力阶梯**。表名叫 stage，代码里每个变量、每条 SQL、
每个界面标签都会顺着叫错，最后这个错会固化进产品语言。

**现在改的成本是零（表还没建），M1 之后再改是迁移 + 全链路改名。**

配套定义（本版落地）：

| 项 | 定 |
| --- | --- |
| 内容模块 | `learning_modules`，6 行/主题，带 `weight`（占分，estimate）与 `planned_hours` |
| 能力层级 | **不建表**。L1—L5 是固定枚举，用 `practice_questions.level smallint check (level between 1 and 5)` 约束 |
| 为什么层级不建表 | 五层是产品定义的一部分，不是数据。建表会让人以为可以随意加层，而层级一旦变，诊断矩阵和历史数据全部失效 |

**L1—L5 的定义**（正本在 PRD 第二节第 2 条，此处只落数据约束）：
1 = 认得 · 2 = 说得出 · 3 = 算得出 · 4 = 判得准 · 5 = 迁得动。
`level` 允许为空——存量 135 题属于 AI 编程主题，M0 不打标（见偏差 2）。

---

## 三、数据与产品行为影响

- 新增 6 个字段，全部可空或带默认值 ⇒ **存量 135 题不受影响**，现有查询不会失败。
- `source` 带 `not null default 'manual'` ⇒ 存量数据自动归类，无需回填。
- 新建 4 张表，不被现有代码引用 ⇒ **对现有功能零影响**。
- 导入器是独立脚本，不进前端包 ⇒ 不影响构建体积。
- RLS：新表先按「登录用户可读」建策略，与 `practice_questions` 现有策略一致；
  只给自己用，不做细粒度权限。

---

## 四、任务顺序与改哪些文件

| 任务 | 做什么 | 改哪些文件 | 前置 |
| --- | --- | --- | --- |
| **T1** | schema 正本：字段定义、约束、示例 | `docs/learning/topic-pack-schema.md`（新建） | — |
| **T2** | 迁移：补字段 + 建 4 表 + 索引 + RLS | `supabase/migrations/<新>_add_learning_foundation.sql`（新建） | T1 |
| **T3** | 导入器：yaml → 入库，幂等 | `scripts/import-topic-pack.mjs`（新建） | T2 |
| **T4** | 用中项主题包跑通导入，核对层级 | 不改文件，产出验证记录 | T3 |
| **T5** | 验收文档 | `docs/acceptance/m0-learning-foundation.md`（新建） | T4 |
| **T6** | 文档登记 | `docs/INDEX.md`（加 2 行） | T1–T5 |

**不动**：`src/` 下任何文件、`AGENTS.md`、现有迁移、现有 seed-packs。

---

## 五、schema 定稿（从主题包验证得出的修正）

拿中项主题包真跑一遍之后，`docs/requirements` 里的初版 schema 有三处必须改：

| 发现 | 结论 |
| --- | --- |
| 只有 `weight`（占分）不够 | **必须加 `expected_gap`**（1—5，预判缺口）。权重和缺口是两个维度：信息技术占分 28%，但他零基础，实际投入要 130 小时，比占分 30% 的项目管理还多 |
| `weight` 落不到执行 | **必须加 `planned_hours`**，否则"下一步学什么、学多久"没有依据。中项合计 380 小时，与 `topic.total_hours` 必须相等（导入器要校验） |
| `knowledge_points.parent` 是否必要 | **保留但允许为空**。中项 29 个知识点里只有 2 个有 parent（挣值分析、变更控制挂在监控过程组下）。层级是根因归因用的，不强求每层都填 |

**另有一条格式硬约束（踩过才发现的）**：
yaml 里 `body_md` / `explanation_md` 这类 markdown 字段**必须用 block scalar（`|`）**。
用单行 plain scalar 时，正文里出现 `**加粗**`（被当别名）、`stands for:`（冒号+空格被当 mapping）、
引号都会被 YAML 解析器拒绝。中项主题包第一版就是这样炸的，修了 19 处。
⇒ **写进 schema 文档的硬性要求，导入器也要对这类错误给出可读报错，不要只抛堆栈。**

---

## 六、验收标准（每条可判定）

1. 迁移在本地 / Preview 跑通，无报错。
2. 四张新表存在，`learning_modules` 对 `learning_topics` 有外键、`knowledge_points` 对 `learning_modules` 有外键。
3. `practice_questions` 新增 6 个字段可查，存量 135 题 `source` 全部为 `manual`、`level` 全部为 null。
4. **中项主题包导入成功**：`learning_topics` 1 行、`learning_modules` 6 行、`knowledge_points` 29 行、
   `practice_questions` 新增 12 行。
5. 导入后按 module 查题目能查出正确结果（M1 模块 → 2 题，M2 → 3 题，M3 → 3 题，M4 → 1 题，M5 → 1 题，M6 → 2 题）。
6. 重复跑一次导入器，行数不增加（幂等）。
7. 导入的 12 题 `knowledge_point` 全部非空（对应偏差 2 后的口径）。
8. **现有练习功能不回归**：`/practice` 能打开、能答题、能看错题、能按分类/题型/状态筛选。
9. `npm run check:fast` 通过。

> **本版你在界面上看不到任何变化。** 验收靠我贴出的查询结果和行数统计。

---

## 七、已知限制与风险

1. **M0 之后仍然是"不能诊断的练习器"**。诊断要等 M2，中间隔着 M1（计划导入 + 按阶梯出题）。
2. **中项主题包只有 12 道示例题，覆盖 29 个知识点中的 8 个**。
   按「每个知识点每层至少 1 题」算，完整题库要约 **145 题**（29 × 5），缺口 133 题。
   这是 M1 的主要工作量，不是 M0 的。原估算 87 题（按 `per_kp_min: 3`）**低估了 58 题**——
   因为那份估算没有「能力层级」这一维。
3. **导入器是脚本不是接口**。M0 阶段够用；M1 做界面时若要"在线导入"，需要另行设计上传与校验。
4. **没有回滚脚本**。迁移是纯新增（加字段 + 建表），理论上不回滚也不影响现有功能；
   若要回滚，需手写 down 迁移——M0 不做，先记录。

---

## 八、执行顺序（已确认，可开工）

按 T1 → T6 执行，每步跑 `check:fast`，T4 之后给你验证记录。

**一条边界**：本版对主题包 yaml 只做三件改动，**不动任何数值**。
1. 键名 `stages` → `modules`、`stage_id` → `module_id`（理由同上，名实要对上）；
2. 给 12 道示例题补 `level`（1—5），否则「level 字段可用」没有数据能证明；
3. 别的都不动——`weight` / `planned_hours` / `order` / `expected_gap` 的校准全部放到 **M0.5**
   （诊断结果出来之后）一次改完，`schema_version` 升到 1.1。

理由：这四个数值字段互相约束（weight 合计必须 = 1.0、planned_hours 合计必须 = total_hours），
分开改一定出现中间态不自洽，而 M0 根本不需要它们正确，只需要它们**存在且能导入**。
