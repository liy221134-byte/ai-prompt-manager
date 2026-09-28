# 外部规则来源目录：MCP 与 Skills 采集清单

## 用途与定位

这份文档是**外部成熟工具的来源地图 + 规则采集作业指引**，用来指导从市面上成熟的
MCP 和 Skills 中，提炼可复用的工程规则，补充进工程方法种子资产包。

它**不是**：

- 不是规则本身——它只指出来源和提炼角度，提炼出的规则要另走资产入库流程；
- 不是"装得越多越好"的工具清单——每一个来源都要回答"能提炼什么、值不值得装"；
- 不直接编译进 `AGENTS.md`——采集产物先进 `engineering-foundations`，确认后才编译。

### 两类来源，两种用法

| 类型 | 本质 | 用法 | 与 Codex 的关系 |
| --- | --- | --- | --- |
| **Skills** | 规则富矿：SKILL.md 本身就是结构化的工程纪律和流程 | **读了提炼规则**，写进资产包 | Skills 是 Claude Code 的原生格式，Codex 不会自动加载，但 SKILL.md 是纯文本，Codex 可以读取、提炼、改写成 AGENTS.md 规则，不影响采集目的 |
| **MCP** | 能力工具：给 Agent 装"手和眼"，让它能操作系统 | **装上才能用**，附带产生安全边界规则 | MCP 是跨工具协议，Codex 原生支持，在配置中添加 MCP Server 即可；与底层用什么模型（DeepSeek 等）无关 |

## 采集原则（宁精勿多）

1. **一次只采集一个来源**，读完、提炼、去重、确认，再开下一个，不要批量倾倒。
2. **提炼纪律，不照搬流程**。例如 superpowers 的严格 TDD 对纯前端 MVP 是负担，但
   "完成前必须验证""调试要找根因"是任何项目都该保留的纪律。
3. **先去重再入库**。新规则必须和现有 17 条资产比对，只保留真正的增量。
4. **外部规则默认 `candidate`**，必须人工确认后才能升 `active`；可信度初始为
   `hypothesis`，在真实项目用过并留证后才升级。
5. **保留来源**。每条规则标注来自哪个仓库、哪个 SKILL.md / 哪条官方约定，写入
   `source_references`。
6. **区分受众**。约束 AI 的规则进工程包（编译 AGENTS.md）；教操作者怎么用 AI 的方法，
   进操作者训练包，不要混在一起。
7. **工具安装遵循最小权限**（见第三节元规则），不为了尝鲜开放生产写权限。

---

## 一、Skills 规则富矿（采集优先级最高）

### S1. obra/superpowers —— 工程纪律全集【首选采集】

- 仓库：`https://github.com/obra/superpowers`
- 性质：全网使用最广的工程纪律型 Skills 集合，约 14 个可组合技能，被称为
  "AI 工程纪律委员"。覆盖"动手前澄清 → 写计划 → 执行 → 测试 → 调试 → 评审 → 收尾"全链路。
- 采集优先级：P0
- 建议提炼的规则（按技能名）：

| 技能 | 提炼成什么 | 去向建议 |
| --- | --- | --- |
| `brainstorming` | 动手前先理解上下文、逐个提问、给 2-3 个方案、确认后写成 spec | 与现有 `MTH-REQ-001` 合并补强 |
| `systematic-debugging` | 4 阶段根因调试，禁止"猜着改" | **新增**，补操作者训练包 M5 排错 |
| `verification-before-completion` | 声明完成前必须实际运行验证，不能只看代码觉得对 | **新增**，补黑盒验收 / `TPL-ACCEPT-001` |
| `writing-plans` / `executing-plans` | 计划要细到新手能照做，分批执行并设检查点 | 补强 `MTH-DELIVERY-001` |
| `test-driven-development` | 先写失败的测试再写最小实现 | 零代码转化为"让 AI 先给验收标准/测试"，纯展示型页面可裁剪 |
| `requesting-code-review` | 任务间按严重程度评审，严重问题阻断进度 | 补强质量门禁 `MTH-QUALITY-001` |
| `finishing-a-development-branch` | 合并前验证测试、给出合并/PR/保留/丢弃选项 | 补强 `PLAYBOOK-RELEASE-001` |

- **不要照搬的部分**：完整的 subagent 多代理编排、git worktrees 隔离等重型流程，
  个人项目阶段是负担；只提炼其中"上下文隔离、任务不串"的思想（与
  `CASE-PARALLEL-001` 印证）。

### S2. anthropics/skills —— 官方标准范式

- 仓库：`https://github.com/anthropics/skills`
- 性质：Anthropic 官方维护，是 SKILL.md 目录结构、元数据、写法的**权威参考**，
  含文档处理、开发、测试、创意等示例技能。
- 采集优先级：P1
- 重点提炼：
  - `skill-creator`：教 AI 如何写一个合格 Skill——直接服务于产品 2.0
    "规则编译成可交付包"的能力，可作为编译产物格式的对标。
  - `webapp-testing`（Playwright 自动化测试）：提炼标准化的页面验收流程，
    补操作者训练包 M4 验收。
  - 官方 SKILL.md 的 front matter 和正文组织方式，作为资产 schema 演进的参考。

### S3. multica-ai/andrej-karpathy-skills —— 简洁反过度工程心法

- 仓库：`https://github.com/multica-ai/andrej-karpathy-skills`
- 性质：Karpathy 编码方法论，设计为可直接合并进 CLAUDE.md / AGENTS.md，
  风格偏谨慎、强调最小实现、反对提前抽象。
- 采集优先级：P1
- 重点提炼："不提前抽象、最小改动、先让它跑起来"的心法，与已从 Ponytail 提炼的
  **防过度设计 7 层梯子**同主题。采集时**对照合并、互相印证**，若重复则只保留表述更清晰的一条，不新增重复资产。

### 导航地图（用来找来源，不采集、不安装）

- `https://github.com/travisvn/awesome-claude-skills`：Skills 精选导航，需要新能力时
  先来这里按主题找，避免在海量 Skill 里盲搜。

---

## 二、MCP 能力工具（按需安装，安装即产生安全规则）

> 安装方式随版本变化，下表命令以采集当日官方 README 为准；让 Codex 先读官方仓库
> 的安装说明再配置，不要直接照抄可能过时的命令。Codex 在配置文件中添加 MCP Server。

### 第一梯队：建议现在安装

| MCP | 仓库 / 安装 | 能力 | 为什么对你有用 | 权限与风险 |
| --- | --- | --- | --- | --- |
| **Context7** | `npx -y @upstash/context7-mcp`；仓库 `github.com/upstash/context7` | 实时拉取库/框架的当前版文档 | 各榜单第一推荐。专治 AI 用训练数据里的**过时 API 语法**自信写错；Next.js / Tailwind / Supabase 迭代快，收益直接 | 只读、免费、低风险，**必装** |
| **Playwright MCP** | `npx -y @playwright/mcp@latest`；微软官方 `github.com/microsoft/playwright-mcp` | 自动开浏览器、点流程、填表、截图、按 URL 复现 bug；基于无障碍树而非截图识别 | **零代码黑盒验收神器**：让 AI 自己把用户流程点一遍并截图，你不读代码就能验收 | 高能力：可操作登录态页面。规则：验收用本地/预览环境，不授权其在生产做提交类动作 |
| **Supabase MCP** | `github.com/supabase-community/supabase-mcp`（以官方 README 为准） | 管理表结构、SQL、迁移、RLS 策略 | 与当前技术栈直接相关，可让 AI 协助设计和检查数据库 | **高风险**：能写库。规则见下方元规则——默认只读、迁移人工确认、不连生产库直写 |

### 第二梯队：到对应阶段再装，现在不增加负担

| MCP | 什么时候装 | 说明 |
| --- | --- | --- |
| **GitHub MCP**（`github.com/github/github-mcp`） | 需要在 DeepSeek 下走 PR / Issue 自动化时 | 用来绕开非 GPT 账号时 Codex 内置 PR 不可用的问题；你已在尝试，按需启用 |
| **Serena** | 项目文件明显变多、纯文件读写开始失准时 | 语义级代码导航与编辑，比按文件名读写更懂结构；个人项目当前规模用不上 |
| **Sequential Thinking** | 架构选型、复杂排错时 | 强制 AI 分步推理，相当于手动开"高思考等级"；注意 Anthropic 早期参考服务器已有归档变动，安装前确认当前可用的维护版本 |
| **Snyk MCP** | 第 7-8 周生产加固，或做公司项目时 | 依赖漏洞与安全扫描，属安全门禁工具 |
| **Postgres MCP** | 将来自建 PG 或接国产 PG 兼容库（人大金仓等）时 | 通用数据库访问；规则同样是默认只读。当前用 Supabase 时用 Supabase MCP 即可，不重复装 |
| **Vercel MCP** | 可不装 | GitHub 推送已能触发自动部署，边际收益低 |

---

## 三、资讯流：只提炼，不采信

这类来源不是工具，是**别人替你读过的每日资讯**。量大、时效短，方向可以信，
具体名字、版本和数字基本不能信。

| 来源 | 是什么 | 频率 |
| --- | --- | --- |
| 豆包定时任务「AI Coding 小技巧每日速递」 | AI 编程领域的每日资讯汇总（Claude Code／Next.js／Supabase／Cursor／Copilot 等） | 每天一条 |

**采集口径**

1. **只提炼能变成规则或检查的东西**。产品发布了什么、多少钱、多少星、跑分多少，
   一律不采信、不记录。
2. **先核事实再采信**。已经踩过两次：一次说某 MCP 项目「9 月 22 日刚开源」，
   实际查不到；一次把 `StuMason/coolify-mcp` 写成 `@masonator/coolify-mcp`。
3. **已覆盖的就记一句「已覆盖」**。这类来源八成的价值是**印证**而不是**新增**——
   它说对了你已经做过的事，说明方向没错，不代表要把同样的话再写一遍。
4. 提炼出的条目走「采集作业 SOP」，正文落进 `engineering-foundations`，不存本文件。

### 9 月下旬这批的核对结果（2026-09-27）

| 它说的 | 核对结果 |
| --- | --- |
| Next.js 官方建议 `AGENTS.md` 指向 `node_modules/next/dist/docs/` | 成立：本机该目录确实存在，Next.js 16.3.5。**尚未采纳** |
| `next-dev-loop` 能驱动浏览器、读 console | 成立：本机 agent-browser 0.31.1 加 `/_next/mcp` 实测通过，规则已写进 `AGENTS.md`（界面改动验证） |
| 配 Chrome DevTools MCP 当「AI 的眼睛」 | **不采纳**：本机已有 Codex 内嵌浏览器加 agent-browser，再装是重复建设 |
| 「测试不存在就别开并行 agent」 | 方向成立。本机 `AGENTS.md` 已有「个人项目默认不启用并行子代理」，暂不新增条目 |
| 「规则太长时模型只遵守一部分，要精简」 | 方向成立，作为「改 `AGENTS.md` 要说明删／并」的外部佐证；规则已写进 `AGENTS.md` |
| 模型型号、价格、跑分、星数（Opus 5.5、GPT-6 Sol、Skills 6 万+ 等） | 一律不采信、不记录 |

## 四、跨工具安全元规则（建议立为候选资产）

多个 MCP 官方文档反复出现同一条共识，建议提炼为一条候选规则
（工作名 `RULE-MCP-LEAST-PRIVILEGE-001`），经人工确认后入库：

> **所有 MCP / 外部工具默认授予最小权限、优先只读。凡是写操作、删除、生产环境、
> 对外发布，必须经过人工确认；数据库默认连接只读副本、本地快照或非生产项目；
> 浏览器 Agent 默认不在登录态生产页面执行提交类动作；Agent 自动化循环永远不直接
> 对生产库开放写权限。**

- 规则类型：`forbidden`（禁止默认放权）+ `must`（写操作必须人工确认）
- 用途：`safety`
- 优先级：`p0`
- 来源：Postgres / Supabase / Playwright / Tembo 等多个 MCP 官方文档的共同约定
- 与现有资产关系：补强 `CASE-ENV-PREFIX-001`（密钥与环境隔离）和
  `RULE-BOUNDARY-001`（数据所有权）

---

## 五、采集作业 SOP（喂给 Codex 的任务话术）

### 4.1 单个来源采集（一次只跑一个）

```
请阅读这个 Skills / MCP 仓库：<仓库地址>
背景：我是产品经理，零代码用 AI 交付软件，正在建设工程规则资产包。
任务：从中提炼"可复用的工程规则"，不要照搬它的完整流程，也不要安装或修改任何东西。

要求：
1. 逐条输出候选规则，每条标注来源（具体到哪个 SKILL.md / 哪个官方约定）。
2. 区分两类：约束 AI 的规则（进工程包）/ 教操作者的方法（进训练包）。
3. 对照我现有的工程资产清单（见 seed-packs/engineering-foundations/manifest.md）去重，
   只输出真正的新增项，并指出它补强或冲突的现有资产 ID。
4. 每条给出：规则类型（必须/禁止/建议/流程/验收）、适用项目规模
   （个人/中型/大型）、优先级、不适用场景。
5. 对 MCP 额外输出：它要求的权限级别、默认应只读还是可写、有哪些生产风险。

先只输出候选清单，不要写进 AGENTS.md，也不要新建资产文件，等我人工确认。
```

### 4.2 确认与入库（人工把关）

1. 逐条审候选清单，删掉"正确的废话"和当前阶段用不上的重型流程。
2. 确认的条目按 `schema.md` 写成资产文件，`status: candidate`、
   `confidence: hypothesis`，填好 `source_references`。
3. 在本文件「采集进度台账」登记，并更新 `manifest.md`。
4. 在至少一个真实任务里用过、留下证据后，再升 `provisional`。

### 4.3 安装 MCP 的附加确认

安装任何 MCP 前，让 Codex 先说明：它要什么权限、会接触哪些数据、默认是否只读、
能否限定到非生产环境。确认无误再装；写权限默认关闭。

---

## 六、采集进度台账

| 来源 | 类型 | 状态 | 提炼出的资产 ID | 采集日期 | 备注 |
| --- | --- | --- | --- | --- | --- |
| Ponytail（7 层防重复造轮子） | Skill/MCP | 已提炼并并入模板 | 已写入 templates/new-project/AGENTS.md | 2026-09 | 首个成功案例 |
| S1 obra/superpowers | Skills | 部分采集 | `PLAYBOOK-DEBUG-001`（系统化调试） | 2026-09-23 | 已并入工程方法种子资产包并写进 `AGENTS.md` 的修 bug 四步流程；其余技能（验证纪律、计划与执行、评审）待去重后再采 |
| S2 anthropics/skills | Skills | 未采集 | — | — | 重点看 skill-creator、webapp-testing |
| S3 karpathy-skills | Skills | 未采集 | — | — | 与 7 层梯子对照去重 |
| Context7 | MCP | 已安装 | — | 2026-09 | 只读；本机 Codex 配置里已挂 `npx -y @upstash/context7-mcp` |
| Playwright MCP | MCP | 未安装 | — | — | 黑盒验收用 |
| Supabase MCP | MCP | 已安装，当前不可用 | — | 2026-09 | 服务器已注册但 OAuth 令牌过期，需要重新授权；注意只读与生产隔离 |
| GitHub MCP | MCP | 进行中 | — | — | DeepSeek 下 PR 绕行方案 |
| Serena | MCP | 暂缓 | — | — | 项目变大再装 |
| Sequential Thinking | MCP | 已安装 | — | 2026-09 | 本机已挂参考实现；官方参考服务器有归档变动，维护版本待确认 |
| Snyk MCP | MCP | 暂缓 | — | — | 生产加固阶段 |
| Postgres MCP | MCP | 暂缓 | — | — | 自建/国产库阶段 |
| 豆包「AI Coding 每日速递」9/23–9/27（5 条） | 资讯流 | 已核对，未采纳 | — | 2026-09-27 | 结论见第三节；已覆盖的多，未采纳 1 条（Chrome DevTools MCP） |
| **S4 Supabase 官方 Skills**（`supabase`、`supabase-postgres-best-practices`） | Skills | 已入库 6 条 | `RULE-PG-FK-INDEX-001`、`RULE-PG-MIGRATION-001`、`RULE-PG-RLS-001`、`RULE-PG-PRIVILEGE-001`、`RULE-PG-TRANSACTION-001`、`MTH-PG-QUERY-PERF-001` | 2026-09-27 | 源文件 31 条规则，按「宁精勿多」挑出 6 条；连接管理（托管环境已管）、分区、锁、监控、高级特性、表设计常识按暂缓处理，理由记在包 README 的 0.7.0。全部 `confidence: hypothesis`，等技术上下文筛选生效并在真实项目用过再升 |
| **S5 superpowers 全套**（本机 12 个技能） | Skills | **已按适用规模采完**（1 + 2 + 6 条） | `PLAYBOOK-DEBUG-001`、`RULE-VERIFY-001`、`RULE-VERIFY-002`、`RULE-AGENT-TASK-001`、`RULE-AGENT-VERIFY-001`、`RULE-PARALLEL-001`、`RULE-WORKTREE-001`、`MTH-TASK-BOUNDARY-001`、`RULE-PLAN-RULING-001` | 2026-09-27 | 分三批：0.3.0 系统化调试、0.8.0 验证纪律 2 条、0.9.0 多智能体协作 6 条（标 large／regulated，个人项目用不上，靠规模筛选挡掉）。**主动不采**：TDD 铁律（交付门已覆盖）、brainstorming 三条路径（与三道门重合）、评审时点与合并菜单（本项目已主动简化） |
| **S6 product-design**（9 个技能） | Skills | **已采集 4 条** | `MTH-DESIGN-GATE-001`、`RULE-DESIGN-QA-001`、`RULE-DESIGN-ASSET-001`、`RULE-EVIDENCE-BOUNDARY-001` | 2026-09-27 | 规则富矿是 `get-context`（设计前澄清门）、`design-qa`（源设计与实现对比）、`audit`（证据边界）。**当时判断"不用 Figma 所以不采"是错的**——产品负责人是设计师，只是把设计工序排在了后面；`AGENTS.md` 的设计门已拆出「界面设计线」。其余 6 个技能（ideate／image-to-code／url-to-code／research／share／user-context）是设计与分享工具，不是规则来源 |
| Figma 官方 Skills（12 个） | Skills | 暂缓 | — | — | 本项目不做设计稿，暂时用不上 |
| Notion 官方 Skills（4 个） | Skills | 暂缓 | — | — | 不用 Notion |
| OpenAI 运行时技能（`documents`／`pdf`／`presentations`／`spreadsheets`／`template-creator`） | Skills | 暂缓 | — | — | 办公文档类能力，和这个库的关系要另判 |
| `computer-use`／`visualize` | Skills | 暂缓 | — | — | 能力型，不是规则型 |
| **S7 产品经理方法技能 19 个**（`create-prd`、`pre-mortem`、`strategy-red-team`、`frontend-design`、`user-stories`、`wwas`…） | Skills | **已采 4 条** | `RULE-PREMORTEM-001`、`RULE-REDTEAM-001`、`RULE-DESIGN-TEMPLATE-LOOK-001`、`RULE-DESIGN-COPY-001` | 2026-09-28 | 深读 4 个技能，各提炼 1 条进种子资产包 0.11.0：`pre-mortem`（事前验尸）、`strategy-red-team`（只打承重假设）、`frontend-design`（反模板味 + 界面文案）。**其余 15 个的处置**：`test-scenarios`／`create-prd` 已有替代不采；`job-stories`／`user-stories`／`wwas` 是需求表达格式，该进模板层；`prioritization-frameworks`／`ui-ux-pro-max` 是会腐化的清单，该进参考文档层；`canvas-design` 与本产品无关；`dummy-dataset` 暂缓；7 个团队管理方法（OKR／路线图／排期／复盘／干系人／会议纪要／发布说明）建议单独立一片，暂不混进工程包 |
| Next.js 能力技能 5 个（`next-dev-loop`、`next-cache-components-*`、`next-partial-prefetching-*`）与 `ui-ux-pro-max` | Skills | 部分采集 | `AGENTS.md` 的「界面改动的验证」 | 2026-09-27 | `next-dev-loop` 的用法已写进 `AGENTS.md`；其余是框架特定能力，等技术上下文筛选生效后再按需采 |
| **S8 WorkBuddy 生态**（本机 WorkBuddy 对我们的外部评审 + 它的 `DEV-SYSTEM.md`／`MEMORY.md`） | 评审 + Skills | **已采 3 条** | `RULE-EVIDENCE-SCOPE-001`、`RULE-CONFIDENCE-COMPILE-001`、`MTH-ASSET-RETIRE-001` | 2026-09-28 | 进种子资产包 0.12.0；逐条裁决见 `docs/reviews/2026-09-28-外部评审与裁决.md`。**它提的「Cursor 不支持 skills」经复核不成立**——Cursor 支持 Agent Skills，且 `.agents/skills/` 与 Codex 共用；**成本与额度纪律**两边都没有，记为包内「已知缺口」不硬写规则 |

> 状态取值：未采集 / 已采集待确认 / 已入库 / 已安装 / 暂缓 / 放弃。

## 版本

- `0.1.9`（2026-09-28）：新增 S8 WorkBuddy 生态——它对我们的外部评审采出 3 条进种子资产包 0.12.0
  （外推边界、未验证规则不参与编译、资产退役三问）；同时修正它的「Cursor 不支持 skills」误判。
- `0.1.8`（2026-09-28）：S7 产品经理方法技能采完 4 条进种子资产包 0.11.0（事前验尸、
  只打承重假设、反模板味、界面文案）；台账写明另外 15 个技能为什么不采、改道去哪一层。
- `0.1.7`（2026-09-27）：S6 product-design 采完 4 条设计规则进种子资产包 0.10.0；
  修正上一版「不用 Figma」的错误判断——当时把「工序排在后面」读成了「不用这个工具」。
- `0.1.6`（2026-09-27）：S5 superpowers 按适用规模采完——再采 6 条多智能体协作规则进
  种子资产包 0.9.0（标 large／regulated）；并写明哪些是主动不采及其理由。
- `0.1.5`（2026-09-27）：S5 superpowers 采集完毕——verification-before-completion 提炼出 2 条
  验证纪律进工程方法种子资产包 0.8.0；并在台账里写明剩下的技能为何不再采。
- `0.1.4`（2026-09-27）：S4 Supabase 官方 Skills 采集完成——31 条里挑出 6 条入库，
  进工程方法种子资产包 0.7.0（技术上下文标 `postgres`／`supabase`，主要面向中大型项目）；
  台账补上资产编号与暂缓理由。
- `0.1.3`（2026-09-27）：台账对齐现实。本机实际装着 5 个技能来源目录，台账原来只登记了 4 个来源；
  补登 Supabase 官方 Skills（下一批优先采）、superpowers 全套的真实进度（1／12）、
  product-design、Figma、Notion、OpenAI 运行时技能、计算机操作／可视化、
  产品经理方法技能 19 个、Next.js 能力技能等，并逐条写了「采不采、为什么」。
- `0.1.2`（2026-09-27）：新增「资讯流」一类来源和采集口径，登记 9 月下旬 5 条速递的
  核对结果；原三、四、五节顺延为四、五、六节。
- `0.1.1`（2026-09-24）：台账对齐现实——superpowers 记成「部分采集」（系统化调试已成资产），
  Context7、Sequential Thinking 记成已安装，Supabase MCP 标注 OAuth 令牌过期需重新授权。
- `0.1.0`（2026-09-23）：首版，建立来源目录、采集原则、3 个 Skills 来源、
  分梯队 MCP 清单、最小权限元规则和采集 SOP。遵循"宁精勿多"，后续按需增补。
