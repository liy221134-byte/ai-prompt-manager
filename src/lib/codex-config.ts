// Codex 的 MCP 接入：定位 / 生成 / 替换 / 删除 config.toml 里的 `[mcp_servers.<名字>]` 这一段。
//
// 只做纯文本处理，不引 TOML 解析依赖：这一段就是「一个表头到下一个表头之间」，
// 用不着整个解析器。除这一段之外，文件里别的行要求逐字节不变。

export const MCP_SERVER_NAME = "ai-prompt-manager";

// 配置文件路径跟着 Codex 自己的规则走：优先 CODEX_HOME，没有就用家目录下的 .codex
export function resolveCodexConfigPath(input: {
  env: Record<string, string | undefined>;
  homeDir: string;
}) {
  const codexHome = input.env.CODEX_HOME?.trim();
  const base =
    codexHome && codexHome.length > 0
      ? codexHome
      : joinPath(input.homeDir, ".codex");

  return joinPath(base, "config.toml");
}

// 备份固定同目录、固定名字：只留最近一次改前的状态，不堆文件
export function resolveCodexBackupPath(configPath: string) {
  return `${configPath}.bak`;
}

function joinPath(base: string, leaf: string) {
  const trimmed = base.replace(/[\\/]+$/, "");
  const separator =
    trimmed.includes("\\") && !trimmed.includes("/") ? "\\" : "/";

  return `${trimmed}${separator}${leaf}`;
}

// 要写进去的那一段：订阅本仓库的 MCP 服务，不带任何密钥
export function buildMcpServerBlock(input: { projectRoot: string }) {
  const root = input.projectRoot.replace(/\\/g, "/").replace(/\/+$/, "");

  return [
    `[mcp_servers.${MCP_SERVER_NAME}]`,
    'command = "npm"',
    `args = ["--prefix", "${root}", "run", "mcp"]`,
  ].join("\n");
}

// 这一段在文件里的行范围：从表头到下一个表头之前。
//
// 按 TOML 语义，表头之间的键值都属于上面那张表——所以「这一段」就是表头到下一个表头之间的
// 全部内容，中间不会夹着别的表的键。末尾的空行是段落之间的分隔，不算这一段的内容。
function findBlockRange(lines: string[], name: string) {
  const header = `[mcp_servers.${name}]`;
  const start = lines.findIndex((line) => line.trim() === header);

  if (start < 0) {
    return null;
  }

  let end = lines.length;

  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s*\[/.test(lines[index])) {
      end = index;
      break;
    }
  }

  while (end > start + 1 && lines[end - 1].trim() === "") {
    end -= 1;
  }

  return { start, end };
}

export function readMcpServerBlock(input: { content: string; name: string }) {
  const lines = input.content.split("\n");
  const range = findBlockRange(lines, input.name);

  return range ? lines.slice(range.start, range.end).join("\n") : null;
}

export type CodexMcpSetupState =
  | { kind: "missing" }
  | { kind: "same" }
  | { kind: "different"; current: string };

// 现在的状态：没接入 / 已经一致 / 有但内容不同（不同就把当前那段带出来给人看）
export function describeMcpSetup(input: {
  content: string;
  name: string;
  desiredBlock: string;
}): CodexMcpSetupState {
  const current = readMcpServerBlock({
    content: input.content,
    name: input.name,
  });

  if (current === null) {
    return { kind: "missing" };
  }

  return current === input.desiredBlock
    ? { kind: "same" }
    : { kind: "different", current };
}

function appendBlock(content: string, block: string) {
  if (content.trim() === "") {
    return `${block}\n`;
  }

  return `${content.replace(/\n+$/, "")}\n\n${block}\n`;
}

// 写入或更新这一段；已经一致时结果和原文一模一样
export function upsertMcpServerBlock(input: {
  content: string;
  name: string;
  block: string;
}) {
  const lines = input.content.split("\n");
  const range = findBlockRange(lines, input.name);

  if (!range) {
    return appendBlock(input.content, input.block);
  }

  return [
    ...lines.slice(0, range.start),
    ...input.block.split("\n"),
    ...lines.slice(range.end),
  ].join("\n");
}

// 删掉这一段，别的行原样保留；本来就没有就原样返回
export function removeMcpServerBlock(input: {
  content: string;
  name: string;
}) {
  const lines = input.content.split("\n");
  const range = findBlockRange(lines, input.name);

  if (!range) {
    return input.content;
  }

  return [...lines.slice(0, range.start), ...lines.slice(range.end)].join("\n");
}
