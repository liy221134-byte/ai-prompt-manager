# 本机 MCP 服务

## 用途

让 AI 在开发过程中直接查你的库（提示词、规则、文档、图谱节点、影响分析），
也能把结果写回来（新建、编辑、改状态）。数据不出本机：服务只读写本机 SQLite，
不开端口、不需要账号和密钥。

## 启动

```bash
npm run mcp
```

平时不用手动跑——把下面这段配置放进 AI 客户端的 MCP 配置里，客户端会自己拉起它。

### 客户端配置（通用形态）

用 `mcpServers` 字段的客户端（Claude Code、Cursor 这类）：

```json
{
  "mcpServers": {
    "ai-prompt-manager": {
      "command": "npm",
      "args": ["--prefix", "E:/codeX项目", "run", "mcp"]
    }
  }
}
```

Codex 的 `config.toml` 用同样的字段名（`command`／`args`／`env`），写成段：

```toml
[mcp_servers.ai-prompt-manager]
command = "npm"
args = ["--prefix", "E:/codeX项目", "run", "mcp"]
```

也可以不用 npm，直接用 node 指到脚本：

```json
{
  "command": "node",
  "args": [
    "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
    "--disable-warning=ExperimentalWarning",
    "E:/codeX项目/scripts/mcp-server.ts"
  ]
}
```

库文件按**脚本所在仓库**定位，和客户端在哪个目录启动无关；要指到别的库（例如副本）时，
在配置里加环境变量 `PROMPT_DB_PATH`。

## 环境变量

| 变量 | 作用 | 默认 |
| --- | --- | --- |
| `PROMPT_DB_PATH` | 指定要读写的 SQLite 文件 | 仓库里的 `.data/prompts.sqlite` |
| `MCP_READ_ONLY` | 设成 `1` 时只注册查询工具，AI 看不到写工具 | 不设，即可读可写 |

## 工具清单

查询（六个）：

| 工具 | 做什么 |
| --- | --- |
| `list_projects` | 有哪些项目、各自多少条资产 |
| `search_prompts` | 按项目、关键词、标签搜提示词，返回正文 |
| `get_asset` | 按标识或标题取一条资产的正文、元数据和关系 |
| `list_rules` | 按项目列规则，可按层级／类型／范围筛，带理由和来源片段 |
| `list_graph_nodes` | 按项目列图谱节点（编号、路径、备注） |
| `analyze_impact` | 按节点编号算「指向谁 / 谁指向它 / 间接影响」 |

写入（五个，`MCP_READ_ONLY=1` 时不注册）：

| 工具 | 做什么 | 边界 |
| --- | --- | --- |
| `create_asset` | 新建提示词／规则／文档／图谱节点／模板 | 只新增；图谱节点编号重复会被拦下 |
| `update_asset` | 改标题、正文、说明和元数据 | 只覆盖传了的字段；每次都写一条新版本 |
| `set_asset_status` | 改状态（草稿／待确认／活跃／已废弃／已归档） | 归档不删内容，历史版本都在 |
| `import_documents` | 把一个**本机目录**里的 Markdown／纯文本按批导成项目文档 | 原样入库不走 AI；同名文档默认跳过；先加 `dryRun` 看不写库 |
| `import_graph_nodes` | 按编号批量新建图谱节点（需求／模块／数据／接口／测试） | 同类型同编号已存在就跳过；不覆盖已有正文；节点说明必填 |

批量入库这两个是给「把一批项目材料一次灌进来」用的：文档走目录、节点走编号清单。
典型用法是让 AI 先 `import_documents` 加 `dryRun` 列出会导入哪些，你确认后去掉
`dryRun` 再来一次；节点则直接给一份带编号的清单。

**没有删除类工具**：不进垃圾箱、不做永久删除、不做清空垃圾箱。AI 能做的永远只是
你在界面上能做的，且不多一项（技术档案和项目不在开放范围内）。

## 数据边界

- 查询结果会进入你和 AI 的对话上下文——和「把编译产物复制粘贴给 AI」是同一件事，
  区别只是由 AI 主动发起。
- 写入会直接改本机库；每条写入都会在资产历史版本里留痕，界面上能看到也能回退。
- 新建的资产来源标成「AI」，方便你在列表和详情里分辨哪些是它写的。
- 不写日志：服务不记录查询内容和写入内容，只在启动时往 stderr 打一行库文件位置。

## 排查

| 现象 | 先看什么 |
| --- | --- |
| 客户端连不上 | 在仓库目录手动跑一次 `npm run mcp`，看 stderr 的中文提示；直接跑能起来，问题在客户端配置 |
| 查到的是空库 | 看启动那行 stderr 里的库文件路径；客户端和界面用的不是同一个文件时，用 `PROMPT_DB_PATH` 指过去 |
| 改了但界面没变 | 界面要重新拉一次数据（刷新页面）；MCP 每次都重新读库，本身没有缓存 |
| 只想让它查 | 配置里加 `"env": { "MCP_READ_ONLY": "1" }` |
