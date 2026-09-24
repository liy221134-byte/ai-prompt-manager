// 本地 MCP 服务的连通性自检：真的把 scripts/mcp-server.ts 拉起来，
// 按标准输入输出连过去，列一遍工具、查一遍项目和规则，把结果打出来。
//
// 用法：npm run mcp:check
// 只读；要查别的东西就用支持 MCP 的客户端连 `npm run mcp`。

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const databasePath =
  process.env.PROMPT_DB_PATH ?? join(projectRoot, ".data", "prompts.sqlite");

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [
    "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
    "--disable-warning=ExperimentalWarning",
    "scripts/mcp-server.ts",
  ],
  cwd: projectRoot,
  env: Object.fromEntries(
    Object.entries({
      ...process.env,
      PROMPT_DB_PATH: databasePath,
      MCP_READ_ONLY: "1",
    }).filter((entry) => typeof entry[1] === "string"),
  ),
  stderr: "pipe",
});

const client = new Client({ name: "mcp-check", version: "1.0.0" });

function readText(result) {
  return (result.content ?? [])
    .map((item) => (item.type === "text" ? item.text : ""))
    .join("\n");
}

try {
  await client.connect(transport);

  console.log("库文件：", databasePath);
  const tools = (await client.listTools()).tools.map((tool) => tool.name);
  console.log("可用工具：", tools.join("、"));

  console.log("\n--- list_projects ---");
  console.log(readText(await client.callTool({ name: "list_projects", arguments: {} })));

  const rules = readText(
    await client.callTool({
      name: "list_rules",
      arguments: { query: "发布" },
    }),
  );

  console.log("\n--- list_rules（默认项目，关键词「发布」）---");
  console.log(rules.split("\n").slice(0, 3).join("\n"));

  // 演示「查图谱节点 + 算影响分析」：这两个是本地链路（导入工程 → 图谱）的收口
  const nodes = readText(
    await client.callTool({
      name: "list_graph_nodes",
      arguments: { project: "AI提示词资产管理系统" },
    }),
  );
  const nodeLines = nodes.split("\n").filter((line) => line.startsWith("- "));
  const countOf = (label) =>
    nodeLines.filter((line) => line.includes(`｜${label}｜`)).length;

  console.log("\n--- list_graph_nodes（AI提示词资产管理系统）---");
  console.log(
    nodeLines.length === 0
      ? nodes
      : `共 ${nodeLines.length} 条：模块 ${countOf("模块")}、接口 ${countOf("接口")}、` +
          `需求 ${countOf("需求")}、数据 ${countOf("数据")}、测试 ${countOf("测试")}`,
  );

  const impact = readText(
    await client.callTool({
      name: "analyze_impact",
      arguments: { project: "AI提示词资产管理系统", node: "API-/api/health/db" },
    }),
  );

  console.log("\n--- analyze_impact（/api/health/db 这个接口）---");
  console.log(impact);
} finally {
  await client.close();
}
