// 聚焦导入：把线索 3 M0 产出、但通用导入脚本（import-local-content.ts）没覆盖的
// 文档资产导进本机库（.data/prompts.sqlite）。只导这两类，不碰种子包/模板/提示词/图谱：
//   1. docs/reference/*.md   —— 方法级参考（清单、对照表），当成「参考资料」进库
//   2. docs/team-methods/*.md —— 7 个团队管理方法，当成「外部采集、待人工确认」进库（role: source）
// 复用应用自己的写入路径（createAsset），带版本记录；按标识或同名跳过，只新增不覆盖。
//
// 用法：
//   node scripts/import-leads3-docs.ts --dry-run   只列清单，不写库
//   node scripts/import-leads3-docs.ts             真写
//
// 注意：本机库里「外部采集」的文档没有 candidate 状态位（那是规则的概念），用
// role: "source" + authority: false 表达「外部来源、待人工确认、未编译进 AGENTS.md」。

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  createInitialAssetVersionId,
  isAssetData,
  type AssetData,
  type DocumentAssetData,
} from "../src/data/assets.ts";
import { DEFAULT_PROJECT_ID } from "../src/data/projects.ts";
import { getPromptDatabase } from "../src/lib/server/prompt-database.ts";

const projectRoot = resolve(import.meta.dirname, "..");
const dryRun = process.argv.includes("--dry-run");
const database = getPromptDatabase();
const now = new Date().toISOString();

let 新增 = 0;
let 跳过 = 0;

function slugify(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// 去掉正文开头的 YAML frontmatter（---\n...\n---），让库里的文档是干净的 Markdown 正文。
// 资产自己的状态/角色字段另外存，不在正文里留机器用的元数据。
function stripFrontmatter(content: string) {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, "").trimStart();
}

function readHeading(content: string) {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
}

function findAssetById(id: string) {
  return (database.listAssets() as AssetData[]).find((asset) => asset.id === id) ?? null;
}

function findAssetByTitle(title: string) {
  return (
    (database.listAssets() as AssetData[]).find(
      (asset) => asset.projectId === DEFAULT_PROJECT_ID && asset.title.trim() === title,
    ) ?? null
  );
}

function writeDocumentAsset(params: {
  id: string;
  fileName: string;
  documentType: string;
  role?: "source" | "working" | "authoritative" | "compiled";
  sourceNote: string;
}) {
  const { id, fileName, documentType, role, sourceNote } = params;
  const file = join(projectRoot, fileName);
  const raw = readFileSync(file, "utf8");
  const content = stripFrontmatter(raw);
  const title = readHeading(content) || fileName;
  const bucket = role === "source" ? "外部采集文档" : "参考资料";

  if (findAssetById(id) || findAssetByTitle(title)) {
    跳过 += 1;
    console.log(`  跳过（已存在）：${title}`);
    return;
  }

  const asset: DocumentAssetData = {
    id,
    projectId: DEFAULT_PROJECT_ID,
    assetType: "document",
    title,
    summary: `${bucket} · 从 ${fileName} 导入`,
    content,
    metadata: {
      documentType,
      ...(role ? { role } : {}),
      authority: false,
      module: "",
      effectiveVersion: "",
      sourceLocation: fileName,
      updateTrigger: "",
      freshness: "",
      lastVerifiedAt: "",
      relations: [],
    },
    source: {
      sourceType: "import",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: fileName,
    },
    currentVersionId: createInitialAssetVersionId(id),
    status: "active",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: now,
    updatedAt: now,
  };

  if (!isAssetData(asset as unknown)) {
    throw new Error(`资产结构不合法，已拦下：${asset.title}`);
  }

  if (dryRun) {
    console.log(`  [空跑] ${bucket}：${title}`);
    新增 += 1;
    return;
  }

  const created = database.createAsset({ asset, versionId: asset.currentVersionId, changeReason: sourceNote });
  if (!created) {
    跳过 += 1;
    console.log(`  跳过（写入被拒）：${title}`);
    return;
  }
  新增 += 1;
  console.log(`  已导入 ${bucket}：${title}`);
}

console.log(`${dryRun ? "空跑（不写库）" : "写入本机库"}：项目 = 默认项目 (${DEFAULT_PROJECT_ID})`);

// 1. 参考文档
console.log("1. docs/reference/*.md → 参考资料");
const refDir = join(projectRoot, "docs", "reference");
if (existsSync(refDir)) {
  for (const fileName of readdirSync(refDir).filter((n) => n.endsWith(".md")).sort()) {
    writeDocumentAsset({
      id: `document-reference-${slugify(fileName)}`,
      fileName: `docs/reference/${fileName}`,
      documentType: "参考资料",
      sourceNote: "导入参考文档（线索3 M0）",
    });
  }
}

// 2. 团队管理方法（外部采集，待人工确认）
console.log("2. docs/team-methods/*.md → 团队方法（role: source）");
const tmDir = join(projectRoot, "docs", "team-methods");
if (existsSync(tmDir)) {
  for (const fileName of readdirSync(tmDir).filter((n) => n.endsWith(".md")).sort()) {
    writeDocumentAsset({
      id: `document-team-method-${slugify(fileName)}`,
      fileName: `docs/team-methods/${fileName}`,
      documentType: "团队方法",
      role: "source",
      sourceNote: "导入团队管理方法（线索3 M0，外部采集待确认）",
    });
  }
}

console.log(`\n完成：新增 ${新增}，跳过 ${跳过}`);

if (!dryRun) {
  database.close();
}
