import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = new URL("../", import.meta.url);
const packRoot = new URL(
  "../seed-packs/engineering-foundations/",
  import.meta.url,
);
const assetsRoot = new URL("assets/", packRoot);

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
  priority: ["p0", "p1", "p2"],
  status: ["draft", "candidate", "active", "deprecated"],
  confidence: ["hypothesis", "provisional", "verified"],
  verification: ["manual", "test", "gate", "runtime"],
  rule_type: ["must", "forbidden", "recommended", "process", "acceptance", "technology"],
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

const caseSections = [
  "核心结论",
  "使用条件",
  "不适用场景",
  "经过与根因",
  "改进与门禁",
  "失败模式",
  "验证证据",
  "相关资产",
];

// 只解析本资产包用到的 YAML 子集：标量、块状列表和空列表。
function parseAsset(text) {
  const lines = text.split(/\r?\n/);

  if (lines[0] !== "---") {
    throw new Error("资产文件缺少 Front Matter 起始标记。");
  }

  const closingIndex = lines.indexOf("---", 1);

  if (closingIndex < 0) {
    throw new Error("资产文件缺少 Front Matter 结束标记。");
  }

  const frontMatter = lines.slice(1, closingIndex);
  const fields = {};
  let currentKey = null;

  for (const line of frontMatter) {
    if (/^[a-z_]+:/.test(line)) {
      const [key, rawValue] = line.split(/:(.*)/s);
      const value = (rawValue ?? "").trim();
      currentKey = key;

      if (value === "") {
        fields[key] = [];
      } else if (value === "[]") {
        fields[key] = [];
      } else {
        fields[key] = value;
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
  const sections = body
    .split(/\r?\n/)
    .filter((line) => line.startsWith("## "))
    .map((line) => line.slice(3).trim());

  return { fields, sections, body };
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

const assets = readAssets();

function readManifest() {
  const text = readFileSync(new URL("manifest.md", packRoot), "utf8");
  const version = text.match(/\| 版本 \| `([^`]+)` \|/)?.[1];
  const assetCount = Number(
    text.match(/\| 资产数量 \| (\d+)/)?.[1] ?? Number.NaN,
  );

  return { version, assetCount };
}

test("每条资产都包含 schema 0.2.0 要求的字段和取值", () => {
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

      const items = Array.isArray(value) ? value : [value];

      for (const item of items) {
        assert.ok(
          values.includes(item),
          `${asset.name} 的 ${field} 取值不在允许范围：${item}`,
        );
      }
    }

    if (asset.fields.asset_type === "rule") {
      assert.ok(
        Object.hasOwn(asset.fields, "rule_type"),
        `${asset.name} 是规则资产，但缺少 rule_type`,
      );
    }

    assert.match(
      String(asset.fields.last_reviewed),
      /^\d{4}-\d{2}-\d{2}$/,
      `${asset.name} 的 last_reviewed 不是日期格式`,
    );
  }
});

test("资产版本与清单声明保持一致", () => {
  const manifest = readManifest();

  assert.ok(manifest.version, "清单里没有解析到版本号");
  assert.equal(
    manifest.assetCount,
    assets.length,
    "清单声明的资产数量与实际文件数量不一致",
  );

  for (const asset of assets) {
    assert.equal(
      asset.fields.version,
      manifest.version,
      `${asset.name} 的版本与清单不一致`,
    );
  }
});

test("每条资产的正文包含 schema 要求的章节", () => {
  for (const asset of assets) {
    const required =
      asset.fields.asset_type === "case_note" ? caseSections : commonSections;

    for (const section of required) {
      assert.ok(
        asset.sections.includes(section),
        `${asset.name} 缺少章节：${section}`,
      );
    }

    if (asset.fields.asset_type !== "case_note") {
      const extraSections = asset.sections.filter(
        (section) => !commonSections.includes(section),
      );

      assert.ok(
        extraSections.length > 0,
        `${asset.name} 缺少类型专属的方法或步骤章节`,
      );
    }
  }
});

test("资产关系引用和文档引用都可以解析", () => {
  const assetIds = new Set(assets.map((asset) => asset.fields.id));

  for (const asset of assets) {
    for (const reference of asset.fields.related_assets ?? []) {
      assert.ok(
        assetIds.has(reference),
        `${asset.name} 引用了不存在的资产：${reference}`,
      );
    }

    const documentFields = [
      ...(asset.fields.evidence ?? []),
      ...(asset.fields.source_references ?? []),
    ];

    for (const entry of documentFields) {
      for (const match of entry.matchAll(/[A-Za-z0-9_./-]+\.md/g)) {
        const path = match[0];
        const file = fileURLToPath(new URL(path, repositoryRoot));

        assert.ok(
          existsSync(file) && statSync(file).isFile(),
          `${asset.name} 引用的文档不存在：${path}`,
        );
      }
    }
  }
});
