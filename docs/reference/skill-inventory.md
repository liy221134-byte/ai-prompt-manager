# 技能清单与触发预算体检（2026-10-01）

> 只读清点，**不含任何停用或删除动作**。建议在第五节，做不做由产品负责人定。
> 依据：`docs/reviews/2026-10-01-两套体系对比调研.md` 第 5.1 节 O3。
> 任务出处：`docs/superpowers/specs/2026-10-01-体系治理-m0-design-and-tasks.md` T2。
> 复现口径见第六节。

---

## 一、为什么看这个

外部一手事实（Claude Code 官方文档）：技能列表占用**上下文窗口的 1%**。列表里始终有全部技能名，
但溢出时会**按「最少调用」的顺序丢掉 description** —— 丢掉的正是最不常触发的技能，丢完就再也匹配不上。

官方给了三个开关：`disable-model-invocation`（只允许人工调用）、`user-invocable: false`（只允许模型调用）、
`skillListingBudgetFraction`（调预算比例）。另有一个 `/skill-doctor` 用来找从没被用过的技能。

一句话：技能不是越多越好。**每轮都在付费，付的是最不常用那批的触发能力。**

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

**归一方案（未执行，等产品负责人点头）**：把 27 处实体副本换成指向对应仓库的符号链接。
因为内容逐字相同，换链接不丢任何东西；做法上先备份到 `~/.skill-mount-backup-<日期>/` 再建链接，
任何一步出问题都能整体还原。**这一条超出本轮授权范围**（本轮授权的是「去掉 1 处重复」，
不是「动 27 处挂载」），所以只登记，不动手。

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

