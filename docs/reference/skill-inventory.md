# 技能清单与触发预算体检（2026-10-01）

> 第一至第五节是**只读清点**，不含任何停用或删除动作；建议在第五节，做不做由产品负责人定。
> 第 4.3 节记录 2026-10-01 **实际执行**的挂载归一（产品负责人当日授权：「A 按推荐，B 走 1」）。
> 依据：`docs/reviews/2026-10-01-两套体系对比调研.md` 第 5.1 节 O3。
> 任务出处：`docs/superpowers/specs/2026-10-01-体系治理-m0-design-and-tasks.md` T2。
> 复现口径见第六节。

---

## 一、为什么看这个

技能不是越多越好。**每轮都在为「技能清单」付费，付的是最不常用那批的触发能力。**

两个工具各有自己的预算，**别混**（下面都是官方文档原文口径）：

| 工具 | 预算 | 溢出时怎么办 | 出处 |
| --- | --- | --- | --- |
| Claude Code | 上下文窗口的 **1%** | 按「最少调用」顺序丢掉 description；给了 `disable-model-invocation` / `user-invocable: false` / `skillListingBudgetFraction` 三个开关 | Claude Code 官方文档 |
| **Codex（我们的运行时）** | 上下文窗口的 **2%**，窗口未知时 **8,000 字符** | **先缩短 description**；技能很多时**可能直接把一些技能从清单里省掉，并打一条 warning** | `developers.openai.com/codex/skills` |

Codex 还规定：清单里除了名字和 description，**还包括每个技能的文件路径**；显式调用走 `$技能名`
（Codex CLI / IDE）或在 `/skills` 里挑。技能重名不会被合并，**两个都会出现在清单里**。

> 本机实测（2026-10-01）：模型 `context_window = 1,048,576` → 预算 = 2% ≈ **20,972 tokens ≈ 73,400 字符**；
> 实际技能清单占 **70,743 字符 = 96%**。已经贴顶，再装几个就会开始缩短 description。
> 处置见第七节。

---

## 二、总量与成本

| 来源 | 个数 | description 字符 |
| --- | ---: | ---: |
| 用户级 `.codex/skills` | 24 | 7,281 |
| 交叉 `.agents/skills` | 14 | 4,790 |
| 插件缓存（13 个插件） | 104 | 26,569 |
| **合计** | **142** | **38,640**（≈11k tokens／轮） |

> **与设计文档的差异**：设计文档写的是 141 个，**实测 142**。差的那一个是
> `context-mode-codex-patch` —— 它在两次统计之间被装进 `.agents/skills`。
> 数字以本节为准；设计文档里的 141 是过时快照。

---

## 三、按来源清点

### 3.1 插件（13 个）——可管理的粒度是「整个插件」，不是单个技能

| 插件 | 技能数 | description 字符 |
| --- | ---: | ---: |
| `vercel` | 54 | 13,067 |
| `superpowers` | 14 | 1,863 |
| `figma` | 12 | 5,722 |
| `product-design` | 10 | 2,548 |
| `notion` | 4 | 668 |
| `supabase` | 2 | 660 |
| `openai-primary-runtime/spreadsheets` | 2 | 558 |
| `openai-bundled/computer-use` | 1 | 33 |
| `openai-bundled/visualize` | 1 | 311 |
| `openai-primary-runtime/documents` | 1 | 313 |
| `openai-primary-runtime/pdf` | 1 | 224 |
| `openai-primary-runtime/presentations` | 1 | 139 |
| `openai-primary-runtime/template-creator` | 1 | 463 |

**这一层要记住**：这 104 个不是逐个挂上去的，是随插件走的。要减只能**停用整个插件** ——
所以第五节「可停用」那一档的建议单位是插件，不是技能。

### 3.2 交叉 `.agents/skills`（14 个）——本项目自有技能在这里

| 技能 | description 字符 |
| --- | ---: |
| `ui-ux-pro-max` | 809 |
| `next-cache-components-optimizer` | 742 |
| `next-partial-prefetching-adoption` | 415 |
| `next-cache-components-adoption` | 409 |
| `next-partial-prefetching-optimizer` | 362 |
| `context-mode-codex-patch` | 318 |
| `internal-mcp-governance-cn` | 278 |
| `next-dev-loop` | 272 |
| `skillspector-scan-cn` | 232 |
| `requirement-rewrite-cn` | 207 |
| `redteam-cn` | 202 |
| `design-plan-cn` | 191 |
| `premortem-cn` | 181 |
| `acceptance-checklist-cn` | 172 |

### 3.3 用户级 `.codex/skills`（24 个）

`imagegen`(572) `ui-ux-pro-max`(809) `openai-docs`(461) `strategy-red-team`(385) `pre-mortem`(328)
`prioritization-frameworks`(296) `outcome-roadmap`(294) `canvas-design`(289) `create-prd`(287)
`release-notes`(274) `retro`(274) `test-scenarios`(272) `stakeholder-map`(262) `user-stories`(261)
`brainstorm-okrs`(252) `summarize-meeting`(250) `job-stories`(247) `dummy-dataset`(245)
`sprint-plan`(232) `review-agent`(229) `wwas`(227) `skill-installer`(225) `frontend-design`(204)
`skill-creator`(106)
（括号里是 description 字符数）

---

## 四、发现的问题

### 4.1 Codex 能读到的两个根之间，重名 1 处

`ui-ux-pro-max` 同时存在于**用户级** `.codex/skills`（符号链接）与**交叉** `.agents/skills`
（实体副本），两份 description 都是 809 字符。
后果：Codex 的技能列表里出现两行同名条目，白占一份预算；模型也可能选错那一份。
**这是唯一一处真正花掉 Codex 触发预算的重复。**

### 4.2 非规范字段：19 个技能

Agent Skills 规范只允许六个字段：`allowed-tools` / `compatibility` / `description` / `license` /
`metadata` / `name`。超出的字段在**打包或上传到 claude.ai / Skills API 时会硬报错**，不是被忽略。

| 位置 | 个数 | 多出来的字段 | 影响 |
| --- | ---: | --- | --- |
| 交叉 `.agents/skills` | **8** | `version`、`agent_created` | 是我们自己的 `-cn` 技能（含新增的 `context-mode-codex-patch`）。本地用没问题，**多平台分发时会失败** |
| 插件 `figma` | 11 | `disable-model-invocation` | 这是 Claude Code 的合法字段，只在多平台分发时才需处理 |
| 用户级 | 0 | — | 干净 |

带非规范字段的 8 个交叉技能：`acceptance-checklist-cn`、`context-mode-codex-patch`、`design-plan-cn`、
`internal-mcp-governance-cn`、`premortem-cn`、`redteam-cn`、`requirement-rewrite-cn`、`skillspector-scan-cn`。
（交叉目录另 6 个是干净的：`ui-ux-pro-max` 与 5 个 `next-*`。）

### 4.3 补查：挂载拓扑——「一份正本」的架构只做了一半（2026-10-01 追加）

第 4.1 节只看了「Codex 能读到的两个根」。往上一层看**整机**，真实拓扑是
**3 个技能仓库 + 4 个挂载目录**：

| 仓库（正本） | 装什么 | 个数 |
| --- | --- | ---: |
| `~/.cc-switch/skills/` | cc-switch 的通用技能库 | 24 |
| `E:/AI资产市场/skills/` | 本项目技能正本（8 个 `-cn`／`context-mode-codex-patch`） | 8 |
| `~/.codex/plugins/cache/` | 插件自带的技能 | 104 |

| 挂载目录（给各工具读） | 个数 | 其中符号链接 | 其中**实体副本** |
| --- | ---: | ---: | ---: |
| `~/.codex/skills/`（Codex） | 24 | 3 | **20**（含 `.system` 1 个） |
| `~/.agents/skills/`（Codex + Cursor 等交叉工具） | 14 | 8 | **6** |
| `~/.claude/skills/`（Claude Code） | 34 | 33 | **1** |
| `~/.workbuddy/skills/`（WorkBuddy） | 17 | 8 | **9** |

**逐字核对结果**：挂载目录里的实体副本共 **27 处**，**全部与库逐字相同（0 处不同）**——
说明还没漂，但已经埋了漂的种子：改一处要记得改多处，漏一处就分叉。

另外 3 个是库里没有、只存在于 WB 挂载目录的：`codex-session-doctor`、`markitdown-skill`、`web-access`。

**结论：`~/.claude/skills` 基本做对了**（33 个符号链接，只有 1 个实体副本）；
`~/.codex/skills`、`~/.agents/skills`、`~/.workbuddy/skills` 还是实体副本为主。
「一份技能正本，多工具挂载」这条架构，**在 Claude 那一路落地了，另外三路还没落地**。

**归一：已于 2026-10-01 执行**（产品负责人当日授权）。做法与结果：

| 项 | 内容 |
| --- | --- |
| 做法 | **移动代替删除**：先把原目录 `Move-Item` 进备份目录，再在原位建指向仓库的符号链接。全程没有删除任何内容 |
| 备份位置 | `C:\Users\90402\.skill-mount-backup-2026-10-01\`（按 `codex/` `agents/` `claude/` `workbuddy/` 分子目录，27 个原目录都在里面） |
| `ui-ux-pro-max` 特例 | `.agents/skills` 那份换成符号链接；`.codex/skills` 那条**多余的链接**移进备份（Codex 仍从 `.agents` 读到它，Cursor 那边不丢） |
| 结果 | 符号链接可用 **76** 个；实体副本只剩 **3** 个，全是 WB 独有的（`codex-session-doctor` / `markitdown-skill` / `web-access`，库里没有对应物，本来就该留）；**断链 0**；Codex 两个根之间**重名 0** |
| 技能总数 | 142 → **141**（去掉的就是那一处重复） |
| 怎么还原 | 把备份目录里的原目录 `Move-Item` 回原位、删掉对应的符号链接即可；备份目录本身没动过 |

---

## 五、建议（只列，不动手）

### A 档 · 可降级（改标记，不删内容）

| 对象 | 建议 | 理由 |
| --- | --- | --- |
| `ui-ux-pro-max` 里重复的那一份 | 保留一份，另一份撤掉挂载或标 `name-only` | 纯重复，白占一份预算 |
| 5 个 `next-*` 技能 | 按需挂：只在动 Next.js 缓存／预取时才用 | 合计 2,200 字符，是交叉目录里最大的一块；平时用不上 |
| `figma` 插件的 11 个技能 | 它们**已经**是 `disable-model-invocation`，正合「只人工调用」的定位 | 无需动作，记录在案 |

### B 档 · 可停用（整体停用插件）

| 对象 | 技能数 | 说明 |
| --- | ---: | --- |
| `vercel` | 54 | 最大头。里面大量与个人项目无关（`ai-gateway` / `payments` / `cms` / `email` / `chat-sdk` / `microfrontends` / `turborepo` / `vercel-queues` / `vercel-sandbox` / `vercel-services` / `eve` / `next-forge` / `geistdocs` / `v0-dev` / `marketplace` / `sign-in-with-vercel` / `ncc` / `micro` / `satori` / `workflow`…），但本项目确实部署在 Vercel |
| `superpowers` | 14 | `AGENTS.md` 已把其中多数列为「默认不使用」（writing-plans / executing-plans / 并行子代理 / code-review 类 / using-superpowers） |
| `product-design` | 10 | 与本项目「固定 UI 风格、反模板味」的取向可能冲突，需要先确认 |
| `notion` | 4 | 本机未见使用记录 |

**这一档要产品负责人判断，不代定。** 尤其 `vercel`：它与本项目强相关，但 54 个技能里真正会用到的可能不到 10 个 ——
这是一个「相关性高、但绝大部分用不上」的典型。

### C 档 · 需回正本仓确认（格式问题）

| 对象 | 动作 |
| --- | --- |
| 交叉目录 8 个带 `version` / `agent_created` 的技能 | 技能正本在 `E:/AI资产市场`，本仓只引用。**去掉这两个字段要回正本仓决定** —— 本仓改不了，改了也会被同步覆盖 |

---

## 六、复现口径

清点脚本是临时脚本（未入库）。复现按这四步：

1. 递归扫三个根：`C:/Users/90402/.codex/skills`、`C:/Users/90402/.agents/skills`、
   `C:/Users/90402/.codex/plugins/cache`；
2. 收所有 `SKILL.md`；**软链接目录要跟进去** —— 第一版统计没跟，数字少了 11 个，这是实际踩过的坑；
3. 解析每份的 YAML frontmatter：取 `description` 长度（`>` / `|` 这类多行写法要把后续缩进行拼上）
   与字段名集合；
4. 字段集合减去规范允许的六个，剩下的就是非规范字段。

---

## 七、降级：44 个改成「不自动触发，但随时能 `$` 调」（2026-10-01 执行）

**为什么动**：实测技能清单占预算的 **96%**（70,743 / 73,400 字符）。按官方口径，再装几个就会
先缩短 description、再省略技能 —— 那是**静默降级**，不如主动清。

### 换了两次机制，都记下来（免得下次踩）

1. **第一版**用 `[[skills.config]] enabled = false`（官方「关掉但不删除」那个开关）。
   **实测有效**：下一轮的技能清单里那 27 个确实消失了 —— 这一条是拿真实注入的清单核对过的，
   不是推断。
2. **但产品负责人要的是「不自动触发、随时能 `$` 调」**，而 `enabled = false` 是彻底关掉。
   于是换成官方另一个开关 —— 在技能目录里放一份 `agents/openai.yaml`：

   ```yaml
   policy:
     allow_implicit_invocation: false
   ```

   `config.toml` 已整份还原成改动前的样子（原始备份留在
   `C:\Users\90402\.codex\config.toml.bak-2026-10-01-skills`）。

   **这不是我们发明的写法**：OpenAI 自己的技能就这么干 —— `.system/review-agent` 和
   `product-design` 里 5 个技能，本来就写着 `allow_implicit_invocation: false`。

**落点**：44 个技能，分三处 —— `~/.cc-switch/skills/*/agents/openai.yaml`（11 个，经符号链接
对用户级与 `next-*` 生效；这个目录是共用正本，`agents/openai.yaml` 对其它工具是惰性文件）、
vercel 插件内（28 个）、figma 插件内（5 个）。全机现在共 **50 个**写着 `false`（本次 44 + 原有 6）。

### 第一批（27 个）

**A 档 · 功能重复（6 个）** —— 同一件事已经被保留的中文技能完整覆盖：

| 关掉 | 为什么 |
| --- | --- |
| `pre-mortem` | 与 `premortem-cn` 同一功能，后者是中文 |
| `strategy-red-team` | 与 `redteam-cn` 同一功能，后者是中文 |
| `user-stories`、`job-stories`、`wwas` | 三个都是需求写法；`requirement-rewrite-cn` 一份就覆盖这三种格式 |
| `test-scenarios` | 与 `acceptance-checklist-cn` 同一功能 |

**B 档 · 与本机工作无关（21 个）** —— 都在 vercel 插件里，本项目一样都不用：

`chat-sdk`（Slack/Teams 机器人）、`marketplace`（电商/店铺）、`payments`（Stripe）、`cms`、
`microfrontends`、`turborepo`、`ncc`、`micro`、`satori`、`geistdocs`、`next-forge`、`v0-dev`、
`vercel-queues`、`vercel-sandbox`、`vercel-services`、`eve`、`sign-in-with-vercel`、`vercel-flags`、
`vercel-connect`、`vercel-agent`、`ai-elements`。

共省 7,555 字符 ≈ 预算的 10%。

### 第二批（17 个，2026-10-01 同日追加）

| 组 | 技能 | 为什么 |
| --- | --- | --- |
| `next-*` × 5 | `next-cache-components-adoption` / `-optimizer`、`next-partial-prefetching-adoption` / `-optimizer`、`next-dev-loop` | 只在真的改造 Next.js 缓存／预取时才用得上，日常用不着 |
| figma × 5 | `figma-swiftui`、`figma-code-connect`、`figma-generate-library`、`figma-implement-motion`、`figma-generate-design` | SwiftUI 是 iOS（本项目不做）；Code Connect、设计系统库、动效、设计系统整库这几件本机都没上；其余 figma 的「MANDATORY 前置」类技能保持自动，不然会断掉 `use_figma` 的前置链 |
| vercel × 7 | `vercel-firewall`、`cron-jobs`、`workflow`、`json-render`、`ai-gateway`、`vercel-storage`、`routing-middleware` | 本项目没开这些平台能力：没有定时任务、没有 WDK 工作流、没用 AI Gateway 路由、没用 Vercel 的存储（数据在 Supabase） |

> **后来改了**：`next-*` 5 个在当天稍后**恢复**；figma 那 4 个一度恢复，随后按产品负责人
> 「我也用不了」又**收回**。详见下面的「恢复 5 个」与「figma 再收回 4 个」。

### 没动的（保持自动触发）

**figma 12 个里留了 7 个**（`figma-use` 一族和 3 个 MANDATORY 前置技能）——
它们必须在调 `use_figma` 前被自动加载，改成手动会断链。

**vercel 54 个里留了 26 个**，本项目真会用到的都在：`nextjs`、`next-upgrade`、
`next-cache-components`、`turbopack`、`deployments-cicd`、`vercel-cli`、`vercel-api`、
`cdn-caching`、`runtime-cache`、`env-vars`、`vercel-functions`、`observability`、`bootstrap`、
`investigation-mode`、`knowledge-update`、`ai-sdk`、`ai-generation-persistence`、`geist`、
`shadcn`、`swr`、`auth`、`email`、`react-best-practices`、`agent-browser`、`agent-browser-verify`、
`verification`。

**supabase 2 个、`.agents/skills` 里另外 9 个、`.system` 4 个，一个没动。**

### 怎么恢复

要临时用某个被降级的技能：**在提示里写 `$技能名` 就能调**，不用改任何东西。

要恢复成自动触发：删掉那个技能目录下的 `agents/openai.yaml`（如果里面只有 `policy:` 两行），
或把 `allow_implicit_invocation` 改成 `true`。

### 实测结论：机制有效，而且省得比预期多（2026-10-01 补）

拿**逐轮注入的真实技能清单**核过了 —— `allow_implicit_invocation: false` **确实把整个条目
从清单里去掉**，不是只关触发：

| 时点 | 清单条数 | 清单字符 | 占预算（约 73,400 字符） |
| --- | ---: | ---: | ---: |
| 动手前 | 118 | 70,717 | 96% |
| 降级后 | 68 | **22,661** | **31%** |

数字取自会话文件里每轮注入的清单原文，不是估算。

### 成本视角：缓存命中便宜 50 倍 —— 产品负责人的判断是对的

DeepSeek 官方定价（2026-10-01 核 `api-docs.deepseek.com/quick_start/pricing`）：

| deepseek-flash 输入 | 峰时 | 非峰时 |
| --- | ---: | ---: |
| **缓存命中** | $0.006 / 1M | **$0.003 / 1M** |
| 未命中 | $0.3 / 1M | $0.15 / 1M |

技能清单在提示词最前面、内容稳定，**基本都走缓存命中** —— 那 20k tokens 折算下来是千分之几美分。
所以「省不省这 2%」**主要不是钱的问题**，而是「别超预算、别让 Codex 悄悄缩短 description
或省略技能」的问题。**这条改变了取舍：有钱的余量就该换回能力。**

### 恢复 5 个（2026-10-01）

既然余量约 50k 字符、钱又几乎不花，就把「有价值但还没用起来」的放回来：

| 恢复 | 为什么 |
| --- | --- |
| `next-dev-loop` | **它被本项目 `AGENTS.md` 点名了**（工具分工：「两边都要时走完整的 `next-dev-loop` 流程」）。降级它＝让规则指向一个不会出现的技能，是冲突，必须改回来 |
| `next-cache-components-adoption` / `-optimizer`、`next-partial-prefetching-adoption` / `-optimizer` | 本项目就是 Next.js 16，缓存与预取改造迟早要碰 |

（第一版恢复的是 9 个，含 4 个 figma；那 4 个当天又收回，见下一节。）

### figma 再收回 4 个（产品负责人 2026-10-01 定）

产品负责人明确：「figma 那几个降级吧，我也用不了」。于是把当天恢复的 4 个
（`figma-generate-design`、`figma-generate-library`、`figma-implement-motion`、`figma-code-connect`）
收回去。**figma 现在共降级 5 个、留着 7 个。**

留着的 7 个是 `use_figma` 的**前置依赖链**（`figma-use`、`figma-use-figjam`、`figma-use-motion`、
`figma-use-slides`、`figma-create-new-file`、`figma-design-to-code`、`figma-generate-diagram`）——
它们必须在调 `use_figma` 之前被自动加载，关掉会断链。

**如果「用不了」指的是整个 figma 都用不上**，说一声「全关」，这 7 个也能一起降级；
代价是以后真要动 Figma，得先在提示里写 `$figma-use` 这类名字才加载得到。

### 产品经理侧的 6 个：确认是重复，保持降级

产品负责人问「那几个产品经理侧的技能有重复的了么」——**是，功能重复，不是逐字重复**：

| 降级的（英文，来自 cc-switch 库） | 已保留的中文技能 | 关系 |
| --- | --- | --- |
| `pre-mortem` | `premortem-cn` | 同一套事前验尸方法 |
| `strategy-red-team` | `redteam-cn` | 同一套承重假设攻击法 |
| `user-stories`、`job-stories`、`wwas` | `requirement-rewrite-cn` | 一份就覆盖这三种需求写法 |
| `test-scenarios` | `acceptance-checklist-cn` | 同一件事：列可点的验收入口 |

中文那套是本项目自己写的，用词和口径更贴产品负责人的习惯 —— 所以**留中文、降英文**。

### 仍然降级的 39 个

- **用户级 6 个**：见上一节，功能重复。
- **figma 5 个**：`figma-swiftui`（iOS/SwiftUI，本机不做）＋ 当天收回的 4 个。
- **vercel 28 个**：本项目没开的平台能力 —— 支付、CMS、邮件、存储、防火墙、工作流、队列、
  沙箱、微前端、单体仓、打包器、AI 网关、OAuth、Flags、Agent、聊天机器人、电商等。

写 `false` 的最终是 **45 个**（本次 39 + 原有 6）。

> 判断口径：**「这件事本机是否已经在做或近期要做」** —— 是就恢复，不是就继续降级。
> 这个口径写下来，是为了下次加技能时不用重新想一遍。

