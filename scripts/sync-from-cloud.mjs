// 把云端（Supabase）的项目和资产拉到本机库。
//
// 用的是产品自己的导入语义：**只新增、不覆盖**——本地已有同 id 的资产跳过，
// 同名项目合并到本地已有项目，垃圾箱里的内容不进备份。
//
// 用法：
//   1）另开一个终端先起本机模式：npm run dev:local
//   2）看会拉什么（不落库）：node scripts/sync-from-cloud.mjs --dry-run
//   3）真的拉：node scripts/sync-from-cloud.mjs
//
// 换端口或换地址：LOCAL_APP_URL=http://localhost:3001 node scripts/sync-from-cloud.mjs

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { createAssetBackup, planAssetImport } from "../src/lib/prompt-backup.ts";
import { createSupabasePromptDataSource } from "../src/lib/prompt-source.ts";

const projectRoot = resolve(import.meta.dirname, "..");
const localBaseUrl = process.env.LOCAL_APP_URL ?? "http://localhost:3000";
const isDryRun = process.argv.includes("--dry-run");

function readLocalEnv() {
  const content = readFileSync(join(projectRoot, ".env.local"), "utf8");
  const env = {};

  for (const line of content.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());

    if (match) {
      env[match[1]] = match[2].trim();
    }
  }

  return env;
}

async function readLocal(pathname) {
  const response = await fetch(`${localBaseUrl}${pathname}`);

  if (!response.ok) {
    throw new Error(
      `读本机接口失败（${pathname}，HTTP ${response.status}）。` +
        "先确认本机模式的服务在跑：npm run dev:local",
    );
  }

  return response.json();
}

async function writeLocal(pathname, body) {
  const response = await fetch(`${localBaseUrl}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();

    throw new Error(`写本机接口失败（${pathname}，HTTP ${response.status}）：${detail}`);
  }
}

const env = readLocalEnv();
const cloudUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!cloudUrl || !serviceRoleKey) {
  throw new Error("读不到云端配置：检查 .env.local 里的 URL 和 service role key。");
}

// 云端这边只读：用 service role 直接读表，不碰浏览器会话
const cloudSource = createSupabasePromptDataSource(
  createClient(cloudUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }),
);

const [cloudProjects, cloudAssets] = await Promise.all([
  cloudSource.fetchProjects(),
  cloudSource.fetchAssets(),
]);
const backup = createAssetBackup({
  projects: cloudProjects,
  assets: cloudAssets,
});

const [localProjectsResponse, localAssetsResponse] = await Promise.all([
  readLocal("/api/projects"),
  readLocal("/api/assets"),
]);
const localProjects = localProjectsResponse.projects ?? [];
const localAssets = localAssetsResponse.assets ?? [];

const plan = planAssetImport({
  existingProjects: localProjects,
  existingAssets: localAssets,
  backup,
});

console.log("云端：", {
  projects: cloudProjects.length,
  assets: backup.assets.length,
});
console.log("本机：", {
  projects: localProjects.length,
  assets: localAssets.length,
});
console.log("这次会新增：", {
  projects: plan.projectsToCreate.length,
  assets: plan.assetsToCreate.length,
  skipped: plan.skippedAssetIds.length,
});

if (isDryRun) {
  console.log("--dry-run：只看不写。");
  process.exit(0);
}

for (const project of plan.projectsToCreate) {
  await writeLocal("/api/projects", { project });
}

for (const asset of plan.assetsToCreate) {
  await writeLocal("/api/assets", {
    asset,
    versionId: asset.currentVersionId,
    changeReason: "从云端同步",
    versionReason: "initial",
  });
}

console.log("拉取完成。刷新本机页面就能看到。");
