// 把方法模板（templates/methods/）和产品方法提示词包（prompt-packs/product-methods.md）
// 同步进公共资产库。
//
// 和 import-local-content.ts 的区别：那个脚本「只新增不覆盖」，改了正文它不会更新库里那份；
// 这个脚本按 id 精确更新，改完模板／提示词要跑这个。走应用同一条写入路径，每次更新带版本记录。
//
// 来源都标「腾讯 WorkBuddy」：方法模板与提示词起点是外部来源采集，仓库里的 templates/methods/
// 与 prompt-packs/ 是正文正本；库里这份改了不会自动回去，要回写请改正本再跑脚本。
//
// 用法：
//   node scripts/sync-method-assets.ts --dry-run   只列会改什么，不写库
//   node scripts/sync-method-assets.ts             真写
// 可选：PROMPT_DB_PATH 指向别的库文件（库不在这个工作区时要给）。

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { isAssetData, type AssetData } from "../src/data/assets.ts";
import { DEFAULT_PROJECT_ID } from "../src/data/projects.ts";
import { templateFileToDraft } from "../src/lib/template-asset.ts";
import { getPromptDatabase } from "../src/lib/server/prompt-database.ts";

// 读不到正文就返回 null（文件不存在等情况）。单独收成函数，是为了让「只赋值一次」的
// 变量能用 const 声明——原来在循环里写 `let content` + try 赋值，会被 ESLint 的
// prefer-const 判为可改 const，是 main 上既有的那条 lint error。
function readTextOrNull(filePath: string): string | null {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

const projectRoot = resolve(import.meta.dirname, "..");
const dryRun = process.argv.includes("--dry-run");
const database = getPromptDatabase();
const now = new Date().toISOString();
const sourceNote = "来源：腾讯 WorkBuddy；正本在 templates/methods/ 与 prompt-packs/";

// 库里的标题沿用导入时那份，不动标题，避免破坏已经引用它们的资产。
// kind=template 走 templateFileToDraft；kind=doc 直接取文件正文（更新已存在的文档资产）。
const entries = [
  { id: "template-premortem-md", file: "templates/methods/premortem.md", kind: "template" },
  { id: "template-redteam-md", file: "templates/methods/redteam.md", kind: "template" },
  { id: "template-design-plan-md", file: "templates/methods/design-plan.md", kind: "template" },
  { id: "template-user-story-md", file: "templates/methods/user-story.md", kind: "template" },
  { id: "template-job-story-md", file: "templates/methods/job-story.md", kind: "template" },
  { id: "template-wwa-md", file: "templates/methods/wwa.md", kind: "template" },
  { id: "prompt-pack-product-methods", file: "prompt-packs/product-methods.md", kind: "doc" },
];

let updated = 0;
// 本脚本只按 id 更新已存在的资产，库里没有的一律跳过（见下面的 [空跑] 分支），
// 所以「新增」恒为 0；保留在汇总里是为了和输出口径对齐，别当真。
const created = 0;
let unchanged = 0;
let skipped = 0;

for (const entry of entries) {
  const filePath = join(projectRoot, entry.file);
  const content = readTextOrNull(filePath);
  if (content === null) {
    console.log(`  跳过：文件不存在 ${entry.file}`);
    skipped += 1;
    continue;
  }

  const fileName = entry.file.split("/").pop() ?? "";
  const summary = fileName;
  const draftContent =
    entry.kind === "template"
      ? templateFileToDraft({ fileName, content }).content
      : content;

  const existing = (database.listAssets() as AssetData[]).find(
    (asset) => asset.id === entry.id,
  );

  if (!existing) {
    console.log(`  [空跑] 库里还没有 ${entry.id}（先跑 import-local-content 建初版）`);
    skipped += 1;
    continue;
  }

  if (existing.content === draftContent.trim()) {
    console.log(`  无变化：${entry.id}`);
    unchanged += 1;
    continue;
  }

  const before = existing.content.length;
  const after = draftContent.trim().length;
  const versionId = `${entry.id}-sync-${Date.now()}`;
  const next = {
    ...existing,
    summary: entry.kind === "template" ? existing.summary : summary,
    content: draftContent,
    metadata: { ...existing.metadata, note: sourceNote },
    currentVersionId: versionId,
    updatedAt: now,
  } as AssetData;

  if (!isAssetData(next as unknown)) {
    throw new Error(`资产结构不合法，已拦下：${entry.id}`);
  }

  if (dryRun) {
    console.log(`  [空跑] 更新：${entry.id} 正文 ${before} → ${after} 字符`);
    updated += 1;
    continue;
  }

  database.updateAsset({
    asset: next,
    versionId,
    changeReason: `同步方法模板／提示词（${sourceNote}）`,
  });
  console.log(`  已更新：${entry.id} 正文 ${before} → ${after} 字符`);
  updated += 1;
}

console.log(
  `${dryRun ? "空跑（不写库）" : "写入本机库"}：更新 ${updated}，新增 ${created}，无变化 ${unchanged}，跳过 ${skipped}`,
);

if (!dryRun) {
  database.close();
}
