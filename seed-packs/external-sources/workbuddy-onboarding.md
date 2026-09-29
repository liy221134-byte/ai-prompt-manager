# WorkBuddy / CodeBuddy 上手手册（零代码产品经理版）

> 适用对象：已熟练使用 Codex + DeepSeek、靠 AGENTS.md/seed-packs 方法论驱动开发的产品经理。
> 目标：把 WorkBuddy 里负责编程的那条线（
>
> **CodeBuddy Code**
>
> ）装起来、接到你自己的 DeepSeek、接上你的规则资产，当天能在小功能上试跑。
> 最后更新：2026-09-28。命令与字段以官方文档为准，版本更新时先 
>
> `codebuddy --version`
>
>  核对。



***

## 0. 先搞清楚：你要装的是哪一个

WorkBuddy 是腾讯的产品族，别装错：



| 产品                                           | 干什么               | 你要不要       |
| -------------------------------------------- | ----------------- | ---------- |
| WorkBuddy（桌面工作台）                             | 写文档、做 PPT、分析数据、设计 | 办公顺带，可装可不装 |
| **CodeBuddy Code（命令行&#x20;**`codebuddy`**）** | **智能编程，对标 Codex** | ✅ 本次目标     |
| WorkBuddy Managed Agents                     | 智能体托管运营           | 暂不需要       |

记住：**编程用的是命令行&#x20;**`codebuddy`，不是那个办公工作台。



***

## 1. 安装（Windows）

环境要求：Node.js 18.20+（你电脑已有 Node 24，满足）。

**推荐方式（npm 全局安装）：**



```
npm install -g @tencent-ai/codebuddy-code
```

验证：



```
codebuddy --version
```

> 备选：官方也有免 Node 的原生安装包（Beta）：
> `irm https://copilot.tencent.com/cli/install.ps1 | iex`
> 你已有 Node，用 npm 方式即可。



***

## 2. 首次登录

在项目目录里启动：



```
cd E:\codeX项目\你的项目

codebuddy
```

第一次会让你选登录方式，**选「Chinese Site / 国内站点」**（走 [copilot.tencent.com](https://copilot.tencent.com)，支持国内主流模型，不需要折腾网络）。浏览器会自动打开完成授权。

启动后建议先设中文回复：



```
/config
```

把 Language 设为 Simplified Chinese。



***

## 3. 模型配置（省钱最关键的一步）

**原则：用你自己的 DeepSeek API key，不要一上来买腾讯云套餐。**

CodeBuddy 原生支持 DeepSeek，DeepSeek 官方有专门接入文档。两种配法，**推荐环境变量法（最简单）**：

### 方法 A：环境变量（推荐）



```
\# 你的 DeepSeek key（和你在 ccswitch 里用的是同一个 key）

setx DEEPSEEK\_API\_KEY "你的DeepSeek API Key"

\# 指向 DeepSeek 官方端点

setx CODEBUDDY\_BASE\_URL "https://api.deepseek.com"

setx CODEBUDDY\_API\_KEY "你的DeepSeek API Key"

\# 主模型：日常开发用 flash（省钱）

setx CODEBUDDY\_MODEL "deepseek-v4-flash"

\# 复杂推理（架构/难题）才用 pro

setx CODEBUDDY\_BIG\_SLOW\_MODEL "deepseek-v4-pro"

\# 后台轻量任务（读文件、列目录）用最快的小模型

setx CODEBUDDY\_SMALL\_FAST\_MODEL "deepseek-v4-flash"
```

> 设完环境变量要
>
> **重开终端**
>
> 才生效。
> 模型名（
>
> `deepseek-v4-flash`
>
>  / 
>
> `deepseek-v4-pro`
>
> ）以你 DeepSeek 控制台里实际可用的模型 ID 为准，别照抄错。

**这就是你之前在 Codex 里手动切 low/high 的自动化版**：日常任务走 flash，它遇到复杂推理会自动调大模型，轻量后台任务用小模型 —— 成本自动优化。

### 方法 B：models.json 配置文件

用户级（全局所有项目生效）：

`C:\Users\<你>\.codebuddy\models.json`

项目级（只对本项目生效，可提交 Git 团队共享）：

`<项目>\.codebuddy\models.json`

结构大致：



```
{

&#x20; "models": \[

&#x20;   {

&#x20;     "id": "deepseek-flash",

&#x20;     "name": "DeepSeek V4 Flash",

&#x20;     "vendor": "DeepSeek",

&#x20;     "url": "https://api.deepseek.com/v1",

&#x20;     "apiKey": "\${DEEPSEEK\_API\_KEY}"

&#x20;   }

&#x20; ],

&#x20; "availableModels": \["deepseek-flash"]

}
```

> `apiKey`
>
>  支持 
>
> `${环境变量名}`
>
>  引用，别把 key 明文写进会提交 Git 的项目级文件。
> 确切字段名以官方 
>
> `models.json 配置指南`
>
>  为准，字段对不上时优先用方法 A。



***

## 4. 把你的 AGENTS.md/ 资产包接进来

CodeBuddy 的配置目录是**模块化**的，和你 seed-packs「一条资产一个文件」的思路完全一致：



```
项目根目录\\.codebuddy\\

├── rules\        ← 规则文件（对应你的 AGENTS.md，一条规则放一个 .md）

├── agents\       ← 自定义子智能体（暂不用）

├── commands\     ← 自定义斜杠命令（暂不用）

├── skills\       ← AI 自动调用的技能（暂不用）

├── settings.json

└── models.json
```

**迁移做法（别手抄、别多份）：**



1. 把项目里现有的 `AGENTS.md` 作为**唯一正本**留在项目根目录；

2. 在 `.codebuddy/rules/` 里放精简的规则文件，内容直接引用 / 拆分自 AGENTS.md，不要另起炉灶写第二份规则；

3. seed-packs 里你认为本项目要用的那几条资产（如需求边界、质量门禁、Git 规则），可以对应复制成 `.codebuddy/rules/001-需求边界.md` 这种形式；

4. **Git 纪律、不擅自删数据 / 加依赖**这些你立过的规矩，原样写进 rules。

> 一句话：你的 AGENTS.md 怎么约束 Codex，就怎么约束 CodeBuddy，规则不重新发明。



***

## 5. 第一次在项目里跑起来



```
cd E:\codeX项目\你的项目

codebuddy
```

**进项目第一件事，先初始化项目上下文（官方强烈推荐）：**



```
/init
```

它会预建项目知识图谱，后续每次对话不用重复扫文件，官方说能省 30–50% 重复 token。项目结构大改后（加了新模块、大重构）再 `/clear` 然后重新 `/init`。



***

## 6. 日常怎么用：重点记住 3 个操作

### ① 那道 "先出方案等我确认" 的闸门

按 `Shift+Tab`（Windows 也支持 `Alt+M`）循环切权限模式：



```
default → bypass → accept → plan
```

**用&#x20;**`plan`**&#x20;模式让它先只规划、不改文件**—— 这就是你 "先讲改什么、我确认再动手" 的闸门。确认方案后再切回 accept/default 让它真正改。

### ② 看它的思考过程

终端显示 "Thinking" 时，按 `Ctrl+O` 打开完整推理，再按一次退出。用来判断它是不是在瞎想。

### ③ 常用斜杠命令



| 命令        | 作用               |
| --------- | ---------------- |
| `/init`   | 预建项目知识图谱（首次必跑）   |
| `/config` | 设语言等全局配置         |
| `/clear`  | 清上下文开新对话         |
| `/agents` | 查看 / 管理子智能体（暂不用） |
| `/help`   | 看全部命令（不确定就打这个）   |

> 你之前的经验 "换任务才开新对话、同一条长任务别频繁新开" 在这里同样适用 ——
>
> `/clear`
>
>  就是开新对话。



***

## 7. MCP：装一次，两边共享

CodeBuddy 支持 MCP。你 external-sources 台账里那批（Context7、Supabase MCP、GitHub MCP 等）**不要每个工具重装一遍**，配置一次 Codex 和 CodeBuddy 都能用。具体挂载位置查官方 "MCP Integration" 文档。



***

## 8. 和 Codex 速查对照



| 概念        | Codex / 你现在的做法     | CodeBuddy Code                 |
| --------- | ------------------ | ------------------------------ |
| 启动        | `codex`            | `codebuddy`                    |
| 规则文件      | `AGENTS.md`        | `.codebuddy/rules/*.md`        |
| 项目上下文     | 开工先读 AGENTS/README | `/init`                        |
| 先出方案再动手   | 让它先说改什么            | **plan 模式**（Shift+Tab）         |
| 轻量 / 复杂模型 | 手动切 flash/pro      | `SMALL_FAST` / `BIG_SLOW` 自动分档 |
| 看思考过程     | —                  | `Ctrl+O`                       |
| MCP       | 已装                 | 同一份配置共享                        |
| 模型接入      | ccswitch 路由        | models.json/ 环境变量直连 DeepSeek   |



***

## 9. 避坑清单



1. **先确认计费再跑长任务**：用自己的 DeepSeek key（方法 A），别一上来买腾讯云点数套餐；跑之前先看用量。

2. **别和 Codex 在同一目录同时开**—— 你 `CASE-PARALLEL-001` 吃过并行重复的亏。换工具练手，拿新分支 / 小功能试，别动主项目 v2.4.0。

3. **规则只留一份正本**：AGENTS.md 是源头，`.codebuddy/rules/` 引用它，别手抄两份让它漂移。

4. **项目级&#x20;**`.codebuddy/settings.json`**&#x20;别提交含密钥的内容**：密钥走环境变量，仓库里只留不含 key 的配置。

5. **模型名以 DeepSeek 控制台实际 ID 为准**：文档里写的 `deepseek-v4-flash`/`pro` 是示例，配错了会启动报错。

6. **国内网络直连**：这是它对你最大的好处，不用像 Vercel 那样时断时续。



***

## 10. 上手 Checklist（照着勾）



* [ ] `npm install -g @tencent-ai/codebuddy-code` 安装

* [ ] `codebuddy --version` 验证

* [ ] 登录选 **Chinese Site**

* [ ] `/config` 设中文

* [ ] 配 `DEEPSEEK_API_KEY` + `CODEBUDDY_BASE_URL` + 主 / 大 / 小三档模型环境变量，**重开终端**

* [ ] 进项目 `/init` 初始化

* [ ] `.codebuddy/rules/` 接入 AGENTS.md 相关规则

* [ ] 用 `plan` 模式让它先讲一个小功能怎么改，确认后再动手

* [ ] 在无关紧要的小功能 / 新分支上跑通一次完整流程

* [ ] 确认用量和成本符合预期，再考虑迁移正式迭代



***

### 参考来源



* 官方简介：[https://www.workbuddy.cn/docs/workbuddy/](https://www.workbuddy.cn/docs/workbuddy/)

* CLI 快速开始：[https://www.workbuddy.ai/docs/cli/quickstart](https://www.workbuddy.ai/docs/cli/quickstart)

* DeepSeek 官方接入文档：[https://api-docs.deepseek.com/zh-cn/quick\_start/agent\_integrations/workbuddy](https://api-docs.deepseek.com/zh-cn/quick_start/agent_integrations/workbuddy)

* 环境变量参考：[https://www.codebuddy.ai/docs/zh/cli/env-vars](https://www.codebuddy.ai/docs/zh/cli/env-vars)

* 配置目录说明：[https://www.workbuddy.ai/docs/cli/sdk](https://www.workbuddy.ai/docs/cli/sdk)