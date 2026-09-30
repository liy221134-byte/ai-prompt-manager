// 把「处于 active 但没有确认记录」的外部来源规则批量降回「待确认（pending）」。
//
// 为什么会有这批数据：打包器曾经把种子包里的每个成员都写成 active，源文件标的
// candidate 从来没生效，于是 SOP 第 4 条「未经人工确认不许升 active」被系统性绕过。
// 打包口径已在 v2.29.0 修掉（见 docs/superpowers/specs/2026-09-30-v2.29.0-seed-pack-
// status-and-reimport-design.md），这个脚本处理库里的存量。
//
// 走应用同一条写入路径（updateAsset），每条改动作留一条版本记录，可逐条回滚。
// 已经在资产编辑器里写过确认依据的规则不会被碰——有确认记录的就不在名单里。
//
// 用法：
//   node scripts/downgrade-external-source-status.ts --dry-run   只列会改哪些，不写库
//   node scripts/downgrade-external-source-status.ts             真写
// 可选：PROMPT_DB_PATH 指向别的库文件。

import { isAssetData, type AssetData } from "../src/data/assets.ts";
import { planAutoActiveDowngrade } from "../src/lib/external-sources-compliance.ts";
import { getPromptDatabase } from "../src/lib/server/prompt-database.ts";

const dryRun = process.argv.includes("--dry-run");
const database = getPromptDatabase();
const now = new Date().toISOString();
const targets = planAutoActiveDowngrade(database.listAssets() as AssetData[]);

console.log(`处于 active 但没有确认记录的外部规则：${targets.length} 条`);

let changed = 0;

for (const asset of targets) {
  const versionId = `${asset.id}-downgrade-${Date.now()}-${changed}`;
  const next = {
    ...asset,
    status: "pending",
    currentVersionId: versionId,
    updatedAt: now,
  } as AssetData;

  if (!isAssetData(next as unknown)) {
    throw new Error(`资产结构不合法，已拦下：${asset.id}`);
  }

  if (dryRun) {
    console.log(`  [空跑] 降回待确认：${asset.title}（${asset.id}）`);
    changed += 1;
    continue;
  }

  database.updateAsset({
    asset: next,
    versionId,
    changeReason: "批量降回待确认（SOP：未经人工确认不许升 active，v2.29.0）",
  });
  changed += 1;
}

console.log(`${dryRun ? "空跑（不写库）" : "写入本机库"}：改 ${changed} 条`);

if (!dryRun) {
  database.close();
}
