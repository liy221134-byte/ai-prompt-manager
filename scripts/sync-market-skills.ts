// 把 AI 资产市场仓库（E:\AI资产市场）里做好的技能反向同步进公共资产库。
//
// 和 sync-new-project-templates.ts 同构：按 id 精确更新，改完再跑一次即可；
// 走应用同一条写入路径，每次更新带版本记录。
//
// 只同步 SKILL.md（技能定义）。references/ 里的模板多数已经在库里了
// （template-premortem-md、template-redteam-md 等），不重复入库。
//
// 同步名单是**显式**的（见下面 skills 数组）：正本里多出来的技能不自动进库
// （往库里加资产是有意动作），但脚本会提醒「名单之外还有几个」，免得名单悄悄落后。
// 2026-10-02 从 5 个扩到 10 个。
//
// 来源统一标「腾讯 WorkBuddy」：这批技能是 WorkBuddy 会话里做出来的，
// 但自同步进库之后，正本是 E:\AI资产市场\skills\，不是库里这份。
//
// 用法：
//   node scripts/sync-market-skills.ts --dry-run   只列会改什么，不写库
//   node scripts/sync-market-skills.ts             真写
// 可选：MARKET_ROOT 指向市场仓库的别的路径；PROMPT_DB_PATH 指向别的库文件。

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { isAssetData, type AssetData } from "../src/data/assets.ts";
import { DEFAULT_PROJECT_ID } from "../src/data/projects.ts";
import { getPromptDatabase } from "../src/lib/server/prompt-database.ts";

const marketRoot = process.env.MARKET_ROOT ?? "E:\\AI资产市场";
const dryRun = process.argv.includes("--dry-run");
const database = getPromptDatabase();
const now = new Date().toISOString();
const sourceNote = "来源：腾讯 WorkBuddy；正本在 E:\\AI资产市场\\skills\\";

// 技能名 → 库里的标题。标题用中文，和库里其他资产的命名习惯一致。
const skills: { id: string; dir: string; title: string }[] = [
  { id: "premortem-cn", dir: "premortem-cn", title: "技能：事前验尸" },
  { id: "redteam-cn", dir: "redteam-cn", title: "技能：红队（只打承重假设）" },
  { id: "design-plan-cn", dir: "design-plan-cn", title: "技能：设计计划（含对照简报复查）" },
  { id: "requirement-rewrite-cn", dir: "requirement-rewrite-cn", title: "技能：需求改写成三种格式" },
  { id: "acceptance-checklist-cn", dir: "acceptance-checklist-cn", title: "技能：验收清单" },
  { id: "internal-mcp-governance-cn", dir: "internal-mcp-governance-cn", title: "技能：内网 MCP 方案治理评审" },
  { id: "spec-claim-audit-cn", dir: "spec-claim-audit-cn", title: "技能：技术指标依据审计" },
  { id: "skillspector-scan-cn", dir: "skillspector-scan-cn", title: "技能：第三方技能安全体检" },
  { id: "context-mode-codex-patch", dir: "context-mode-codex-patch", title: "技能：context-mode 断链补丁" },
  { id: "codex-session-doctor", dir: "codex-session-doctor", title: "技能：Codex 会话卡死诊断" },
];

let updated = 0;
let created = 0;
let unchanged = 0;
let missing = 0;

for (const skill of skills) {
  const file = join(marketRoot, "skills", skill.dir, "SKILL.md");
  const assetId = `template-skill-${skill.id}`;

  if (!existsSync(file)) {
    console.log(`  找不到正本，跳过：${file}`);
    missing += 1;
    continue;
  }

  const content = readFileSync(file, "utf8").trim();
  const existing = (database.listAssets() as AssetData[]).find(
    (asset) => asset.id === assetId,
  );

  if (!existing) {
    if (dryRun) {
      console.log(`  [空跑] 新增：${assetId}（${skill.title}）`);
      created += 1;
      continue;
    }

    const asset = {
      id: assetId,
      projectId: DEFAULT_PROJECT_ID,
      assetType: "template",
      title: skill.title,
      summary: `技能定义（Agent Skills 格式），${sourceNote}`,
      content,
      metadata: {
        outputFileName: "SKILL.md",
        note: sourceNote,
      },
      source: {
        sourceType: "import",
        sourceAssetId: null,
        importBatchId: null,
        originalFilename: `skills/${skill.dir}/SKILL.md`,
      },
      currentVersionId: `current-${assetId}`,
      status: "active",
      archivedAt: null,
      deletedAt: null,
      deletedReason: null,
      createdAt: now,
      updatedAt: now,
    } as AssetData;

    if (!isAssetData(asset as unknown)) {
      throw new Error(`资产结构不合法，已拦下：${assetId}`);
    }

    database.createAsset({ asset, versionId: asset.currentVersionId, changeReason: "同步技能定义" });
    console.log(`  已新增：${assetId}（${skill.title}）`);
    created += 1;
    continue;
  }

  if (existing.content === content) {
    console.log(`  无变化：${assetId}`);
    unchanged += 1;
    continue;
  }

  const versionId = `${assetId}-sync-${Date.now()}`;
  const next = {
    ...existing,
    title: skill.title,
    summary: `技能定义（Agent Skills 格式），${sourceNote}`,
    content,
    metadata: { ...existing.metadata, outputFileName: "SKILL.md", note: sourceNote },
    currentVersionId: versionId,
    updatedAt: now,
  } as AssetData;

  if (!isAssetData(next as unknown)) {
    throw new Error(`资产结构不合法，已拦下：${assetId}`);
  }

  if (dryRun) {
    console.log(`  [空跑] 更新：${assetId} 正文 ${existing.content.length} → ${content.length} 字符`);
    updated += 1;
    continue;
  }

  database.updateAsset({
    asset: next,
    versionId,
    changeReason: `同步技能定义（${sourceNote}）`,
  });
  console.log(`  已更新：${assetId} 正文 ${existing.content.length} → ${content.length} 字符`);
  updated += 1;
}

console.log(
  `${dryRun ? "空跑（不写库）" : "写入本机库"}：新增 ${created}，更新 ${updated}，无变化 ${unchanged}，缺正本 ${missing}`,
);

// 名单之外的正本技能：只报告，不改任何东西。
const listed = new Set(skills.map((skill) => skill.dir));
const outsideList = readdirSync(join(marketRoot, "skills"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !listed.has(entry.name))
  .map((entry) => entry.name);
if (outsideList.length > 0) {
  console.log(
    `提醒：正本里有 ${outsideList.length} 个技能不在这份名单里、没有同步：${outsideList.join("、")}`,
  );
  console.log("      要收进来，就在 skills 数组里补一行（标题用中文，和库里其他资产一致）。");
}

if (!dryRun) {
  database.close();
}
