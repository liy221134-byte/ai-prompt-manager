import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { isAssetData } from "../src/data/assets.ts";
import {
  templateDraftToAsset,
  templateFileToDraft,
} from "../src/lib/template-asset.ts";

// 需求链路的闭合检查：需求(PRD) → 规格(Spec) → 契约(zod) → 交付(工程模板)。
//
// 这份测试不评判单份模板写得好不好（那是 engineering-templates.test.mjs 的事），
// 它只回答一个工程问题：这条链路在机制上通不通——
//   ① 四段模板齐备、编号唯一且写在头部；
//   ② 模板之间互相引用的文件真实存在（别出现「指向一份不存在的 PRD」这种断链）；
//   ③ 索引里写的模板路径存在、编号与模板头部一致；
//   ④ 每份模板都能被导入机制转成合法资产——这一步才证明「改了模板，下次导入就生效」。
//   ⑤ 新项目起步模板要指认这条链路——否则新项目从第一天起就不知道有这条链路。
//
// 一旦这条链路中任一环被改坏，这里会先红，而不是等到导入脚本跑到一半才发现。

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const templateDir = join(repoRoot, "templates", "engineering");
const indexPath = join(repoRoot, "docs", "INDEX.md");
const newProjectDir = join(repoRoot, "templates", "new-project");
const now = "2026-10-01T00:00:00.000Z";

// 链路四段与模板编号：这张表就是「设计意图」，编号或文件改了必须一起改这里
const chainSegments = [
  { segment: "需求", file: "prd.md", code: "TPL-PRD-001" },
  { segment: "规格", file: "implementation-spec.md", code: "TPL-SPEC-001" },
  { segment: "契约", file: "data-contract.md", code: "TPL-CONTRACT-001" },
];

// 和 scripts/import-local-content.ts 用同一套规则：非字母数字压成短横，供资产标识用
function slugify(value) {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readTemplate(file) {
  return readFileSync(join(templateDir, file), "utf8");
}

function readHeading(content) {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
}

function listTemplateFiles() {
  return readdirSync(templateDir)
    .filter((name) => name.endsWith(".md"))
    .sort();
}

test("链路四段的模板都在，编号唯一且写在头部", () => {
  const seen = new Map();

  for (const { segment, file, code } of chainSegments) {
    const content = readTemplate(file);

    assert.ok(
      content.includes(`\`${code}\``),
      `${segment}段模板 ${file} 的头部要写明编号 ${code}`,
    );
    assert.ok(!seen.has(code), `模板编号 ${code} 重复：${seen.get(code)} 和 ${file}`);
    seen.set(code, file);
  }
});

test("模板之间互相引用的文件名都真实存在", () => {
  const localFiles = new Set(listTemplateFiles());
  const brokenRefs = [];

  for (const file of listTemplateFiles()) {
    const content = readTemplate(file);
    // 抓两类引用：反引号里的裸文件名（如 `prd.md`）、Markdown 链接里的 .md
    const refs = new Set();

    for (const match of content.matchAll(/`([A-Za-z0-9._-]+\.md)`/g)) {
      refs.add(match[1]);
    }

    for (const match of content.matchAll(/\]\(([^)]*\.md)\)/g)) {
      refs.add(match[1].replace(/^\.\//, "").split("/").pop());
    }

    for (const ref of refs) {
      // 允许指向同目录模板，或仓库根的文件（如 AGENTS.md）
      const inTemplates = localFiles.has(ref);
      const inRepoRoot = existsSync(join(repoRoot, ref));

      if (!inTemplates && !inRepoRoot) {
        brokenRefs.push(`${file} → ${ref}`);
      }
    }
  }

  assert.deepEqual(brokenRefs, [], "模板引用了找不到的文件，链路断了");
});

test("索引里指向模板库的链接都能落到真实文件", () => {
  const index = readFileSync(indexPath, "utf8");
  const links = [...index.matchAll(/\]\(([^)]+\.md)\)/g)]
    .map((match) => match[1])
    .filter((link) => link.includes("templates/"));

  assert.ok(links.length >= 2, "索引里至少要列出工程模板与方法模板两处");

  for (const link of links) {
    const abs = resolve(dirname(indexPath), link);

    assert.ok(existsSync(abs), `索引链接 ${link} 指不到文件`);
  }
});

test("索引里的链路编号表和模板头部一致", () => {
  const index = readFileSync(indexPath, "utf8");

  for (const { file, code } of chainSegments) {
    assert.ok(index.includes(`\`${code}\``), `索引里缺少 ${code}（${file}）`);
  }
});

test("每份工程模板都能被导入机制转成合法资产", () => {
  const files = listTemplateFiles();
  const ids = new Set();

  assert.ok(files.length >= chainSegments.length, "模板数量不该少于链路四段");

  for (const fileName of files) {
    const content = readFileSync(join(templateDir, fileName), "utf8");
    const draft = templateFileToDraft({ fileName, content });
    // 和 scripts/import-local-content.ts 一致：标题取正文一级标题，取不到才退回文件名
    draft.title = readHeading(content) || draft.title;

    assert.ok(draft.title.trim().length > 0, `${fileName} 转成草稿后标题为空`);

    // 标识与导入脚本同规则：重复标识会让两份模板在库里互相顶掉
    const id = `template-${slugify(fileName)}`;

    assert.ok(!ids.has(id), `模板标识 ${id} 重复`);
    ids.add(id);

    const asset = templateDraftToAsset({
      id,
      projectId: "project-default",
      draft,
      originalFilename: `engineering/${fileName}`,
      now,
    });

    assert.equal(isAssetData(asset), true, `${fileName} 转成的资产结构不合法`);
    assert.equal(asset.assetType, "template");
    assert.equal(asset.metadata.outputFileName, fileName);
    assert.equal(asset.source.originalFilename, `engineering/${fileName}`);
    assert.ok(asset.content.trim().length > 0, `${fileName} 转成资产后正文为空`);
  }
});

// 起步模板是新项目的入口。链路四段如果在起步模板里不见踪影，
// 新项目从第一天起就不知道有这条链路——所以这里也把它锁住。
test("新项目起步模板指认需求链路与文档体系", () => {
  const docSystem = readFileSync(
    join(newProjectDir, "docs", "DOCUMENT_SYSTEM.md"),
    "utf8",
  );

  for (const { segment } of chainSegments) {
    assert.ok(
      docSystem.includes(segment),
      `起步模板的文档体系没提「${segment}」段——新项目起步就看不到这条链路`,
    );
  }

  const startPrompt = readFileSync(join(newProjectDir, "START_PROMPT.md"), "utf8");

  assert.ok(
    startPrompt.includes("DOCUMENT_SYSTEM"),
    "起步提示词要把新项目指向 docs/DOCUMENT_SYSTEM.md，否则文档体系只是一份没人读的文件",
  );
});
