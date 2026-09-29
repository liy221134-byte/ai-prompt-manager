// 线索 3 M1：读「seed-packs/external-sources/README.md 第六节 采集进度台账」，
// 生成只读视图用的 JSON 快照 src/data/external-sources-ledger.json（提交进仓库）。
//
// 为什么要生成快照而不是运行时读 README：云端模式下浏览器读不到仓库文件，
// 把台账在构建期固化成 JSON 后，本地／云端读的是同一份数据（视图表现一致）。
//
// 顺带做一件运行时做不了的事：读本机库，把台账「落到哪条资产」里的规范 ID
// （如 MTH-TEAM-OKR-001）匹配到库内资产，结果一并写进快照——前端纯读 JSON 即可，
// 不需要再查库。匹配靠「库内资产的 sourceLocation → 源文件 frontmatter 的 id」这座桥
// （M0 导入时库内 ID 是文件名的 slug，和规范 ID 不是一个字符串）。
//
// 用法：
//   npm run generate:leads3-ledger

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { AssetData } from "../src/data/assets.ts";
import {
  deriveCompileStatus,
  parseLedgerSection,
  readLedgerHeading,
  type LedgerSnapshot,
  type LedgerSnapshotEntry,
  type LibraryAssetRef,
  type LibraryIndex,
} from "../src/lib/external-sources-ledger.ts";
import { getPromptDatabase } from "../src/lib/server/prompt-database.ts";

const projectRoot = resolve(import.meta.dirname, "..");
const README_RELATIVE_PATH = "seed-packs/external-sources/README.md";
const OUTPUT_RELATIVE_PATH = "src/data/external-sources-ledger.json";

/** 从源文件的 YAML frontmatter 里读规范 id（如 MTH-TEAM-OKR-001） */
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
  return idLine ? idLine[1].trim() : "";
}

function readMetadata(asset: AssetData): Record<string, unknown> {
  const metadata = asset.metadata as unknown;
  return typeof metadata === "object" && metadata !== null
    ? (metadata as Record<string, unknown>)
    : {};
}

/**
 * 建立「规范 ID → 库内资产画像」的索引。
 * 只索引带了 sourceLocation 的资产（外部采集导入的文档才记来源位置），
 * 用它指向的源文件 frontmatter id 作为规范 ID。
 */
function buildLibraryIndex(assets: AssetData[]): LibraryIndex {
  const index: LibraryIndex = {};

  for (const asset of assets) {
    const metadata = readMetadata(asset);
    const sourceLocation =
      typeof metadata.sourceLocation === "string" ? metadata.sourceLocation : "";
    if (!sourceLocation) {
      continue;
    }

    const canonicalId = readFrontmatterId(sourceLocation).toUpperCase();
    if (!canonicalId || index[canonicalId]) {
      continue;
    }

    const ref: LibraryAssetRef = {
      libraryAssetId: asset.id,
      canonicalId,
      title: asset.title,
      assetType: asset.assetType,
      status: asset.status,
      role: typeof metadata.role === "string" ? metadata.role : undefined,
      authority:
        typeof metadata.authority === "boolean" ? metadata.authority : undefined,
    };
    index[canonicalId] = ref;
  }

  return index;
}

const readmeAbsolutePath = join(projectRoot, README_RELATIVE_PATH);
const markdown = readFileSync(readmeAbsolutePath, "utf8");
const entries = parseLedgerSection(markdown);

if (entries.length === 0) {
  throw new Error(
    `没能从 ${README_RELATIVE_PATH} 解析出采集台账表格，请检查第六节是否存在且表格完整。`,
  );
}

let libraryAvailable = false;
let libraryIndex: LibraryIndex = {};

try {
  const database = getPromptDatabase();
  libraryIndex = buildLibraryIndex(database.listAssets() as AssetData[]);
  libraryAvailable = true;
  database.close();
} catch (error) {
  // 构建环境（如云端 CI）可能没有本机库：降级为「落点匹配全空」，
  // 视图会把落点显示成「未导入库（仅台账记录）」，不报错。
  console.warn(
    `本机库不可读，落点匹配将全部为空：${
      error instanceof Error ? error.message : String(error)
    }`,
  );
}

const sources: LedgerSnapshotEntry[] = entries.map((entry) => ({
  ...entry,
  compileStatus: deriveCompileStatus(entry.landing, libraryIndex),
}));

const snapshot: LedgerSnapshot = {
  generatedAt: new Date().toISOString(),
  sourceFile: README_RELATIVE_PATH,
  ledgerHeading: readLedgerHeading(),
  libraryAvailable,
  count: sources.length,
  sources,
};

writeFileSync(
  join(projectRoot, OUTPUT_RELATIVE_PATH),
  `${JSON.stringify(snapshot, null, 2)}\n`,
  "utf8",
);

console.log(
  `已生成 ${OUTPUT_RELATIVE_PATH}：${sources.length} 条来源；` +
    `库内匹配到 ${Object.keys(libraryIndex).length} 个规范 ID` +
    `${libraryAvailable ? "" : "（本机库不可读，匹配为空）"}`,
);
