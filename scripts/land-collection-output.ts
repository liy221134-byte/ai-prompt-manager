// 线索 3 M2.2 T15：把智能体的采集产出件直接落进本机库。
//
// 用法（话术里就是这么教本地智能体的）：
//   npm run collect:land -- <产出件目录或单个 .md> --source "来源名" [--ecosystem "开源社区"]
//
// 只写本机库（`.data/prompts.sqlite`，可用 PROMPT_DB_PATH 指到别处）；
// 云端靠 `npm run sync -- --push` 跟上。落库规则与「给压缩包」入口完全一致：
// 规则 draft + hypothesis + 来源摘录、进公共库、自动生成一条采集记录。

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import { DEFAULT_PROJECT_ID } from "../src/data/projects.ts";
import { parseCollectionOutputFiles } from "../src/lib/collection-output.ts";
import {
  checkSourcePackageDraftLimit,
  type SourcePackageDraft,
} from "../src/lib/source-package-draft.ts";
import {
  planSourcePackageCreation,
  type SourcePackageUploadRef,
} from "../src/lib/source-package-confirm.ts";
import { getPromptDatabase } from "../src/lib/server/prompt-database.ts";

function readArg(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);

  if (index === -1) {
    return null;
  }

  const value = process.argv[index + 1];

  return value && !value.startsWith("--") ? value : null;
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  console.error("");
  console.error(
    '用法：npm run collect:land -- <产出件目录或单个 .md> --source "来源名" [--ecosystem "生态"]',
  );
  process.exit(1);
}

// 来源名进批次号，所以先压成一段安全字符；压不出东西就用哈希兜底
function slugify(source: string): string {
  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);

  return slug || createHash("sha1").update(source).digest("hex").slice(0, 8);
}

function collectMarkdownFiles(target: string): string[] {
  const stat = statSync(target);

  if (stat.isFile()) {
    return target.toLowerCase().endsWith(".md") ? [target] : [];
  }

  return readdirSync(target)
    .filter((name) => name.toLowerCase().endsWith(".md"))
    .sort()
    .map((name) => resolve(target, name));
}

const targetPathArg = process.argv
  .slice(2)
  .find((arg) => !arg.startsWith("--"));
const source = readArg("source");
const ecosystem = readArg("ecosystem") ?? "";

if (!targetPathArg) {
  fail("没给产出件路径。");
}

if (!source) {
  fail("没给 --source（这条来源叫什么，写进采集记录）。");
}

const targetPath = isAbsolute(targetPathArg)
  ? targetPathArg
  : resolve(process.cwd(), targetPathArg);

const files = collectMarkdownFiles(targetPath).map((path) => ({
  filename: path.split(/[\\/]/).pop() ?? path,
  content: readFileSync(path, "utf8"),
}));

if (files.length === 0) {
  fail(`「${targetPathArg}」里没有 .md 产出件。`);
}

const parsed = parseCollectionOutputFiles(files);

if (parsed.length === 0) {
  fail("产出件都是空的（没有可落库的正文）。");
}

const database = getPromptDatabase();

// 去重口径：公共库里已经有同名规则就跳过——命令可以重复跑，第二遍 0 新增。
const existingTitles = new Set(
  database
    .listAssets(DEFAULT_PROJECT_ID)
    .filter((asset) => asset.assetType === "rule")
    .map((asset) => asset.title.trim()),
);

const fresh = parsed.filter((item) => !existingTitles.has(item.title.trim()));
const skipped = parsed.filter((item) => existingTitles.has(item.title.trim()));

for (const item of skipped) {
  console.log(`· 跳过（库里已有同名规则）：${item.title}`);
}

if (fresh.length === 0) {
  console.log("");
  console.log("✓ 0 新增：这批产出件都已在库里，台账没有变化。");
  process.exit(0);
}

// 批次号由「来源 + 这批标题」决定：同样的输入跑两遍得到同样的号，天然幂等。
const batchHash = createHash("sha1")
  .update(fresh.map((item) => item.title).join("|"))
  .digest("hex")
  .slice(0, 8);
const importBatchId = `land-${slugify(source)}-${batchHash}`;

const uploads: SourcePackageUploadRef[] = fresh.map((item, index) => ({
  uploadId: `file-${index + 1}`,
  filename: item.sourceFilename,
  storedPath: resolve(targetPath, item.sourceFilename),
  byteSize: Buffer.byteLength(item.content, "utf8"),
}));

const draft: SourcePackageDraft = {
  project: { name: "", goal: "" },
  items: fresh.map((item, index) => ({
    id: `draft-${index + 1}`,
    sourceFilename: item.sourceFilename,
    assetType: "rule",
    title: item.title,
    summary: item.summary,
    content: item.content,
    reason: "",
  })),
  skipped: [],
};

const limitError = checkSourcePackageDraftLimit(draft);

if (limitError) {
  fail(limitError);
}

const plan = planSourcePackageCreation({
  draft,
  uploads,
  importBatchId,
  project: { mode: "existing", projectId: DEFAULT_PROJECT_ID },
  mode: "external-collection",
  collectionMeta: { source, ecosystem },
});

database.createSourcePackageImport(plan);

console.log("");
console.log(`✓ 已落库：批次 ${importBatchId}`);
console.log(`  来源：${source}${ecosystem ? `（${ecosystem}）` : ""}`);
console.log(`  新增候选规则 ${fresh.length} 条，跳过 ${skipped.length} 条：`);

for (const item of fresh) {
  console.log(`    - ${item.title}`);
}

console.log(`  采集记录：collection-${importBatchId}（台账会多一行）`);
console.log("");
console.log("规则是草稿态 + 假设级可信度，确认过再到产品里转 active。");
console.log("要同步到云端：npm run sync -- --push");
