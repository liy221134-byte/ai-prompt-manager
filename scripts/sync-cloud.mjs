// 本地 ↔ 云端定期同步（方案 A）。两边各一份全量，按资产比时间：
//   只增不删 / 谁新谁赢 / 时间一样但内容不同就两边都留、列进待裁决。
//
// 用法：
//   npm run sync -- --dry-run          只看会推什么、拉什么，不写
//   npm run sync                       两个方向都做
//   npm run sync -- --push             只推（本机 → 云端）
//   npm run sync -- --pull             只拉（云端 → 本机）
//   npm run sync -- --export-push-file 把"要推的"导出成备份文件
//                                      （本机连不上云端时，用线上站点的
//                                       数据管理 → 导入备份，走 Vercel 的网络推上去）
//
// 需要 .env.local 里的 NEXT_PUBLIC_SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY。
// 写入云端时用服务角色直连；写本机走本机库这一层，每次写入都留版本记录。

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { createAssetBackup } from "../src/lib/prompt-backup.ts";
import { planAssetSync } from "../src/lib/asset-sync.ts";
import { getPromptDatabase } from "../src/lib/server/prompt-database.ts";
import { createAssetVersionId } from "../src/lib/asset-versions.ts";

const projectRoot = resolve(import.meta.dirname, "..");

// Node 不读 Windows 的「系统代理」设置，而代理工具常常只改系统设置、不写环境变量。
// 这里读一次系统代理；缺环境变量时带上它重新跑一遍自己，让 npm run sync 直接能用。
function readSystemProxy() {
  if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.SYNC_PROXY_READY) {
    return null;
  }

  try {
    const output = execFileSync(
      "reg",
      [
        "query",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
        "/v",
        "ProxyServer",
      ],
      { encoding: "utf8" },
    );

    return output.match(/ProxyServer\s+REG_SZ\s+(\S+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

const systemProxy = readSystemProxy();

if (systemProxy) {
  const child = spawnSync(
    process.execPath,
    ["--use-env-proxy", ...process.argv.slice(1)],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        HTTPS_PROXY: `http://${systemProxy}`,
        HTTP_PROXY: `http://${systemProxy}`,
        SYNC_PROXY_READY: "1",
      },
    },
  );

  process.exit(child.status ?? 1);
}

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const direction = args.includes("--push")
  ? "push"
  : args.includes("--pull")
    ? "pull"
    : "both";
const exportPushFile = args.includes("--export-push-file");
const database = getPromptDatabase();
const now = new Date().toISOString();

function readEnvFile() {
  const env = {};

  for (const line of readFileSync(join(projectRoot, ".env.local"), "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);

    if (match) {
      env[match[1]] = match[2].trim();
    }
  }

  return env;
}

const env = readEnvFile();
const cloudUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!cloudUrl || !serviceKey) {
  throw new Error("读不到云端配置：检查 .env.local 里的 URL 和 service role key。");
}

const headers = {
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`,
  "content-type": "application/json",
};

async function cloudGet(path) {
  let response;

  try {
    response = await fetch(`${cloudUrl}/rest/v1/${path}`, { headers });
  } catch (error) {
    throw new Error(
      "连不上云端（TLS 握手被重置）。换一个网络再跑（例如手机热点），" +
        "或者先用 --export-push-file 导出备份文件，到线上站点用「数据管理 → 导入备份」推上去。" +
        `原始错误：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `读云端失败（${path}，HTTP ${response.status}）。` +
        "如果本机连不上 Supabase，换网络或用 --export-push-file 走线上站点导入。",
    );
  }

  return response.json();
}

async function cloudUpsert(table, rows) {
  let response;

  try {
    response = await fetch(`${cloudUrl}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...headers, prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
    });
  } catch (error) {
    throw new Error(
      "连不上云端（TLS 握手被重置），这次同步没有写出任何东西。" +
        `原始错误：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.ok) {
    throw new Error(`写云端失败（${table}，HTTP ${response.status}）：${(await response.text()).slice(0, 200)}`);
  }
}

// 云端行的形状：列名是下划线，元数据是 jsonb
function toCloudRow(asset, userId) {
  return {
    user_id: userId,
    id: asset.id,
    project_id: asset.projectId,
    asset_type: asset.assetType,
    title: asset.title,
    summary: asset.summary,
    content: asset.content,
    metadata_json: asset.metadata,
    source_type: asset.source.sourceType,
    source_asset_id: asset.source.sourceAssetId,
    import_batch_id: asset.source.importBatchId,
    original_filename: asset.source.originalFilename,
    current_version_id: asset.currentVersionId,
    status: asset.status,
    archived_at: asset.archivedAt,
    deleted_at: asset.deletedAt,
    deleted_reason: asset.deletedReason,
    created_at: asset.createdAt,
    updated_at: asset.updatedAt,
  };
}

function toCloudAsset(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    assetType: row.asset_type,
    title: row.title,
    summary: row.summary ?? "",
    content: row.content ?? "",
    metadata: row.metadata_json ?? {},
    source: {
      sourceType: row.source_type,
      sourceAssetId: row.source_asset_id,
      importBatchId: row.import_batch_id,
      originalFilename: row.original_filename,
    },
    currentVersionId: row.current_version_id,
    status: row.status,
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
    deletedReason: row.deleted_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toProject(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    status: row.status,
    stage: row.stage,
    riskLevel: row.risk_level,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function toCloudProjectRow(project, userId) {
  return {
    user_id: userId,
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    stage: project.stage,
    risk_level: project.riskLevel,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
    archived_at: project.archivedAt,
  };
}

const localProjects = database.listProjects();
const localAssets = database.listAssets();
let cloudProjects = [];
let cloudAssets = [];
let cloudReachable = true;

try {
  cloudProjects = (await cloudGet("projects?select=*")).map(toProject);
  cloudAssets = (await cloudGet("assets?select=*")).map(toCloudAsset);
} catch (error) {
  if (!exportPushFile) {
    throw error;
  }

  // 本机连不上云端时，导出一份「全量本机备份」：线上站点的导入是只增不覆盖，
  // 导入它就等于把本机多出来的东西推上去
  cloudReachable = false;
  console.log("连不上云端，改为导出全量本机备份（线上导入只增不覆盖）。");
}

const plan = planAssetSync({
  localProjects,
  localAssets,
  cloudProjects,
  cloudAssets,
  direction,
});

console.log("本机：", { projects: localProjects.length, assets: localAssets.length });
console.log("云端：", { projects: cloudProjects.length, assets: cloudAssets.length });
console.log("这次要动：", {
  推到云端: plan.assetsToPush.length,
  拉到本机: plan.assetsToPull.length,
  待裁决: plan.conflicts.length,
  两边一样: plan.unchanged,
  新建项目: plan.projectsToCreateRemotely.length + plan.projectsToCreateLocally.length,
});

for (const conflict of plan.conflicts) {
  console.log(
    `  待裁决：${conflict.local.title}（本机 ${conflict.local.updatedAt} / 云端 ${conflict.cloud.updatedAt}）`,
  );
}

for (const asset of plan.assetsToPull) {
  console.log(`  拉回本机：${asset.title}（云端 ${asset.updatedAt}）`);
}

if (exportPushFile) {
  const projectsToExport = cloudReachable
    ? localProjects.filter((project) =>
        plan.assetsToPush.some((asset) => asset.projectId === project.id),
      )
    : localProjects;
  const assetsToExport = cloudReachable ? plan.assetsToPush : localAssets;
  const backup = createAssetBackup({
    projects: projectsToExport,
    assets: assetsToExport,
  });
  const filePath = join(projectRoot, `sync-push-${now.slice(0, 10)}.json`);

  writeFileSync(filePath, `${JSON.stringify(backup, null, 2)}\n`, "utf8");
  console.log(
    `已导出备份文件：${filePath}（${backup.projects.length} 个项目、${backup.assets.length} 条资产）`,
  );
  console.log("到线上站点用「数据管理 → 导入备份」上传；导入只新增、不覆盖。");

  if (!cloudReachable) {
    database.close();
    process.exit(0);
  }
}

if (isDryRun) {
  console.log("--dry-run：只看不写。");
  database.close();
  process.exit(0);
}

// ---------- 拉：云端 → 本机 ----------
if (plan.assetsToPull.length > 0 || plan.projectsToCreateLocally.length > 0) {
  const existingLocal = new Set(localAssets.map((asset) => asset.id));
  const existingProjects = new Set(localProjects.map((project) => project.id));

  for (const project of plan.projectsToCreateLocally) {
    if (!existingProjects.has(project.id)) {
      database.createProject({ ...project, id: project.id });
    }
  }

  for (const asset of plan.assetsToPull) {
    if (existingLocal.has(asset.id)) {
      // 更新时当前版本标识和写入的版本标识必须一致
      const versionId = createAssetVersionId();

      database.updateAsset({
        asset: { ...asset, currentVersionId: versionId },
        versionId,
        changeReason: "从云端同步（云端更新）",
      });
      continue;
    }

    database.createAsset({
      asset,
      versionId: asset.currentVersionId,
      changeReason: "从云端同步（新增）",
    });
  }
}

// ---------- 推：本机 → 云端 ----------
if (plan.assetsToPush.length > 0 || plan.projectsToCreateRemotely.length > 0) {
  const userId =
    process.env.SYNC_USER_ID ??
    (await cloudGet("projects?select=user_id&limit=1"))[0]?.user_id;

  if (!userId) {
    throw new Error("云端的项目里读不到 user_id，先确认账号下至少有一个项目。");
  }

  if (plan.projectsToCreateRemotely.length > 0) {
    await cloudUpsert(
      "projects",
      plan.projectsToCreateRemotely.map((project) => toCloudProjectRow(project, userId)),
    );
  }

  await cloudUpsert(
    "assets",
    plan.assetsToPush.map((asset) => toCloudRow(asset, userId)),
  );

  // 每次写入云端也留一条版本记录，和界面写入保持同一个口径
  const versionRows = [];

  for (const asset of plan.assetsToPush) {
    const existing = await cloudGet(
      `asset_versions?select=version_number&asset_id=eq.${encodeURIComponent(asset.id)}&order=version_number.desc&limit=1`,
    );
    const nextNumber = (existing[0]?.version_number ?? 0) + 1;

    versionRows.push({
      user_id: userId,
      version_id: asset.currentVersionId,
      asset_id: asset.id,
      asset_type: asset.assetType,
      version_number: nextNumber,
      title: asset.title,
      summary: asset.summary,
      content: asset.content,
      metadata_json: asset.metadata,
      change_reason: "从本机同步",
      version_reason: nextNumber === 1 ? "initial" : "save",
      source_asset_ids: [],
      restored_at: null,
      expires_at: null,
      created_at: now,
    });
  }

  if (versionRows.length > 0) {
    await cloudUpsert("asset_versions", versionRows);
  }
}

console.log("同步完成。");
database.close();
