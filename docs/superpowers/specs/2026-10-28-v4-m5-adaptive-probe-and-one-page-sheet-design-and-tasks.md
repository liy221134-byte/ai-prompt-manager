# v4 M5：对话式追问 + 一页素材表（骨架）设计与任务清单

日期：2026-10-28。状态：**待确认**（三个已拍定的方向见下，其余为实现决定，有异议改对应小节）。

上游：
- 需求 `docs/requirements/v4-learning-system-prd.md`（已确认）第二、三节
- 路线 `docs/learning/v4-plan.md` 第一、五节（六环里的「连续拷问」「一页素材表」）
- 前序 `acceptance/v4-m4.md`、`acceptance/v4-m4-5.md`

## 〇、两个已拍定的方向

1. **自适应出题做「对话式追问」**，不做「按知识点把各层的题连问一遍」。
2. **一页素材表这轮只做骨架**：六段模板 + 保存 + AI 检查清单，不代写。

下面解释为什么是这两条，以及它们各自的边界。

## 一、为什么放弃「按层连问」这条路

查了题库的真实形状（2026-10-28）：

| 项 | 值 |
| --- | --- |
| 知识点 × 层 | 29 × 5 = 145 格 |
| 有题的格子 | 89（56 格空） |
| 其中只有 1 道题 | **66 格，占 74%** |
| 平均每格 | 1.33 道 |

按「答对升层、答错降层、一直问到答不上来」实现，实际每一格都是：问 1 道 → 对了升层 →
下一层问 1 道 → 错了停。**这正是 M4 诊断卷在做的事**（每模块每层 1 题）。
做出来只是换了个交互壳子，信息量一样。要让「连问」有意义，得先把 66 个单题格补到 2 题以上
（约 172 题），那是内容工作，不该混进这一版。

所以这一版选**追问为什么会错**——诊断判「你在第几层」，追问判「你为什么错」，
两件事互不替代。

## 二、对话式追问（主体）

### 2.1 它是什么

针对**答错的那道题**，AI 问我为什么选它，我打字解释，它继续追问，直到我说不出来，
最后给一句结论：卡在哪个概念、归到哪个知识点、下一步做什么。

一次会话的形态固定：

```
题干 + 我选的答案（已知）
  ↓ AI 第一问：你为什么选 B？你是怎么想的？
  ↓ 我打字
  ↓ AI 追问（第 1 次）
  ↓ 我打字
  ↓ AI 追问（第 2 次）
  ↓ 我打字
  ↓ AI 收尾：一句结论 + 知识点归属 + 下一步
```

### 2.2 硬边界：AI 只准提问，不准讲解

PRD 第三节第 7 条：**「不做 AI 代替我思考，AI 只做检查与补漏」**。这条在追问里最容易破——
稍不注意就变成「AI 给我讲一遍这道题」，那我只是在读，没有在思考。

防法不是靠提示词里写「不要讲解」（模型会绕着走），而是**返回结构里根本不给它讲解的地方**：

```ts
type ProbeTurn =
  | { kind: "ask"; question: string }        // 只有一个问题，没有解释字段
  | { kind: "verdict"; verdict: ProbeVerdict };
```

模型想讲也没地方放。提示词里再补一句「不许给答案、不许解释选项对错」，只是第二道闸。

配套两条：
- **不把讲义正文喂给模型**，只给知识点名字。给了它就会把讲义当答案念出来。
- 不给它「正确答案为什么对」的现成解析。它知道哪项是对的（组 prompt 必须给，否则没法判断我错在哪），
  但**不允许在追问里说出来**。

### 2.3 三个实现决定

**决定 1：最多 3 轮我的回答。**
第一问 + 两次追问 + 收尾。一题控制在 5—10 分钟。
为什么是 3 而不是「一直问到答不上来」：单题耗时超过 10 分钟人就不做了，
而这一版的目的是「定位一个概念」，不是「彻底盘问」。三次足够从「我记混了」
追到「把 SV 的正负方向搞反了」。

**决定 2：追问必须有对象感，不许重复问同一个问题。**
每次追问要把我上一轮的回答**引用一个具体的词**再往下问，例如：
「你说『进度超前因为 SV 是负的』——负的为什么等于超前？」
泛泛的「能再详细说说吗」视为无效追问，提示词里给反例。
这条是为了防止三轮回合变成三次「再想想」。

**决定 3：收尾结论必须能落到知识点上，且人可改。**
```ts
type ProbeVerdict = {
  stuck: string;              // 卡在哪个概念，一句话，具体到动作或概念
  knowledgePointId: string | null;  // 只能从候选里选，不能自己编
  next: string;               // 下一步做什么，当天能执行
};
```
跟 M4 的归因一样：AI 出、人确认、确认后才存。理由也一样——
这个结论会挂到知识点上，被后面的「哪些概念老错」统计用到，不能让模型随手编。

### 2.4 入口只做一个：练习页答错时

答错后的操作区现在有「重做本题」「同类随机再抽」，加一个「讲讲为什么错」。
理由：刚答错的那一刻记忆最鲜，隔三天再回头追问，人会重新猜一遍而不是回忆当初怎么想的。

**不在 `/practice`（题库页）出现**。追问要归到「主题 → 模块 → 知识点」，题库页没有这层上下文。
实现上用可选回调 `onProbe`：父组件不传，按钮就不渲染。

**不做错题复盘列表**（「哪些错题还没追问过」）。这一版只做当场追问，
列表等积累了几十条追问记录、知道该按什么维度看的时候再做，否则就是拍脑袋排序。

### 2.5 存哪：新表 `learning_probes`

```sql
create table if not exists public.learning_probes (
  id                 text primary key,
  user_id            uuid not null references auth.users (id) on delete cascade,
  topic_id           text not null references public.learning_topics (id) on delete cascade,
  question_id        text not null references public.practice_questions (id) on delete cascade,
  knowledge_point    text,
  -- 完整的问答回合。留着是为了「这个结论是怎么得出的」可回看，
  -- 也是模型说错话时唯一的证据。
  transcript         jsonb not null default '[]'::jsonb,
  -- 人确认过的结论。AI 原始输出不单独存第二份：确认前后都在 transcript 里
  verdict            jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);
create index if not exists learning_probes_user_topic_idx
  on public.learning_probes (user_id, topic_id, created_at desc);
```

**为什么不塞进 `practice_attempts.context`**：
- 追问是一段多轮记录，塞进 context 等于把 jsonb 当文档库用
- `practice_attempts` 记的是「做没做对」这个事实，追问记的是「为什么错」这个解释，
  两件事的生命周期不同：答对之后作答记录可以留着，追问结论会被后来的追问推翻
- 要按知识点统计「老卡在哪些概念上」，需要独立查询

同一道题可以被追问多次（几个月后重做又错了，值得再问一次），所以**不加唯一约束**。

### 2.6 接口

`POST /api/learning/probe`，一个路由两种动作，靠 `phase` 区分：

```ts
// 请求
{
  phase: "ask" | "verdict",
  question: { id, title, type, level, options, answer, selected, explanation },
  knowledgePointName: string | null,
  transcript: Array<{ role: "ai" | "me"; text: string }>
}
// 响应
{ turn: ProbeTurn }
```

单路由而不是两个：两段共用同一份上下文拼装，拆开就要么复制一遍，要么再抽一层。

失败处理沿用 M4 的做法——**调不通不阻断学习**：
追问失败就显示「追问没跑起来」+「再试一次」，题目解析照常看，不影响做题。

## 三、一页素材表（骨架）

### 3.1 它是什么

每个模块一张纸，六段。**由我本人先写，AI 只做检查**（PRD 第 7 条）。

### 3.2 六段给引导问题，不给空标题

空标题会让人对着空白页发呆。每段配一个具体到能下笔的问题：

| 段 | 引导问题 |
| --- | --- |
| 定义 | 这个模块解决什么问题？一句话 |
| 核心概念 | 你记得的 3—5 个，每个一行，写自己的话 |
| 例子 | 举一个你自己项目里的例子 |
| 常见错 | 你已经错过的（可以从错题里抄） |
| 检查清单 | 考前你会怎么检查自己有没有掌握 |
| 5 个自测题 | 自己出 5 道。能答上来说明真会了 |

**不给示例答案、不给 AI 预填**。给了就会照着抄，抄完以为自己会了——这比空着更糟。

### 3.3 AI 检查只出清单，不改原文

```ts
type SheetReview = {
  gaps: string[];     // 讲义里有、你没写的概念
  wrong: string[];    // 你写的和讲义不一致的地方，要指出是哪一句
  suggest: string[];  // 建议补什么，每条一句话
};
```
**界面上不提供「采纳」按钮**。提供了就会一路点下去，一页纸变成 AI 写的——
那正是 PRD 禁止的。清单只列在边上，改不改由我自己在文本框里敲。

AI 检查的输入：六段全文 + 该模块知识点名 + 该模块错题标题。**不给讲义正文**——
给了它就会把讲义抄成「建议」，与「不代写」冲突。
代价是遗漏判断会粗一些，这可以接受：骨架阶段先要一个「能提醒我漏了什么」的镜子。

### 3.4 存哪：新表 `learning_sheets`

```sql
create table if not exists public.learning_sheets (
  id          text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  topic_id    text not null references public.learning_topics (id) on delete cascade,
  module_id   text not null,
  sections    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint learning_sheets_module_fk
    foreign key (topic_id, module_id) references public.learning_modules (topic_id, id) on delete cascade,
  constraint learning_sheets_unique
    unique (user_id, topic_id, module_id)
);
```
六段放一个 jsonb 而不是六个列：段落在未来可能增删（比如加「口诀」），
六列改起来要迁移，jsonb 只是多一个键。**唯一约束**：一个模块一张纸，不做版本历史——
这是给自己看的复习材料，不是发布物。

### 3.5 不判「模块学完」

PRD 说「每个模块学完生成一页纸」，但系统现在**没有「学完」这个状态**
（矩阵只有覆盖率，覆盖率 100% 也不等于学会）。
这一版不造这个门槛：素材表随时可写、可改、可空着。等真实用起来，
看他是在什么时机开始写的，再决定要不要加触发条件。

### 3.6 入口

主题页新增一块「一页素材表」，按模块列出 6 个入口，每个显示「已写 / 未写」和最后修改时间。
点开是抽屉（复用讲义抽屉的形态），六段 + 保存 + 「让 AI 检查」。

## 四、任务清单

| # | 任务 | 产出 |
| --- | --- | --- |
| T1 | 迁移：`learning_probes` + `learning_sheets` 两张表、索引、RLS | `supabase/migrations/2026102823xxxx_add_learning_probe_and_sheet.sql` |
| T2 | `lib/learning/probe.ts`：对话状态机（轮数上限、无效追问判定、收尾触发） | 纯函数 + 单测 |
| T3 | `lib/learning/probe-prompt.ts`：两段提示词（ask / verdict）+ 返回校验 | 拼装与 `ProbeTurn` 校验 |
| T4 | `app/api/learning/probe/route.ts` | 复用 diagnose 路由的通道与错误口径 |
| T5 | `components/probe-panel.tsx`：追问抽屉（回合记录、输入框、结论确认） | 界面 |
| T6 | `practice-quiz.tsx` 接 `onProbe`（可选回调，不传则无按钮） | 练习页入口 |
| T7 | `lib/learning/sheet.ts` + `app/api/learning/sheet-review/route.ts` + `components/sheet-panel.tsx` | 素材表骨架（六段 + 保存 + 检查清单） |
| T8 | 验收单 + roadmap + INDEX | 文档 |

T2 的纯函数部分是这一版最该有测试的地方：轮数上限、答非所问时要不要继续追问、
收尾只在第 3 轮之后触发——这些都能不依赖 AI 测。

## 五、验收标准（写成能看见的现象）

1. 答错一道题，能点「讲讲为什么错」，进追问，最多 3 轮，最后给一句具体结论
   （不是「掌握不牢」这种空话）。
2. 追问过程中**不出现任何讲解、不给正确答案的理由**。若出现，算这一版失败。
3. 结论里的知识点只能从我给的候选里选，选不到就是 null；我能改。
4. 追问记录与结论能存下来，刷新后还能看到那次追问说过什么。
5. AI 调不通时，显示「追问没跑起来」+ 重试，不影响做题与看解析。
6. 素材表六个模块都有入口，能写、能存、刷新后还在。
7. AI 检查只返回清单（遗漏 / 写错 / 建议），界面上**没有「一键采纳」**。
8. `/practice` 里不出现追问按钮。
9. `npm run check:fast` 通过；界面改动在浏览器里真跑过。

## 六、明确不做

- 不做「按知识点把各层连问一遍」（理由见第一节）。
- 不做错题复盘列表（理由见 2.4）。
- 不做素材表版本历史、不做导出打印（骨架阶段先要「能写」）。
- 不做素材表「学完解锁」（理由见 3.5）。
- 不让 AI 在追问里讲解，不给「一键采纳 AI 建议」（PRD 第 7 条）。
- 不补题。题库缺口单独记着，不在这一版里动。

## 七、已知风险

1. **追问质量取决于模型**。同一道题问两次可能追出不同结论。这与 M4 归因是同一类风险，
   处理方式也一样：出结论、人确认、人可改。但**这次风险更高**——M4 是整卷一次归因，
   这里是每道错题一次，调用次数和成本都会上去。
2. **成本**。一道错题 3 轮 = 3 次调用。若一天做 5 道错 3 道、每道都追问，就是 9 次调用。
   这还没算素材表检查。要不要给追问加「每天最多几次」的限制，等实际用量出来再定，
   现在不预设一个拍脑袋的上限。
3. **素材表现在用不上**。他还没学完任何一个模块（已做 4 题 / 118 题），
   六段大概率空着。这是主动接受的状态：先把容器做出来，等有内容时不用再返工。
