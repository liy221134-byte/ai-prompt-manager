// 把一个库（默认云端 Supabase）里还缺的种子内容装上：种子资产包 + 新项目模板库。
// 走和应用同一条写入路径（save_asset RPC，按登录用户身份、RLS 生效），
// 已经存在的资产按标识跳过，可以重复执行。
//
// 用法（密码从环境变量读，避免留在命令历史里）：
//   $env:SUPABASE_PASSWORD="..."; node scripts/import-seed-content.mjs --email you@example.com
// 可选参数：--project <项目标识>（默认取云端第一个项目）、--mode cloud|local 只支持 cloud。

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { parseRulePackFile } from "../src/lib/seed-pack-import.ts";
import { planRulePackImport } from "../src/lib/rule-pack.ts";
import {
  templateDraftToAsset,
  templateFileToDraft,
} from "../src/lib/template-asset.ts";

const projectRoot = resolve(import.meta.dirname, "..");

function readEnvFile() {
  const env = {};

  try {
    for (const line of readFileSync(join(projectRoot, ".env.local"), "utf8").split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);

      if (match) {
        env[match[1]] = match[2].trim();
      }
    }
  } catch {
    // 没有 .env.local 时按外部环境变量来
  }

  return env;
}

function readArg(name) {
  const index = process.argv.indexOf(`--${name}`);

  return index >= 0 ? process.argv[index + 1] : undefined;
}

const env = readEnvFile();
const supabaseUrl = process.env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const email = readArg("email") ?? process.env.SUPABASE_EMAIL;
const password = process.env.SUPABASE_PASSWORD;

if (!supabaseUrl || !anonKey) {
  throw new Error("缺少 Supabase 地址或匿名密钥。");
}

if (!email || !password) {
  throw new Error("请提供 --email 和 SUPABASE_PASSWORD。");
}

async function signIn() {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error(`登录失败：${response.status}`);
  }

  const data = await response.json();

  return data.access_token;
}

function restHeaders(token) {
  return {
    apikey: anonKey,
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

async function fetchRows(token, path) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: restHeaders(token),
  });

  if (!response.ok) {
    throw new Error(`读取 ${path} 失败：${response.status}`);
  }

  return response.json();
}

async function saveAsset(token, asset, reason) {
  const body = {
    p_asset_id: asset.id,
    p_project_id: asset.projectId,
    p_asset_type: asset.assetType,
    p_title: asset.title,
    p_summary: asset.summary,
    p_content: asset.content,
    p_metadata: asset.metadata,
    p_source_type: asset.source.sourceType,
    p_source_asset_id: asset.source.sourceAssetId,
    p_import_batch_id: asset.source.importBatchId,
    p_original_filename: asset.source.originalFilename,
    p_status: asset.status,
    p_archived_at: asset.archivedAt,
    p_deleted_at: asset.deletedAt,
    p_deleted_reason: asset.deletedReason,
    p_version_id: asset.currentVersionId,
    p_change_reason: reason,
    p_version_reason: "initial",
    p_source_asset_ids: [],
    p_restored_at: null,
    p_expires_at: null,
    p_asset_created_at: asset.createdAt,
    p_asset_updated_at: asset.updatedAt,
  };
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/save_asset`, {
    method: "POST",
    headers: restHeaders(token),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`写入资产 ${asset.id} 失败：${response.status} ${(await response.text()).slice(0, 120)}`);
  }
}

function slugToTemplateId(fileName) {
  return `template-${fileName
    .replace(/\.md$/i, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}

const token = await signIn();
const projectId = readArg("project") ?? (await fetchRows(token, "projects?select=id&order=created_at&limit=1"))[0]?.id;

if (!projectId) {
  throw new Error("云端还没有项目，先在应用里建一个默认项目。");
}

const existingIds = new Set(
  (await fetchRows(token, "assets?select=id")).map((row) => row.id),
);
const now = new Date().toISOString();
let createdPack = 0;
let createdMembers = 0;
let createdTemplates = 0;
let skipped = 0;

const packFile = parseRulePackFile(
  readFileSync(
    join(projectRoot, "seed-packs", "engineering-foundations", "engineering-foundations.pack.json"),
    "utf8",
  ),
);
const packPlan = planRulePackImport({
  file: packFile,
  existingAssets: [],
  targetProjectId: projectId,
  now,
});

if (packPlan.packAsset && !existingIds.has(packPlan.packAsset.id)) {
  await saveAsset(token, packPlan.packAsset, "导入规则包");
  existingIds.add(packPlan.packAsset.id);
  createdPack += 1;
}

for (const asset of packPlan.assetsToCreate) {
  if (existingIds.has(asset.id)) {
    skipped += 1;
    continue;
  }

  await saveAsset(token, asset, "安装规则包");
  existingIds.add(asset.id);
  createdMembers += 1;
}

const templateRoot = join(projectRoot, "templates", "new-project");
const templateFiles = [
  join(templateRoot, "AGENTS.md"),
  join(templateRoot, "README.md"),
  join(templateRoot, "START_PROMPT.md"),
  join(templateRoot, "docs", "DOCUMENT_SYSTEM.md"),
];

for (const filePath of templateFiles) {
  const fileName = filePath.split(/[\\/]/).pop();
  const id = slugToTemplateId(fileName);

  if (existingIds.has(id)) {
    skipped += 1;
    continue;
  }

  const asset = templateDraftToAsset({
    id,
    projectId,
    draft: templateFileToDraft({
      fileName,
      content: readFileSync(filePath, "utf8"),
    }),
    originalFilename: fileName,
    now,
  });

  await saveAsset(token, asset, "导入模板");
  existingIds.add(id);
  createdTemplates += 1;
}

console.log(
  `完成：规则包 ${createdPack} 个、包内资产 ${createdMembers} 条、模板 ${createdTemplates} 个、跳过 ${skipped} 条（项目 ${projectId}）`,
);
