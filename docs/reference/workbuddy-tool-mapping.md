# WorkBuddy 侧执行工具映射

## 这份文件解决什么

本项目规则正本是 `AGENTS.md` 与 `docs/method.md`，**本文件不复制任何规则正文**。

它只解决一件事：那两份文件里写的是 **Codex 生态**的工具名，而实际执行者可能是 **WorkBuddy**。
同一件事、不同工具名，映射如下。判据一律不变。

## 映射表

| AGENTS.md 里的写法 | WorkBuddy 侧等价物 | 说明 |
| --- | --- | --- |
| `agent-browser` 打开页面、截图、点按 | 内置浏览器（`mcp__browser__*`，browser_id 1 = WorkBuddy Browser） | 每个任务自建 tab、用完关闭；不需要 `close --all`，也不与他的日常浏览器抢标签 |
| `agent-browser close --all`（清旧会话） | **无对应命令，也不需要** | 内置浏览器由工具层管理 tab 生命周期 |
| 需要读页面文本的公开页面 | **WebFetch 优先** | 比截图省 token；截图只用于「看渲染对不对」 |
| `/_next/mcp`（框架层问题：哪个文件渲染了这个路由、为什么没渲染） | **无等价物** | 改为读 `node_modules/next/dist/docs/` 对应章节 + `docs/engineering-map.md` 定位文件 |
| `next-dev-loop` 完整流程 | 手动三步：`npm run dev:local` → 内置浏览器打开页面 → 截图确认 | 没有封装脚本，逐步骤做 |
| 代码级调试（console 报错 / network / 页面内执行 JS） | chrome-devtools MCP（CDP 通道） | 内置浏览器与浏览器扩展**都没有** `evaluate`/`network`/`console`，这类只能走 CDP |
| `npm run check` / `npm run check:fast` | **同左，命令不变** | 这是项目脚本，与执行者无关 |

## 三条不因换工具而改变的红线

1. **规则以 `AGENTS.md` / `docs/method.md` 为准。** 本文件只映射工具名；两者冲突时以那两份为准。
2. **界面改动必须在浏览器里看到真实渲染。** 工具换了，判据不换——类型检查和测试通过不等于界面没问题。
3. **需要登录态、或操作会写入真实数据 → 停下来找他。** 不因为换了执行工具就放宽，
   也不许拿他的账号代替他登录。

## 已知能力差异（会影响做法，不是规则）

- **WorkBuddy 内置浏览器没有他的日常浏览器登录态。** 需要登录的站点，必须由他本人在界面上登录一次。
- **内置浏览器读不了长正文**：`dom_cua_get_visible_dom` 只返回过滤后的可见可交互节点，
  要正文得靠截图或 WebFetch。所以「读内容」和「看渲染」是两件不同的事，别混用。
- **`git` 操作两种执行者都能做**，但提交前后都要确认当前分支与工作区状态（这条 `AGENTS.md` 已写）。

## 什么时候更新这份文件

- `AGENTS.md` 的「工具分工」段改动时
- 本项目新增执行工具、或 WorkBuddy 侧工具能力变化时
