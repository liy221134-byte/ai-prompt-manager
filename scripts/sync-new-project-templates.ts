// 把 templates/new-project/ 四份起步模板同步进公共资产库。
//
// 和 import-local-content.ts 的区别：那个脚本「只新增不覆盖」，改了模板正文它不会更新库里
// 那份；这个脚本按 id 精确更新，改完模板要跑这个。走应用同一条写入路径，每次更新带版本记录。
//
// 四份模板的来源都标「腾讯 WorkBuddy」：正文起点是 WorkBuddy 会话里的回灌与拆重，
// 在这之后仓库里的 templates/new-project/ 才是唯一正本。
//
// 用法：
//   node scripts/sync-new-project-templates.ts --dry-run   只列会改什么，不写库
//   node scripts/sync-new-project-templates.ts             真写
// 可选：PROMPT_DB_PATH 指向别的库文件（库不在这个工作区时要给）。

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { isAssetData, type AssetData } from "../src/data/assets.ts";
import { DEFAULT_PROJECT_ID } from "../src/data/projects.ts";
import { templateDraftToAsset, templateFileToDraft } from "../src/lib/template-asset.ts";
import { getPromptDatabase } from "../src/lib/server/prompt-database.ts";

const projectRoot = resolve(import.meta.dirname, "..");
const dryRun = process.argv.includes("--dry-run");
const database = getPromptDatabase();
const now = new Date().toISOString();
const sourceNote = "来源：腾讯 WorkBuddy；正本在 templates/new-project/";

// 库里的标题沿用导入时那份（AGENTS / README / START_PROMPT / DOCUMENT_SYSTEM），
// 不动标题，避免破坏已经引用它们的资产。
const entries = [
  { id: "template-agents", file: "templates/new-project/AGENTS.md" },
  { id: "template-method", file: "templates/new-project/docs/method.md" },
  { id: "template-rule-hits", file: "templates/new-project/docs/rule-hits.md" },
  { id: "template-readme", file: "templates/new-project/README.md" },
  { id: "template-start-prompt", file: "templates/new-project/START_PROMPT.md" },
  { id: "template-document-system", file: "templates/new-project/docs/DOCUMENT_SYSTEM.md" },
];

// 新资产（method / rule-hits）第一次进来时，拿正文一级标题当库里的标题，
// 免得出现 "METHOD" 这种英文文件名标题。
function readHeading(content: string) {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
}

let updated = 0;
let created = 0;
let unchanged = 0;

for (const entry of entries) {
  const content = readFileSync(join(projectRoot, entry.file), "utf8");
  const fileName = entry.file.split("/").pop() ?? "";
  const draft = templateFileToDraft({ fileName, content });
  const heading = readHeading(content);
  if (heading) {
    draft.title = heading;
  }
  const existing = (database.listAssets() as AssetData[]).find(
    (asset) => asset.id === entry.id,
  );

  if (!existing) {
    // 库里还没有这份：直接建。以前这里只提示一句就跳过，2026-10-01 加 method / rule-hits
    // 两份起步模板时发现——不建的话它们永远进不了库。
    const asset = templateDraftToAsset({
      id: entry.id,
      projectId: DEFAULT_PROJECT_ID,
      draft,
      originalFilename: entry.file.replace("templates/new-project/", ""),
      now,
    });

    if (!isAssetData(asset as unknown)) {
      throw new Error(`资产结构不合法，已拦下：${entry.id}`);
    }

    if (dryRun) {
      console.log(`  [空跑] 新增：${entry.id}（${asset.title}）`);
      created += 1;
      continue;
    }

    const ok = database.createAsset({
      asset,
      versionId: asset.currentVersionId,
      changeReason: `同步起步模板（${sourceNote}）`,
    });
    console.log(`${ok ? "  已新增" : "  跳过（库里已有）"}：${entry.id}（${asset.title}）`);
    created += 1;
    continue;
  }

  if (existing.content === draft.content.trim()) {
    console.log(`  无变化：${entry.id}`);
    unchanged += 1;
    continue;
  }

  const before = existing.content.length;
  const after = draft.content.trim().length;
  const versionId = `${entry.id}-sync-${Date.now()}`;
  const next = {
    ...existing,
    summary: draft.summary || existing.summary,
    content: draft.content,
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
    changeReason: `同步起步模板（${sourceNote}）`,
  });
  console.log(`  已更新：${entry.id} 正文 ${before} → ${after} 字符`);
  updated += 1;
}

console.log(
  `${dryRun ? "空跑（不写库）" : "写入本机库"}：更新 ${updated}，新增 ${created}，无变化 ${unchanged}`,
);

if (!dryRun) {
  database.close();
}
