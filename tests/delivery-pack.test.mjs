import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createRulePackFile,
  parseRulePackFile,
  seedPackFilesToRulePack,
} from "../src/lib/seed-pack-import.ts";

const packRoot = new URL("../seed-packs/delivery-readiness/", import.meta.url);
const assetsRoot = new URL("assets/", packRoot);
const packId = "rule-pack-delivery-readiness";
const packTitle = "交付就绪包";

const requiredFields = [
  "id",
  "title",
  "asset_type",
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
  project_scale: ["personal", "medium", "large", "regulated"],
  tech_context: ["generic", "nextjs", "supabase", "postgres", "vercel"],
  lifecycle_phase: ["analysis", "design", "build", "release", "operate"],
  priority: ["p0", "p1", "p2"],
  status: ["draft", "candidate", "active", "deprecated", "archived"],
  confidence: ["hypothesis", "provisional", "verified"],
  compile_target: ["agents", "readme", "start_prompt", "template", "none"],
  verification: ["manual", "automated", "peer_review"],
};

// 每条资产都要有的章节：缺一节就等于少了一块判断依据
const commonSections = [
  "核心结论",
  "使用条件",
  "不适用场景",
  "失败模式",
  "验证证据",
  "相关资产",
];

// 本包之外允许引用的资产（来自工程包，不重复造）
const externalAssetIds = [
  "PLAYBOOK-RELEASE-001",
  "PLAYBOOK-INCIDENT-001",
  "CASE-MIGRATION-001",
  "MTH-ARCH-001",
  "MTH-SCOPE-001",
];

function parseAsset(text) {
  const lines = text.split(/\r?\n/);
  const closingIndex = lines.indexOf("---", 1);

  assert.ok(closingIndex > 0, "缺少 YAML Front Matter 结束标记");

  const fields = {};
  let currentKey = null;

  for (const line of lines.slice(1, closingIndex)) {
    if (/^[a-z_]+:/.test(line)) {
      const [key, rawValue] = line.split(/:(.*)/s);
      const value = (rawValue ?? "").trim();

      fields[key] = value === "" || value === "[]" ? [] : value;
      currentKey = value === "" || value === "[]" ? key : null;
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

const assets = readdirSync(assetsRoot)
  .filter((name) => name.endsWith(".md"))
  .sort()
  .map((name) => ({
    name,
    ...parseAsset(readFileSync(new URL(name, assetsRoot), "utf8")),
  }));
const inPackIds = assets.map((asset) => asset.fields.id);

function readPackFiles() {
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

test("每条交付资产的字段和取值都在允许范围内", () => {
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

test("每条资产都有必需章节，模板类另有结构章节", () => {
  for (const asset of assets) {
    for (const section of commonSections) {
      assert.ok(
        asset.sections.includes(section),
        `${asset.name} 缺少章节：${section}`,
      );
    }

    if (asset.fields.asset_type === "template") {
      assert.ok(
        asset.sections.some(
          (section) => section.endsWith("结构") || section.endsWith("步骤"),
        ),
        `${asset.name} 是模板，但没有写结构或步骤章节`,
      );
    }
  }
});

test("相关资产只引用包内已有的编号，或者白名单里的工程包资产", () => {
  for (const asset of assets) {
    for (const related of asset.fields.related_assets) {
      const referenced = related.match(/^[A-Z][A-Z0-9-]+/)?.[0] ?? "";

      assert.ok(
        inPackIds.includes(referenced) || externalAssetIds.includes(referenced),
        `${asset.name} 引用了不存在的资产编号：${related}`,
      );
    }
  }
});

test("清单声明的资产数量和版本对得上", () => {
  const manifest = readFileSync(new URL("manifest.md", packRoot), "utf8");
  const version = manifest.match(/\| 版本 \| `([^`]+)` \|/)?.[1];
  const assetCount = Number(manifest.match(/\| 资产数量 \| (\d+)/)?.[1]);

  assert.match(String(version), /^\d+\.\d+\.\d+$/);
  assert.equal(assetCount, assets.length);

  for (const asset of assets) {
    assert.equal(
      asset.fields.version,
      version,
      `${asset.name} 的版本和清单不一致`,
    );
  }
});

test("构建产物和 Markdown 一致，并且能被产品读回来", () => {
  const files = readPackFiles();
  const expected = createRulePackFile(
    seedPackFilesToRulePack(files, { packId, title: packTitle }),
  );
  const built = JSON.parse(
    readFileSync(new URL("delivery-readiness.pack.json", packRoot), "utf8"),
  );

  assert.deepEqual(
    { ...built, exportedAt: null },
    { ...expected, exportedAt: null },
    "种子包的 Markdown 改过但没重跑 npm run pack:delivery",
  );

  // 走产品自己那条解析路径：装不进去的包等于没做
  const parsed = parseRulePackFile(JSON.stringify(built));

  assert.equal(parsed.pack.id, packId);
  assert.equal(parsed.members.length, assets.length);
});
