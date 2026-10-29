# 验收：v4 题库补格（145 格无空格）

- 版本：内容补齐（对应 PRD 成功标准第 2 条）
- 日期：2026-10-29
- 状态：**全部验收项通过**（生产库实测 + 自动化 868 项）
- 代码与内容：`docs/learning/topics/rk-mid-integration.yaml`（唯一真源），未改任何运行时代码

## 一、这一版做了什么

PRD 成功标准第 2 条要求「145 个格子每格 ≥1 题」。补之前实测**56 格是空的**（占 39%），
而且不是集中在 L5——诊断卷要抽的 L1—L4 各缺 9—14 格，`modules × levels` 的模块口径掩盖了这一点。

这次按「知识点 × 层级」逐格补，共 **56 道新题**（单选 47 道、实操 9 道），题库 **118 → 174**。

题目全部依据主题包里该知识点的讲义（`note.body` 的要素 / 例题 / 怎么考三段）来写，
不引入教材外的说法；每题的解析写清「为什么错」，而不是只给正确答案。

## 二、填空分布（补之前 → 补之后）

| 模块 | 空格数 | 新题 |
| --- | --- | --- |
| S1 项目管理框架 | 12 | RK-S1-018 ~ 029 |
| S2 五大过程组实操 | 14 | RK-S2-024 ~ 037 |
| S3 信息技术基础 | 16 | RK-S3-029 ~ 044 |
| S5 法规与职业道德 | 5 | RK-S5-018 ~ 022 |
| S6 应试专项 | 9 | RK-S6-018 ~ 026 |
| **合计** | **56** | **56** |

S4 本来没有空格，未动。

## 三、验收项

### 1. 空格归零

```sql
select count(*) from (
  select kp.id, lv from knowledge_points kp
  cross join generate_series(1,5) lv
  left join (select knowledge_point, level, count(*) cnt from practice_questions
             where topic_id='rk-mid-integration' group by 1,2) q
    on q.knowledge_point=kp.id and q.level=lv
  where kp.topic_id='rk-mid-integration' and coalesce(cnt,0)=0
) t;
```

结果：**0**（补之前 56）。

### 2. 每格题数分布（145 格）

| 该格题数 | 格数 | 补之前 |
| --- | --- | --- |
| 0 题 | **0** | 56 |
| 1 题 | 122 | 66 |
| 2 题 | 18 | 18 |
| 3 题 | 4 | 4 |
| 4 题 | 1 | 1 |

按层：L1 29 格 36 题 · L2 29 格 35 题 · L3 29 格 35 题 · L4 29 格 37 题 · L5 29 格 31 题。

### 3. 诊断卷取题池够用

诊断卷按「模块 × L1—L4」抽 24 题。24 格的最小值现在都是 **3 题**（S4 的 L2/L3/L4、S6 的 L2），
不会再出现「这层没题」被当成「你不会」。

### 4. 主题包自带的题库纪律仍满足

`question_policy` 声明 `per_kp_min: 3` 与 `require_open_question_per_kp: true`：

- 每个知识点题量 **≥3**（实测无缺口）
- 每个知识点**至少 1 道实操题**（实测无缺口）

### 5. 判分字段逐题核对

新题的类型、层级、知识点、选项数、答案全部逐条查过，不是只看导入日志：

- 单选 47 道：`options` 4 项、`answer` 为 A/B/C/D 之一
- 实操 9 道：`options` 为空数组、`answer` 是参考答案文本
- 全部挂对了 `knowledge_point` 与 `module_id`

（这一条是项目踩过的坑：导入器曾漏写 `type`，34 道实操题被列默认值静默写成单选，
导入日志照样报成功。）

### 6. 自动化测试无回归

`npm test`：**868 / 868 通过**（9.4 秒）。

## 四、顺带修掉的一个问题：答案扎堆在 B

补题时发现整个题库**答案严重偏斜**：单选 131 道里 B 占 73 道（56%）、D 只有 6 道（5%）。
这不是这次新题才有的问题，旧题同样如此——学生做几套就能摸出「不会就选 B」。

已做重平衡，做法是**只交换正确项与目标位置项的文本**，其余两个选项位置不动：

- 改动 36 道，答案位置分散到 A/C/D
- 只挑**解析里不含「A 」「B 」这类字母引用**的题改，避免解析指向错位
- 改完硬校验：每题的**选项集合**与改动前完全一致、**正确答案的文本**完全一致，
  通过 31 题（其余 5 道是本次新增，旧版无对照）

结果分布：**A 33 / B 37 / C 33 / D 28**（原 24 / 73 / 28 / 6）。

一条没法自动化的部分：值不值得为了分布打乱选项的「自然顺序」（如数值从小到大）。
这次也打乱了，理由是真卷选项本就不按大小排，学生不该靠顺序蒙。

## 五、已知边界（不在本次范围）

1. **122 格里仍只有 1 道题**（占 84%）。PRD 只要 ≥1，这条已达标；但同一知识点同一层
   再练一次会出同一道题。要做到「每格 ≥2 题」还得再补约 122 道，是下一批的工作量。
2. **M5 对话式追问的容量仍不足**。当初判定「不做按层连问」的依据就是单题格太多，
   这次把 0 题格清零、单题格从 66 增到 122，但「每格 2 题」的前提仍未满足。
   连问如果要恢复，得等第 1 条做完。
3. **`weight` 仍是估算值**（缺历年真题分值统计），本次未动——它属于内容研究，不是补题。
4. 新题只进了 `rk-mid-integration` 一个主题，旧题库（135 道无主题）未涉及。

## 六、怎么复验

```bash
# 主题包能不能通过导入器的全部校验（不写库）
node scripts/import-topic-pack.mjs docs/learning/topics/rk-mid-integration.yaml --dry-run

# 幂等导入（重复跑只更新不新增）
node --env-file=.env.local scripts/import-topic-pack.mjs docs/learning/topics/rk-mid-integration.yaml

# 空格数与分布（上面第三节的 SQL 直接可跑）
node scripts/db-sql.mjs --sql "select count(*) as 空格 from (select kp.id, lv from knowledge_points kp cross join generate_series(1,5) lv left join (select knowledge_point, level, count(*) cnt from practice_questions where topic_id='rk-mid-integration' group by 1,2) q on q.knowledge_point=kp.id and q.level=lv where kp.topic_id='rk-mid-integration' and coalesce(cnt,0)=0) t"
```
