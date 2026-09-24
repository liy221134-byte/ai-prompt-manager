// 一次性数据修正（产品负责人 2026-09-24 确认，对应需求 F3）：
// 把「documentType = 模板」的文档归位成真正的模板资产。
//
// 为什么要做：v2.2.0 导入种子包时，模板类内容统一落成「文档 + documentType」；
// v2.4.0 才开放独立的「模板」类型，同一件事就有两个落点，界面上看着像重复维护。
//
// 怎么用（先停掉开发服务，避免和它抢库）：
//   node scripts/migrate-document-templates.mjs --dry-run   # 看会改哪几条
//   node scripts/migrate-document-templates.mjs             # 真改
//
// 只改本机库；云端同一批数据用 Supabase REST 另行处理（见 database-migrations 的事实记录）。

import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const databasePath =
  process.env.PROMPT_DB_PATH ??
  path.join(projectRoot, ".data", "prompts.sqlite");
const isDryRun = process.argv.includes("--dry-run");

const database = new DatabaseSync(databasePath);

try {
  const rows = database
    .prepare(
      `SELECT id, title, asset_type, metadata_json
       FROM assets
       WHERE asset_type = 'document'
         AND json_extract(metadata_json, '$.documentType') = '模板'
         AND deleted_at IS NULL`,
    )
    .all();

  if (rows.length === 0) {
    console.log("没有需要归位的文档。");
    process.exit(0);
  }

  console.log(`找到 ${rows.length} 条要归位的文档：`);

  const updateAsset = database.prepare(
    `UPDATE assets
     SET asset_type = 'template', metadata_json = ?, updated_at = ?
     WHERE id = ?`,
  );
  const updateVersion = database.prepare(
    `UPDATE asset_versions
     SET asset_type = 'template', metadata_json = ?
     WHERE asset_id = ?`,
  );
  const now = new Date().toISOString();

  for (const row of rows) {
    const metadata = JSON.parse(row.metadata_json);
    // 模板元数据要求 outputFileName 和 note 都是字符串
    const nextMetadata = {
      ...metadata,
      documentType: undefined,
      outputFileName: `${row.title}.md`,
      note: "从种子包的文档归位成模板（documentType=模板 → template 类型）",
    };

    delete nextMetadata.documentType;

    console.log(
      `- ${row.title}（${row.id}）→ 模板，产物文件名 ${nextMetadata.outputFileName}`,
    );

    if (isDryRun) {
      continue;
    }

    updateAsset.run(JSON.stringify(nextMetadata), now, row.id);
    updateVersion.run(JSON.stringify(nextMetadata), row.id);
  }

  console.log(isDryRun ? "--dry-run：只看不改。" : "归位完成。");
} finally {
  database.close();
}
