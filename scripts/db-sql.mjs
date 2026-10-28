// 对生产库执行 SQL（DDL、一次性数据修正），走 Supabase Management API。
//
// 为什么不用 `supabase db push`：那个要数据库密码，本机没有，也不该为了跑几条
// 迁移把长期密码存下来。Management API 只要一个 Personal Access Token（sbp_），
// 在 dashboard 里点几下就能生成、随时吊销，粒度比数据库密码细。
//
// 用法：
//   node scripts/db-sql.mjs --sql "select version()"
//   node scripts/db-sql.mjs --file supabase/migrations/20261028170000_xxx.sql
//   node scripts/db-sql.mjs --file xxx.sql --dry-run        只打印，不发请求
//
// 需要 .env.local 里的 SUPABASE_ACCESS_TOKEN（sbp_ 开头）。
// 生成地址：https://supabase.com/dashboard/account/tokens
//
// 注意：执行迁移文件**不会**写入 supabase_migrations.schema_migrations。
// 走这条路的迁移要另记一笔，否则 GitHub 自动部署会认为它没应用过而重跑。

import { readFileSync, existsSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 只取脚本要用的两三个变量，不引 dotenv —— 少一个依赖，也少一处意外覆盖。 */
function readEnv() {
  const env = { ...process.env };
  const file = resolve(ROOT, ".env.local");
  if (!existsSync(file)) return env;

  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const at = trimmed.indexOf("=");
    if (at < 0) continue;
    const key = trimmed.slice(0, at).trim();
    if (env[key]) continue; // 真实环境变量优先于文件
    env[key] = trimmed.slice(at + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

/** 从项目 URL 里取 ref：https://<ref>.supabase.co */
function projectRef(url) {
  const match = /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url ?? "");
  return match ? match[1] : null;
}

function parseArgs(argv) {
  const options = { sql: null, file: null, dryRun: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--sql") options.sql = argv[++i] ?? null;
    else if (arg === "--file") options.file = argv[++i] ?? null;
    else if (arg === "--help" || arg === "-h") options.help = true;
  }

  return options;
}

function usage() {
  console.log(`对生产库执行 SQL（Supabase Management API）

用法：
  node scripts/db-sql.mjs --sql "select 1"
  node scripts/db-sql.mjs --file path/to.sql [--dry-run]

需要 .env.local 里的 SUPABASE_ACCESS_TOKEN（sbp_ 开头）。`);
}

/** 把 HTTP 状态翻成人能看懂的一句话，别让人对着 401 猜。 */
function explain(status, body) {
  const message = typeof body === "object" && body?.message ? body.message : String(body).slice(0, 200);
  switch (status) {
    case 401:
      return `凭据无效：${message}。SUPABASE_ACCESS_TOKEN 可能过期或被吊销，去 dashboard 重新生成一个`;
    case 403:
      return `token 没有这个项目的权限：${message}。确认 token 属于该项目所在的组织`;
    case 404:
      return `项目不存在：${message}。检查 NEXT_PUBLIC_SUPABASE_URL 里的 project ref`;
    default:
      return `执行失败（HTTP ${status}）：${message}`;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  const env = readEnv();
  const ref = projectRef(env.NEXT_PUBLIC_SUPABASE_URL);
  if (!ref) {
    console.error("读不到 project ref：.env.local 里的 NEXT_PUBLIC_SUPABASE_URL 缺失或格式不对。");
    process.exit(1);
  }

  let query = options.sql;
  if (options.file) {
    const file = resolve(ROOT, options.file);
    if (!existsSync(file)) {
      console.error(`文件不存在：${relative(ROOT, file)}`);
      process.exit(1);
    }
    query = readFileSync(file, "utf8");
  }

  if (!query || !query.trim()) {
    console.error("没有要执行的 SQL。用 --sql 或 --file 指定。");
    usage();
    process.exit(1);
  }

  const preview = query.trim().split("\n").slice(0, 6).join("\n");
  console.log(`目标项目：${ref}`);
  console.log(`SQL 开头：\n${preview}\n…（共 ${query.trim().split("\n").length} 行）`);

  if (options.dryRun) {
    console.log("\n[dry-run] 未发送请求。");
    return;
  }

  const token = env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error(
      "\n缺 SUPABASE_ACCESS_TOKEN。去 https://supabase.com/dashboard/account/tokens 生成一个，" +
        "写进 .env.local（该文件已在 .gitignore 里）。",
    );
    process.exit(1);
  }

  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  if (!response.ok) {
    console.error(explain(response.status, body));
    process.exit(1);
  }

  // 管理 API 返回的是结果集数组；DDL 通常返回空数组
  const rows = Array.isArray(body) ? body : [];
  console.log(`\n执行成功，返回 ${rows.length} 行。`);
  if (rows.length > 0) {
    console.log(JSON.stringify(rows.slice(0, 20), null, 2));
    if (rows.length > 20) console.log(`…还有 ${rows.length - 20} 行未显示`);
  }
}

await main();
