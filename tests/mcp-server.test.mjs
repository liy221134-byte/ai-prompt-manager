import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer, readWriteMode } from "../scripts/mcp-server.ts";
import { PromptDatabase } from "../src/lib/server/prompt-database.ts";
import { buildMcpCreateAsset } from "../src/lib/mcp-write.ts";

const now = "2026-09-23T12:00:00.000Z";

const readToolNames = [
  "list_projects",
  "search_prompts",
  "get_asset",
  "list_rules",
  "list_graph_nodes",
  "analyze_impact",
];
const writeToolNames = [
  "create_asset",
  "update_asset",
  "set_asset_status",
  "import_documents",
  "import_graph_nodes",
];

// 每次用一条临时 SQLite 库起一个真服务，客户端走 SDK 自带的内存传输
async function createHarness(options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "mcp-server-"));
  const database = new PromptDatabase(join(dir, "prompts.sqlite"));
  const server = createMcpServer({
    database,
    now: () => now,
    allowWrite: options.allowWrite ?? true,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return {
    database,
    client,
    async close() {
      await client.close();
      database.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function readText(result) {
  return (result.content ?? [])
    .map((item) => ("text" in item ? item.text : ""))
    .join("\n");
}

test("工具清单：默认带写工具，MCP_READ_ONLY=1 时只剩查询", async () => {
  assert.equal(readWriteMode({}), true);
  assert.equal(readWriteMode({ MCP_READ_ONLY: "1" }), false);

  const writable = await createHarness();

  try {
    const names = (await writable.client.listTools()).tools.map(
      (tool) => tool.name,
    );

    assert.deepEqual(names, [...readToolNames, ...writeToolNames]);
  } finally {
    await writable.close();
  }

  const readOnly = await createHarness({ allowWrite: false });

  try {
    const names = (await readOnly.client.listTools()).tools.map(
      (tool) => tool.name,
    );

    assert.deepEqual(names, readToolNames);
  } finally {
    await readOnly.close();
  }
});

test("查询工具读的是库里的真实数据", async () => {
  const harness = await createHarness();

  try {
    const projects = readText(
      await harness.client.callTool({ name: "list_projects", arguments: {} }),
    );

    assert.match(projects, /默认项目/);

    const created = await harness.client.callTool({
      name: "create_asset",
      arguments: {
        assetType: "prompt",
        title: "接口评审助手",
        content: "帮我评审这个接口设计，重点看类型安全",
        category: "评审",
        tags: ["接口"],
        useCase: "评审接口时用",
      },
    });

    assert.equal(created.isError ?? false, false);
    assert.match(readText(created), /已新建提示词「接口评审助手」/);

    const search = readText(
      await harness.client.callTool({
        name: "search_prompts",
        arguments: { query: "类型安全" },
      }),
    );

    assert.match(search, /接口评审助手/);
    assert.match(search, /帮我评审这个接口设计/);

    const createdAsset = harness.database
      .listAssets()
      .find((asset) => asset.title === "接口评审助手");

    assert.ok(createdAsset, "新建的提示词应该进库");
    assert.equal(createdAsset.source.sourceType, "ai");
  } finally {
    await harness.close();
  }
});

test("新建的节点能查到，编号重复时报错且不写入", async () => {
  const harness = await createHarness();

  try {
    const first = await harness.client.callTool({
      name: "create_asset",
      arguments: {
        assetType: "graph_node",
        nodeType: "requirement",
        code: "REQ-001",
        title: "需求一：资产入库",
        content: "把资产入库",
      },
    });

    assert.equal(first.isError ?? false, false);

    const nodes = readText(
      await harness.client.callTool({
        name: "list_graph_nodes",
        arguments: { nodeType: "requirement" },
      }),
    );

    assert.match(nodes, /REQ-001/);

    const duplicate = await harness.client.callTool({
      name: "create_asset",
      arguments: {
        assetType: "graph_node",
        nodeType: "requirement",
        code: "req-001",
        title: "重复编号",
        content: "说明",
      },
    });

    assert.equal(duplicate.isError, true);
    assert.match(readText(duplicate), /编号「REQ-001」已经被「需求一：资产入库」用了/);
    assert.equal(
      harness.database
        .listAssets()
        .filter((asset) => asset.assetType === "graph_node").length,
      1,
    );
  } finally {
    await harness.close();
  }
});

test("改资产会写新版本，改状态会归档", async () => {
  const harness = await createHarness();

  try {
    await harness.client.callTool({
      name: "create_asset",
      arguments: {
        assetType: "rule",
        title: "必须校验输入",
        content: "所有外部输入都要校验。",
      },
    });

    const rule = harness.database
      .listAssets()
      .find((asset) => asset.assetType === "rule");

    assert.ok(rule);
    const updated = await harness.client.callTool({
      name: "update_asset",
      arguments: { asset: rule.id, content: "所有外部输入都要在边界处校验。" },
    });

    assert.equal(updated.isError ?? false, false);
    assert.match(readText(updated), /旧版本保留在历史里/);

    const afterUpdate = harness.database
      .listAssets()
      .find((asset) => asset.id === rule.id);

    assert.equal(afterUpdate.content, "所有外部输入都要在边界处校验。");
    assert.equal(afterUpdate.title, "必须校验输入");
    assert.equal(harness.database.listAssetVersions(rule.id).length, 2);

    const archived = await harness.client.callTool({
      name: "set_asset_status",
      arguments: { asset: rule.id, status: "archived" },
    });

    assert.match(readText(archived), /已归档/);
    assert.equal(
      harness.database.listAssets().find((asset) => asset.id === rule.id).status,
      "archived",
    );
    assert.equal(harness.database.listAssetVersions(rule.id).length, 3);
  } finally {
    await harness.close();
  }
});

test("影响分析把关系算给 AI 看", async () => {
  const harness = await createHarness();

  try {
    await harness.client.callTool({
      name: "create_asset",
      arguments: {
        assetType: "graph_node",
        nodeType: "requirement",
        code: "REQ-001",
        title: "需求一：资产入库",
        content: "把资产入库",
      },
    });

    const node = harness.database
      .listAssets()
      .find((asset) => asset.assetType === "graph_node");

    assert.ok(node);
    // 关系目前只能从界面或导入建立，这里直接按同一字段结构塞一条
    const seeded = buildMcpCreateAsset(
      {
        assetType: "rule",
        projectId: node.projectId,
        title: "需求一必须保留原文",
        content: "入库时保留原文。",
      },
      { now, assets: harness.database.listAssets() },
    );

    seeded.asset.metadata.relations = [
      {
        targetAssetId: node.id,
        relationType: "reference",
        note: "引用需求一",
      },
    ];
    harness.database.createAsset(seeded);

    const impact = readText(
      await harness.client.callTool({
        name: "analyze_impact",
        arguments: { node: "req-001" },
      }),
    );

    assert.match(impact, /REQ-001｜需求一：资产入库/);
    assert.match(impact, /谁指向它（1）/);
    assert.match(impact, /需求一必须保留原文/);
  } finally {
    await harness.close();
  }
});

test("找不到的项目和资产都返回中文提示，不抛异常", async () => {
  const harness = await createHarness();

  try {
    const projectMiss = await harness.client.callTool({
      name: "search_prompts",
      arguments: { project: "不存在的项目" },
    });

    assert.equal(projectMiss.isError, true);
    assert.match(readText(projectMiss), /没找到项目「不存在的项目」/);

    const assetMiss = await harness.client.callTool({
      name: "get_asset",
      arguments: { asset: "没有这条" },
    });

    assert.equal(assetMiss.isError, true);
    assert.match(readText(assetMiss), /没有唯一匹配/);
  } finally {
    await harness.close();
  }
});

test("批量灌节点：同类型同编号跳过，其余按编号新建", async () => {
  const harness = await createHarness();

  try {
    const result = readText(
      await harness.client.callTool({
        name: "import_graph_nodes",
        arguments: {
          nodes: [
            {
              nodeType: "requirement",
              code: "REQ-001",
              title: "需求一",
              content: "第一条需求的说明。",
            },
            {
              nodeType: "requirement",
              code: "REQ-002",
              title: "需求二",
              content: "第二条需求的说明。",
            },
          ],
        },
      }),
    );

    assert.match(result, /新建 2 个节点，跳过 0 个/);
    assert.match(result, /REQ-001 需求一/);

    const again = readText(
      await harness.client.callTool({
        name: "import_graph_nodes",
        arguments: {
          nodes: [
            {
              nodeType: "requirement",
              code: "req-001",
              title: "需求一（重复编号）",
              content: "重复编号的说明。",
            },
            {
              nodeType: "requirement",
              code: "REQ-003",
              title: "需求三",
              content: "第三条需求的说明。",
            },
          ],
        },
      }),
    );

    assert.match(again, /新建 1 个节点，跳过 1 个/);
    assert.match(again, /已经有「需求一」/);
  } finally {
    await harness.close();
  }
});

test("按目录批量灌文档：先 dryRun 看不写，再真导，重复的跳过", async () => {
  const directory = mkdtempSync(join(tmpdir(), "mcp-docs-"));
  const harness = await createHarness();

  try {
    writeFileSync(join(directory, "架构说明.md"), "# 架构\n\n正文。", "utf8");
    writeFileSync(join(directory, "验收清单.md"), "# 验收\n\n步骤。", "utf8");

    const dryRun = readText(
      await harness.client.callTool({
        name: "import_documents",
        arguments: { directoryPath: directory, dryRun: true },
      }),
    );

    assert.match(dryRun, /可导入 2 份/);
    assert.match(dryRun, /这是 dryRun，没有写库/);

    const first = readText(
      await harness.client.callTool({
        name: "import_documents",
        arguments: { directoryPath: directory, documentType: "架构说明" },
      }),
    );

    assert.match(first, /已导入 2 份/);

    const second = readText(
      await harness.client.callTool({
        name: "import_documents",
        arguments: { directoryPath: directory },
      }),
    );

    assert.match(second, /可导入 0 份，跳过 2 份/);
    assert.match(second, /项目里已有同名文档/);
  } finally {
    await harness.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
