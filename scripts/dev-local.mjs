// 本机数据模式启动开发服务。只有在这个模式下，这两个能力才可用：
//   1）导入工程 →「分析代码目录」：要读你本机的目录
//   2）MCP 服务（另一个终端跑 npm run mcp）：读写 .data/prompts.sqlite
//
// 用法：npm run dev:local
// 数据落在 .data/prompts.sqlite（可以用 PROMPT_DB_PATH 指向别的库文件）。

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

process.env.NEXT_PUBLIC_DATA_MODE = "local";
process.env.PROMPT_DB_PATH ??= path.join(
  projectRoot,
  ".data",
  "prompts.sqlite",
);

console.log("本机数据模式：数据库文件 =", process.env.PROMPT_DB_PATH);

// 一条命令字符串配 shell，避免 Windows 上 next.cmd 找不到，也避免参数转义告警
const child = spawn("next dev", {
  cwd: projectRoot,
  env: process.env,
  shell: true,
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
