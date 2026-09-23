import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  parseRulePackFile,
  seedPackFilesToRulePack,
} from "../src/lib/seed-pack-import.ts";

const repositoryRoot = new URL("../", import.meta.url);
const packRoot = new URL("../seed-packs/operator-training/", import.meta.url);
const assetsRoot = new URL("assets/", packRoot);
const packId = "rule-pack-operator-training";

const requiredFields = [
  "id",
  "title",
  "asset_type",
  "audience",
  "module",
  "difficulty",
  "purpose",
  "layer",
  "tech_context",
  "priority",
  "scope",
  "project_scale",
  "lifecycle_phase",
  "status",
  "confidence",
  "override_allowed",
  "compile_target",
  "verification",
  "evidence",
  "source_references",
  "related_assets",
  "version",
  "last_reviewed",
];

const allowedValues = {
  asset_type: ["principle", "method", "playbook", "rule", "template", "case_note"],
  // 训练包的资产一律面向人
  audience: ["human"],
  module: [
    "心法",
    "M1-开工",
    "M2-派活",
    "M3-驭程",
    "M4-验收",
    "M5-排错",
    "M6-上线",
    "M7-沉淀",
  ],
  difficulty: ["L1", "L2", "L3"],
  purpose: [
    "analysis",
    "development",
    "testing",
    "release",
    "data",
    "safety",
    "collaboration",
  ],
  layer: ["project", "module", "feature", "file", "data"],
  scope: ["global", "project", "task"],
  priority: ["p0", "p1", "p2"],
  status: ["draft", "candidate", "active", "deprecated"],
  confidence: ["hypothesis", "provisional", "verified"],
  verification: ["manual", "test", "gate", "runtime"],
  compile_target: ["agents", "readme", "start_prompt", "template", "none"],
  project_scale: ["personal", "medium", "large", "regulated"],
  lifecycle_phase: ["analysis", "design", "build", "release", "operate"],
  tech_context: ["generic", "nextjs", "supabase", "postgres", "vercel"],
};

const commonSections = [
  "核心结论",
  "使用条件",
  "不适用场景",
  "失败模式",
  "验证证据",
  "相关资产",
];

function parseAsset(text) {
  const lines = text.split(/\r?\n/);

  assert.equal(lines[0], "---", "资产文件缺少 Front Matter 起始标记");

  const closingIndex = lines.indexOf("---", 1);

  assert.ok(closingIndex > 0, "资产文件缺少 Front Matter 结束标记");

  const fields = {};
  let currentKey = null;

  for (const line of lines.slice(1, closingIndex)) {
    if (/^[a-z_]+:/.test(line)) {
      const [key, rawValue] = line.split(/:(.*)/s);
      const value = (rawValue ?? "").trim();

      currentKey = key;
      fields[key] = value === "" || value === "[]" ? [] : value;

      if (value !== "" && value !== "[]") {
        currentKey = null;
      }

      continue;
    }

    const listMatch = line.match(/^\s+-\s*(.+)$/);

    if (listMatch && currentKey) {
      fields[currentKey].push(listMatch[1].trim());
    }
  }

  const body = lines.slice(closingIndex + 1).join("\n");

  return {
    fields,
    body,
    sections: body
      .split(/\r?\n/)
      .filter((line) => line.startsWith("## "))
      .map((line) => line.slice(3).trim()),
  };
}

function readAssets() {
  return readdirSync(assetsRoot)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => ({
      name,
      ...parseAsset(readFileSync(new URL(name, assetsRoot), "utf8")),
    }));
}

function readPackFiles() {
  // 和构建脚本一致：相对包根目录的路径（用 / 分隔）+ 文件内容
  const collected = [];
  const rootPath = fileURLToPath(packRoot).replace(/\\/g, "/").replace(/\/$/, "");

  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = `${directory}/${entry.name}`;

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".md")) {
        collected.push({
          path: fullPath.slice(rootPath.length + 1),
          content: readFileSync(fullPath, "utf8"),
        });
      }
    }
  }

  walk(rootPath);

  return collected;
}

const assets = readAssets();

function readManifest() {
  const text = readFileSync(new URL("manifest.md", packRoot), "utf8");

  return {
    version: text.match(/\| 版本 \| `([^`]+)` \|/)?.[1],
    assetCount: Number(text.match(/\| 资产数量 \| (\d+)/)?.[1] ?? Number.NaN),
  };
}

test("每条训练资产都带 audience、module、difficulty 和完整字段", () => {
  for (const asset of assets) {
    for (const field of requiredFields) {
      assert.ok(
        Object.hasOwn(asset.fields, field),
        `${asset.name} 缺少字段：${field}`,
      );
    }

    for (const [field, values] of Object.entries(allowedValues)) {
      const value = asset.fields[field];

      if (value === undefined) {
        continue;
      }

      for (const item of Array.isArray(value) ? value : [value]) {
        assert.ok(
          values.includes(item),
          `${asset.name} 的 ${field} 取值不在允许范围：${item}`,
        );
      }
    }

    assert.match(
      String(asset.fields.last_reviewed),
      /^\d{4}-\d{2}-\d{2}$/,
      `${asset.name} 的 last_reviewed 不是日期格式`,
    );
  }
});

test("清单声明的资产数量和版本对得上", () => {
  const manifest = readManifest();

  assert.match(String(manifest.version), /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.assetCount, assets.length);

  for (const asset of assets) {
    assert.equal(
      asset.fields.version,
      manifest.version,
      `${asset.name} 的版本和清单不一致`,
    );
  }
});

test("每条训练资产的正文包含必需章节和类型专属章节", () => {
  for (const asset of assets) {
    for (const section of commonSections) {
      assert.ok(
        asset.sections.includes(section),
        `${asset.name} 缺少章节：${section}`,
      );
    }

    const extraSections = asset.sections.filter(
      (section) => !commonSections.includes(section),
    );

    assert.ok(
      extraSections.length > 0,
      `${asset.name} 缺少操作步骤或清单章节`,
    );
  }
});

test("包内引用能解析，正文里指到工程包的资产也确实存在", () => {
  const packIds = new Set(assets.map((asset) => asset.fields.id));
  const engineeringRoot = new URL(
    "../seed-packs/engineering-foundations/assets/",
    import.meta.url,
  );
  const engineeringIds = new Set(
    readdirSync(engineeringRoot)
      .filter((name) => name.endsWith(".md"))
      .map((name) =>
        parseAsset(readFileSync(new URL(name, engineeringRoot), "utf8")).fields
          .id,
      ),
  );

  for (const asset of assets) {
    for (const reference of asset.fields.related_assets ?? []) {
      assert.ok(
        packIds.has(reference),
        `${asset.name} 引用了不存在的包内资产：${reference}`,
      );
    }

    // 正文里可以用工程包的 ID 做"回链"，但必须真实存在
    for (const match of asset.body.matchAll(
      /\b(?:OPS|MTH|PLAYBOOK|RULE|TPL|CASE)-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/g,
    )) {
      const id = match[0];

      assert.ok(
        packIds.has(id) || engineeringIds.has(id),
        `${asset.name} 正文里引用了不存在的资产：${id}`,
      );
    }

    const documentFields = [
      ...(asset.fields.evidence ?? []),
      ...(asset.fields.source_references ?? []),
    ];

    for (const entry of documentFields) {
      for (const match of entry.matchAll(/[A-Za-z0-9_./-]+\.md/g)) {
        const file = fileURLToPath(new URL(match[0], repositoryRoot));

        assert.ok(
          existsSync(file) && statSync(file).isFile(),
          `${asset.name} 引用的文档不存在：${match[0]}`,
        );
      }
    }
  }
});

test("打包产物与源文件一致", () => {
  const { pack, members } = seedPackFilesToRulePack(readPackFiles(), {
    packId,
    exportedAt: "2026-09-24T00:00:00.000Z",
    fallbackTitle: "操作者训练包",
  });

  assert.equal(pack.title, "操作者训练包");
  assert.equal(pack.metadata.packVersion, "0.1.0");
  assert.equal(members.length, assets.length);

  const committed = readFileSync(
    new URL("operator-training.pack.json", packRoot),
    "utf8",
  );

  assert.deepEqual(
    parseRulePackFile(committed)
      .members.map((member) => member.id)
      .sort(),
    members.map((member) => member.id).sort(),
    "提交的包文件和源文件不一致，重跑 npm run pack:operator",
  );
  // 模板类落在文档资产，其余落在规则资产
  assert.equal(
    members.filter((member) => member.assetType === "document").length,
    1,
  );
  assert.equal(
    members.filter((member) => member.assetType === "rule").length,
    assets.length - 1,
  );
});
