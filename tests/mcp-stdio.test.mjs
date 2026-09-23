import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// 这个用例真的把 `npm run mcp` 拉起来，客户端按标准输入输出连过去，
// 验证文档里那条启动命令和真实传输都能用。
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function buildEnv(extra) {
  return Object.fromEntries(
    Object.entries({ ...process.env, ...extra }).filter(
      (entry) => typeof entry[1] === "string",
    ),
  );
}

async function connectClient(options) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--disable-warning=ExperimentalWarning",
      "scripts/mcp-server.ts",
    ],
    cwd: projectRoot,
    env: buildEnv(options.env),
    stderr: "pipe",
  });
  const client = new Client({ name: "stdio-test", version: "1.0.0" });

  await client.connect(transport);

  return client;
}

test("真的启动本地 MCP 服务：能列工具、能查、能写、能读回", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mcp-stdio-"));
  const databasePath = join(dir, "prompts.sqlite");
  const client = await connectClient({
    env: { PROMPT_DB_PATH: databasePath, MCP_READ_ONLY: "0" },
  });

  try {
    const names = (await client.listTools()).tools.map((tool) => tool.name);

    assert.ok(names.includes("create_asset"));
    assert.ok(names.includes("analyze_impact"));

    const created = await client.callTool({
      name: "create_asset",
      arguments: {
        assetType: "prompt",
        title: "走真实传输存下的提示词",
        content: "这段正文通过标准输入输出写进本机库。",
        category: "评审",
      },
    });

    assert.equal(created.isError ?? false, false);

    const found = await client.callTool({
      name: "search_prompts",
      arguments: { query: "标准输入输出" },
    });

    assert.match(found.content[0].text, /走真实传输存下的提示词/);
  } finally {
    await client.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("只读模式启动时看不到写工具", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mcp-stdio-readonly-"));
  const client = await connectClient({
    env: {
      PROMPT_DB_PATH: join(dir, "prompts.sqlite"),
      MCP_READ_ONLY: "1",
    },
  });

  try {
    const names = (await client.listTools()).tools.map((tool) => tool.name);

    assert.deepEqual(names, [
      "list_projects",
      "search_prompts",
      "get_asset",
      "list_rules",
      "list_graph_nodes",
      "analyze_impact",
    ]);
  } finally {
    await client.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
