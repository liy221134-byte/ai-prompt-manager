// 把仓库里的种子资产包（Markdown）编译成可导入的规则包文件。
// 用法：node scripts/build-seed-pack.mjs
// 改了种子包的 Markdown 之后要重跑一次，测试会检查两边是否一致。

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import {
  createRulePackFile,
  seedPackFilesToRulePack,
} from "../src/lib/seed-pack-import.ts";

const projectRoot = resolve(import.meta.dirname, "..");
const packRoot = join(projectRoot, "seed-packs", "engineering-foundations");
const outputPath = join(packRoot, "engineering-foundations.pack.json");
const packId = "rule-pack-engineering-foundations";

function readMarkdownFiles(directory) {
  const files = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...readMarkdownFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push({
        path: relative(packRoot, fullPath).replace(/\\/g, "/"),
        content: readFileSync(fullPath, "utf8"),
      });
    }
  }

  return files;
}

if (!statSync(packRoot).isDirectory()) {
  throw new Error(`找不到种子包目录：${packRoot}`);
}

const exportedAt = new Date().toISOString();
const parsed = seedPackFilesToRulePack(readMarkdownFiles(packRoot), {
  packId,
  exportedAt,
  fallbackTitle: "工程方法种子资产包",
});
const packFile = createRulePackFile({
  pack: parsed.pack,
  members: parsed.members,
  exportedAt,
});

writeFileSync(outputPath, `${JSON.stringify(packFile, null, 2)}\n`, "utf8");

console.log(`已生成规则包：${relative(projectRoot, outputPath)}`);
console.log(
  `包「${parsed.pack.title}」版本 ${parsed.pack.metadata.packVersion}，成员 ${parsed.members.length} 条`,
);

for (const warning of parsed.warnings) {
  console.log(`提醒：${warning}`);
}
