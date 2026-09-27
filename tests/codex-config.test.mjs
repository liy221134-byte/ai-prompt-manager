import assert from "node:assert/strict";
import test from "node:test";

import {
  MCP_SERVER_NAME,
  buildMcpServerBlock,
  describeMcpSetup,
  removeMcpServerBlock,
  resolveCodexBackupPath,
  resolveCodexConfigPath,
  upsertMcpServerBlock,
} from "../src/lib/codex-config.ts";

const projectRoot = "E:/codeX项目";
const block = buildMcpServerBlock({ projectRoot });

test("配置文件路径：CODEX_HOME 优先，没有就用家目录下的 .codex/config.toml", () => {
  assert.equal(
    resolveCodexConfigPath({
      env: { CODEX_HOME: "D:/codex-home" },
      homeDir: "C:/Users/me",
    }),
    "D:/codex-home/config.toml",
  );
  assert.equal(
    resolveCodexConfigPath({ env: {}, homeDir: "C:/Users/me" }),
    "C:/Users/me/.codex/config.toml",
  );
  // 备份固定同目录、固定名字
  assert.equal(
    resolveCodexBackupPath("C:/Users/me/.codex/config.toml"),
    "C:/Users/me/.codex/config.toml.bak",
  );
});

test("写进去的那一段：订阅本仓库的 MCP 服务，不带密钥", () => {
  assert.match(block, /^\[mcp_servers\.ai-prompt-manager\]/);
  assert.match(block, /command = "npm"/);
  assert.match(block, /E:\/codeX项目/);
  assert.match(block, /run", "mcp"/);
  assert.equal(block.includes("key"), false);
});

test("没接入过：状态是 missing，写进去之后就有了，而且读得出来", () => {
  const before = 'model = "x"\n';

  assert.equal(
    describeMcpSetup({ content: before, name: MCP_SERVER_NAME, desiredBlock: block })
      .kind,
    "missing",
  );

  const after = upsertMcpServerBlock({
    content: before,
    name: MCP_SERVER_NAME,
    block,
  });

  assert.equal(
    describeMcpSetup({ content: after, name: MCP_SERVER_NAME, desiredBlock: block })
      .kind,
    "same",
  );
  // 原来的内容一行没少
  assert.ok(after.startsWith('model = "x"\n'));
  assert.ok(after.includes(block));
});

test("内容不一致：状态是 different 并带出当前那段；写入会换成新的，不动别的行", () => {
  const stale = [
    'model = "x"',
    "",
    "[mcp_servers.ai-prompt-manager]",
    'command = "node"',
    'args = ["old.js"]',
    "",
    "[mcp_servers.other]",
    'command = "other"',
    "",
  ].join("\n");
  const state = describeMcpSetup({
    content: stale,
    name: MCP_SERVER_NAME,
    desiredBlock: block,
  });

  assert.equal(state.kind, "different");
  assert.match(state.current, /command = "node"/);

  const after = upsertMcpServerBlock({
    content: stale,
    name: MCP_SERVER_NAME,
    block,
  });

  assert.ok(after.includes(block));
  assert.equal(after.includes('command = "node"'), false);
  // 别的表和别的行原样保留
  assert.ok(after.startsWith('model = "x"\n'));
  assert.ok(after.includes('[mcp_servers.other]\ncommand = "other"'));
});

test("同一段内容再写一次：原样返回，不做任何改动", () => {
  const once = upsertMcpServerBlock({
    content: "",
    name: MCP_SERVER_NAME,
    block,
  });

  assert.equal(
    upsertMcpServerBlock({ content: once, name: MCP_SERVER_NAME, block }),
    once,
  );
});

test("表在开头、中间、末尾三种位置都能删掉，别的行一行不动", () => {
  // 表在开头：后面跟着另一张表（按 TOML 语义，表头之间的键值属于上面那张表）
  const head = [block, "", "[mcp_servers.other]", 'command = "other"', ""].join(
    "\n",
  );
  assert.equal(
    removeMcpServerBlock({ content: head, name: MCP_SERVER_NAME }).trim(),
    '[mcp_servers.other]\ncommand = "other"',
  );

  const tail = ['model = "x"', "", block, ""].join("\n");
  assert.equal(
    removeMcpServerBlock({ content: tail, name: MCP_SERVER_NAME }).trim(),
    'model = "x"',
  );

  // 本来就没有这一段：原样返回
  const without = 'model = "x"\n';
  assert.equal(
    removeMcpServerBlock({ content: without, name: MCP_SERVER_NAME }),
    without,
  );
});
