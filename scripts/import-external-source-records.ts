// 线索 3 M2：把 README 第六节那份人手维护的采集台账，搬成产品里的采集记录。
//
// 一条采集记录 = 一条 document 资产（documentType「采集记录」），落在公共资产库。
// 这样做的好处在设计稿第二节写了：白拿资产的增删改查、版本记录、备份与云同步。
//
// 这个脚本是一次性的搬迁工具，但要求可重复执行：已存在的记录按 ID 跳过，第二遍 0 新增。
//
// 用法：
//   npm run import:leads3-records -- --dry-run   只列清单，不写库
//   npm run import:leads3-records                真写

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  collectionDocumentType,
  createInitialAssetVersionId,
  isAssetData,
  type AssetData,
  type CollectionRecordMetadata,
  type DocumentAssetData,
} from "../src/data/assets.ts";
import { DEFAULT_PROJECT_ID } from "../src/data/projects.ts";
import {
  buildCollectionRecordContent,
  extractCanonicalIds,
  parseLedgerSection,
  type LedgerEntry,
} from "../src/lib/external-sources-ledger.ts";
import { getPromptDatabase } from "../src/lib/server/prompt-database.ts";

const projectRoot = resolve(import.meta.dirname, "..");
const README_RELATIVE_PATH = "seed-packs/external-sources/README.md";
const dryRun = process.argv.includes("--dry-run");

// 生态归属：台账第六节原本没有这一列（它是 M2 才加的维度），所以这里按来源逐条判定。
// 判断口径：厂商官方产品归对应厂商（Anthropic Skills、Playwright MCP…），
// GitHub 上的开源仓库与社区项目归「开源社区」，本机技能归「本机」，
// 清单里没有对应档位的（Supabase、Figma、Next.js 官方…）归「其他」，不硬塞。
//
// 这张表是给人核对用的：哪条归错了，改这里重跑即可（已存在的按 ID 跳过，
// 想覆盖得先删掉库里那条记录）。
const ecosystemBySeq: Record<number, string> = {
  1: "开源社区", // Ponytail（X 用户分享的技能）
  2: "开源社区", // S1 obra/superpowers
  3: "Anthropic", // S2 anthropics/skills
  4: "开源社区", // S3 karpathy-skills
  5: "开源社区", // Context7（upstash）
  6: "微软", // Playwright MCP（microsoft）
  7: "其他", // Supabase MCP（清单里没有 Supabase 档）
  8: "开源社区", // GitHub MCP
  9: "开源社区", // Serena
  10: "开源社区", // Sequential Thinking（官方参考实现）
  11: "其他", // Snyk MCP（安全厂商，清单里没有）
  12: "开源社区", // Postgres MCP
  13: "字节", // 豆包「AI Coding 每日速递」
  14: "其他", // S4 Supabase 官方 Skills
  15: "本机", // S5 superpowers 全套（本机 12 个技能）
  16: "Anthropic", // S6 product-design（Claude Skills）
  17: "其他", // Figma 官方 Skills
  18: "其他", // Notion 官方 Skills
  19: "OpenAI", // OpenAI 运行时技能
  20: "其他", // computer-use／visualize（台账没写来源，不硬判）
  21: "Anthropic", // S7 产品经理方法技能（Claude Skills）
  22: "其他", // Next.js 能力技能 与 ui-ux-pro-max（Vercel 官方，清单里没有）
  23: "本机", // S8 WorkBuddy 生态
};

function slugify(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** 采集记录的资产 ID：行序 + 来源 slug，稳定可读（同一条来源重跑得到同一个 ID） */
function buildRecordId(entry: LedgerEntry) {
  const seq = String(entry.seq).padStart(2, "0");
  const slug = slugify(entry.source) || "source";
  return `collection-${seq}-${slug}`;
}

/** 从源文件 frontmatter 里读规范 id（如 MTH-TEAM-OKR-001） */
function readFrontmatterId(relativePath: string): string {
  const absolutePath = join(projectRoot, relativePath);
  if (!existsSync(absolutePath)) {
    return "";
  }

  const raw = readFileSync(absolutePath, "utf8");
  const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter) {
    return "";
  }

  const idLine = frontmatter[1].match(/^id:\s*(.+)$/m);
  return idLine ? idLine[1].trim().toUpperCase() : "";
}

/**
 * 「规范 ID → 库内资产 ID」索引。
 * 库内资产存的是源文件路径（sourceLocation），规范 ID 在源文件 frontmatter 里，
 * 所以要读文件才能把台账写的 `MTH-TEAM-OKR-001` 换成库内的资产 ID。
 */
function buildCanonicalIndex(assets: AssetData[]): Map<string, string> {
  const index = new Map<string, string>();

  for (const asset of assets) {
    const metadata = asset.metadata as { sourceLocation?: unknown };
    const sourceLocation =
      typeof metadata.sourceLocation === "string" ? metadata.sourceLocation : "";
    if (!sourceLocation) {
      continue;
    }

    const canonicalId = readFrontmatterId(sourceLocation);
    if (!canonicalId || index.has(canonicalId)) {
      continue;
    }

    index.set(canonicalId, asset.id);
  }

  return index;
}

/** 落点文本 → 库内资产 ID 列表（匹配不上的直接不写，视图会退回按文本判档） */
function resolveCollectedAssetIds(
  landing: string,
  canonicalIndex: Map<string, string>,
): string[] {
  return extractCanonicalIds(landing)
    .map((canonicalId) => canonicalIndex.get(canonicalId.toUpperCase()))
    .filter((assetId): assetId is string => Boolean(assetId));
}

function buildRecordContent(entry: LedgerEntry, ecosystem: string) {
  return buildCollectionRecordContent({
    source: entry.source,
    ecosystem,
    sourceType: entry.type,
    sourceUrl: entry.sourceUrl,
    disposition: entry.disposition,
    landing: entry.landing,
    verifiedAt: entry.verifiedAt,
    note: entry.note,
    ledgerStatus: entry.status,
  });
}

function buildRecordAsset(
  entry: LedgerEntry,
  ecosystem: string,
  collectedAssetIds: string[],
  now: string,
): DocumentAssetData {
  const id = buildRecordId(entry);

  const collection: CollectionRecordMetadata = {
    seq: entry.seq,
    ecosystem,
    sourceType: entry.type,
    sourceUrl: entry.sourceUrl,
    disposition: entry.disposition,
    landing: entry.landing,
    verifiedAt: entry.verifiedAt,
    note: entry.note,
  };

  if (collectedAssetIds.length > 0) {
    collection.collectedAssetIds = collectedAssetIds;
  }

  return {
    id,
    projectId: DEFAULT_PROJECT_ID,
    assetType: "document",
    title: entry.source,
    summary: `外部采集来源 · ${ecosystem} · ${entry.type || "类型未填"}`,
    content: buildRecordContent(entry, ecosystem),
    metadata: {
      documentType: collectionDocumentType,
      // 外部来源、未采信：M0 就定下的表达方式，不引入第二套语义
      role: "source",
      authority: false,
      module: "",
      effectiveVersion: "",
      sourceLocation: README_RELATIVE_PATH,
      updateTrigger: "",
      freshness: "",
      lastVerifiedAt: entry.verifiedAt,
      collection,
      relations: [],
    },
    source: {
      sourceType: "import",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: README_RELATIVE_PATH,
    },
    currentVersionId: createInitialAssetVersionId(id),
    status: "active",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

// —— 主流程 ——

const markdown = readFileSync(join(projectRoot, README_RELATIVE_PATH), "utf8");
const entries = parseLedgerSection(markdown);

if (entries.length === 0) {
  throw new Error(
    `没能从 ${README_RELATIVE_PATH} 解析出采集台账表格，请检查第六节是否存在且表格完整。`,
  );
}

const database = getPromptDatabase();
const assets = database.listAssets() as AssetData[];
const canonicalIndex = buildCanonicalIndex(assets);
const existingIds = new Set(assets.map((asset) => asset.id));

const now = new Date().toISOString();

let 新增 = 0;
let 跳过 = 0;
let 落点匹配 = 0;

console.log(
  `${dryRun ? "空跑（不写库）" : "写入本机库"}：${entries.length} 条来源，` +
    `库内可识别的规范 ID ${canonicalIndex.size} 个`,
);

for (const entry of entries) {
  const ecosystem = ecosystemBySeq[entry.seq] ?? "其他";
  const collectedAssetIds = resolveCollectedAssetIds(
    entry.landing,
    canonicalIndex,
  );
  const asset = buildRecordAsset(entry, ecosystem, collectedAssetIds, now);

  if (!isAssetData(asset as unknown)) {
    throw new Error(`采集记录结构不合法，已拦下：${entry.source}`);
  }

  if (collectedAssetIds.length > 0) {
    落点匹配 += collectedAssetIds.length;
  }

  if (existingIds.has(asset.id)) {
    跳过 += 1;
    console.log(`  跳过（已存在）：${entry.source}`);
    continue;
  }

  if (dryRun) {
    新增 += 1;
    console.log(
      `  [空跑] ${asset.id}｜${ecosystem}｜落点匹配 ${collectedAssetIds.length} 条`,
    );
    continue;
  }

  const created = database.createAsset({
    asset,
    versionId: asset.currentVersionId,
    changeReason: "从 README 第六节采集台账搬入产品（线索3 M2）",
  });

  if (!created) {
    跳过 += 1;
    console.log(`  跳过（写入被拒）：${entry.source}`);
    continue;
  }

  新增 += 1;
  console.log(
    `  已登记 ${asset.id}｜${ecosystem}｜落点匹配 ${collectedAssetIds.length} 条`,
  );
}

console.log(`\n完成：新增 ${新增}，跳过 ${跳过}，落点匹配资产 ${落点匹配} 处`);

if (!dryRun) {
  database.close();
}
