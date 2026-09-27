import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";

import {
  MCP_SERVER_NAME,
  buildMcpServerBlock,
  describeMcpSetup,
  removeMcpServerBlock,
  resolveCodexBackupPath,
  resolveCodexConfigPath,
  upsertMcpServerBlock,
} from "../../../lib/codex-config.ts";
import { rejectLocalApiInCloudMode } from "../../../lib/server/local-data-api.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 本机 MCP 接入：读状态、接入、撤销、验证。
// 只在本机模式可用——云端在 Vercel 上，碰不到用户本机的配置文件。
// 只会动一个文件：Codex 的 config.toml，而且只动 [mcp_servers.ai-prompt-manager] 那一段。
function readConfigFile(path: string) {
  try {
    return existsSync(path) ? readFileSync(path, "utf8") : "";
  } catch {
    return "";
  }
}

function buildStatus() {
  const configPath = resolveCodexConfigPath({
    env: process.env,
    homeDir: homedir(),
  });
  const backupPath = resolveCodexBackupPath(configPath);
  const content = readConfigFile(configPath);
  const desiredBlock = buildMcpServerBlock({ projectRoot: process.cwd() });

  return {
    configPath,
    backupPath,
    fileExists: existsSync(configPath),
    hasBackup: existsSync(backupPath),
    desiredBlock,
    state: describeMcpSetup({
      content,
      name: MCP_SERVER_NAME,
      desiredBlock,
    }),
  };
}

function handleApply() {
  const status = buildStatus();
  const content = readConfigFile(status.configPath);
  const next = upsertMcpServerBlock({
    content,
    name: MCP_SERVER_NAME,
    block: status.desiredBlock,
  });

  if (next === content) {
    return Response.json({
      ok: true,
      changed: false,
      message: "已经是接好的状态，文件一个字节都没动。",
      status: buildStatus(),
    });
  }

  try {
    mkdirSync(dirname(status.configPath), { recursive: true });

    // 改前先备份，固定名字覆盖上一次——只留最近一次改前的状态。
    // 文件本来不存在就没什么可备份的，跳过，撤销时会走「只删这一段」那条路。
    if (status.fileExists) {
      writeFileSync(status.backupPath, content, "utf8");
    }

    writeFileSync(status.configPath, next, "utf8");
  } catch (error) {
    console.error("写入 Codex 配置失败", error);

    return Response.json(
      { error: "写入配置文件失败，请检查这个路径有没有写权限。" },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    changed: true,
    message: status.fileExists
      ? "已接入，改前的原文件备份成了 config.toml.bak。"
      : "已接入（这个文件之前不存在，所以没有生成备份）。",
    status: buildStatus(),
  });
}

function handleRevert() {
  const status = buildStatus();

  try {
    if (status.hasBackup) {
      const backup = readConfigFile(status.backupPath);

      writeFileSync(status.configPath, backup, "utf8");

      return Response.json({
        ok: true,
        restoredFromBackup: true,
        message: "已用备份还原配置文件。",
        status: buildStatus(),
      });
    }

    const content = readConfigFile(status.configPath);
    const next = removeMcpServerBlock({
      content,
      name: MCP_SERVER_NAME,
    });

    if (next !== content) {
      writeFileSync(status.configPath, next, "utf8");
    }

    return Response.json({
      ok: true,
      restoredFromBackup: false,
      message:
        next === content
          ? "本来就没有接入过，文件没动。"
          : "没有备份，只把接入的那一段删掉了，别的行原样保留。",
      status: buildStatus(),
    });
  } catch (error) {
    console.error("撤销 Codex 接入失败", error);

    return Response.json(
      { error: "改配置文件失败，请检查这个路径有没有写权限。" },
      { status: 500 },
    );
  }
}

type VerifyResult = {
  ok: boolean;
  tools: string[];
  elapsedMs: number;
  exitCode: number | null;
  output: string;
  error?: string;
};

// 验证 = 真跑一次项目自己的 MCP 自检脚本（scripts/check-mcp.mjs）：
// 它会起 stdio 服务、连上去、列工具、再读一遍项目和规则。全程只读。
// 不直接 import MCP 的 SDK——那个包是 devDependency，不该出现在应用路由里。
function runMcpSelfCheck(): Promise<VerifyResult> {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
        "--disable-warning=ExperimentalWarning",
        "scripts/check-mcp.mjs",
      ],
      { cwd: process.cwd(), env: process.env, windowsHide: true },
    );
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result: VerifyResult) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill();
      finish({
        ok: false,
        tools: [],
        elapsedMs: Date.now() - startedAt,
        exitCode: null,
        output: stdout.slice(-2000),
        error: "等了一分钟还没连上，已中止。",
      });
    }, 60_000);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      finish({
        ok: false,
        tools: [],
        elapsedMs: Date.now() - startedAt,
        exitCode: null,
        output: stdout.slice(-2000),
        error: error.message,
      });
    });
    child.on("close", (code) => {
      const tools = stdout
        .split("\n")
        .find((line) => line.startsWith("可用工具："))
        ?.replace("可用工具：", "")
        .split("、")
        .map((tool) => tool.trim())
        .filter(Boolean);

      finish({
        ok: code === 0 && Boolean(tools && tools.length > 0),
        tools: tools ?? [],
        elapsedMs: Date.now() - startedAt,
        exitCode: code,
        output: `${stdout.slice(-2000)}${stderr.slice(-500)}`,
      });
    });
  });
}

export async function GET() {
  const cloudModeError = rejectLocalApiInCloudMode();

  if (cloudModeError) {
    return cloudModeError;
  }

  return Response.json({ status: buildStatus() });
}

// 三个动作：接入、撤销、验证
export async function POST(request: Request) {
  const cloudModeError = rejectLocalApiInCloudMode();

  if (cloudModeError) {
    return cloudModeError;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "请求内容不是有效的 JSON。" },
      { status: 400 },
    );
  }

  const action = (body as { action?: unknown } | null)?.action;

  if (action === "apply") {
    return handleApply();
  }

  if (action === "revert") {
    return handleRevert();
  }

  if (action === "verify") {
    return Response.json({ verify: await runMcpSelfCheck() });
  }

  return Response.json({ error: "不认识的动作。" }, { status: 400 });
}
