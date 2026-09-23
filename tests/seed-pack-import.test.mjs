import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  RULE_PACK_FILE_TYPE,
  createRulePackFile,
  parseRulePackFile,
  parseSeedFrontMatter,
  seedPackFilesToRulePack,
} from "../src/lib/seed-pack-import.ts";

const packRoot = fileURLToPath(
  new URL("../seed-packs/engineering-foundations/", import.meta.url),
);
const generatedPackPath = join(
  packRoot,
  "engineering-foundations.pack.json",
);
const packId = "rule-pack-engineering-foundations";

function readPackFiles() {
  const files = [];

  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push({
          path: fullPath.slice(packRoot.length).replace(/\\/g, "/"),
          content: readFileSync(fullPath, "utf8"),
        });
      }
    }
  }

  walk(packRoot);

  return files;
}

function parseRealPack() {
  return seedPackFilesToRulePack(readPackFiles(), {
    packId,
    exportedAt: "2026-09-23T00:00:00.000Z",
    fallbackTitle: "工程方法种子资产包",
  });
}

test("种子包的包信息按 manifest 和 README 落地", () => {
  const { pack, members } = parseRealPack();

  assert.equal(pack.title, "工程方法种子资产包");
  assert.equal(pack.metadata.packVersion, "0.2.1");
  assert.equal(pack.metadata.packConfidence, "provisional");
  assert.equal(pack.status, "active");
  assert.match(pack.summary, /分析方法/);
  assert.equal(members.length, 27);
  assert.equal(
    members.filter((member) => member.assetType === "rule").length,
    12,
  );
  assert.equal(
    members.filter((member) => member.assetType === "document").length,
    15,
  );
});

test("方法、流程、规则落成规则资产，模板和案例落成文档资产", () => {
  const { members } = parseRealPack();
  const byId = new Map(members.map((member) => [member.id, member]));

  const method = byId.get("rule-mth-project-001");
  assert.equal(method.assetType, "rule");
  assert.equal(method.metadata.ruleType, "recommended");
  assert.equal(method.metadata.priority, "must");
  assert.equal(method.metadata.scope, "global");
  assert.equal(method.metadata.confidence, "provisional");
  assert.deepEqual(method.metadata.compileTarget, ["agents", "readme"]);
  assert.equal(method.metadata.pack.packItemId, "MTH-PROJECT-001");
  assert.equal(method.metadata.pack.packAssetType, "method");
  assert.ok(method.metadata.pack.projectScale.includes("personal"));

  const playbook = byId.get("rule-playbook-release-001");
  assert.equal(playbook.metadata.ruleType, "process");

  const template = byId.get("document-tpl-accept-001");
  assert.equal(template.assetType, "document");
  assert.equal(template.metadata.documentType, "模板");

  const caseNote = byId.get("document-case-parallel-001");
  assert.equal(caseNote.metadata.documentType, "案例");

  const profile = byId.get("document-profile-personal-001");
  assert.equal(profile.metadata.documentType, "项目画像");
  assert.equal(profile.title, "个人工具");

  const validation = byId.get("document-validation-01-personal-tool");
  assert.equal(validation.metadata.documentType, "编译验证记录");

  // manifest 和 schema 属于包的定义，不单独建资产
  assert.equal(byId.has("document-manifest"), false);
  assert.equal(byId.has("document-schema"), false);
});

test("规则带理由、来源片段和可信度，正文保留包内原始元数据", () => {
  const { members } = parseRealPack();
  const rule = members.find(
    (member) => member.id === "rule-rule-boundary-001",
  );

  assert.equal(rule.metadata.ruleType, "must");
  assert.equal(rule.metadata.verification, "门禁检查");
  assert.equal(rule.metadata.purpose, "数据");
  assert.equal(rule.metadata.overrideScope, "none");
  assert.deepEqual(rule.metadata.compileTarget, ["agents"]);
  assert.match(rule.metadata.evidence, /RLS/);
  assert.equal(rule.summary.startsWith("每类业务数据必须有唯一写入方"), true);
  assert.match(rule.content, /## 包内原始元数据/);
  assert.match(rule.content, /last_reviewed: 2026-09-21/);
});

test("包内引用在成员之间建关系，指向包外的引用不建关系", () => {
  const { members, warnings } = parseRealPack();
  const rule = members.find(
    (member) => member.id === "rule-rule-boundary-001",
  );
  const targets = rule.metadata.relations.map(
    (relation) => relation.targetAssetId,
  );
  const memberIds = new Set(members.map((member) => member.id));

  assert.deepEqual(targets, ["rule-mth-module-001", "rule-mth-arch-001"]);
  for (const target of targets) {
    assert.equal(memberIds.has(target), true);
  }
  assert.deepEqual(warnings, []);

  const outside = seedPackFilesToRulePack(
    [
      {
        path: "assets/900-sample.md",
        content: [
          "---",
          "id: TST-OUTSIDE-001",
          "title: 引用包外资产的样例子",
          "asset_type: rule",
          "rule_type: must",
          "purpose: testing",
          "priority: p0",
          "scope: project",
          "status: candidate",
          "confidence: hypothesis",
          "related_assets:",
          "  - 不存在的编号",
          "---",
          "",
          "# 引用包外资产的样例子",
        ].join("\n"),
      },
    ],
    { packId, exportedAt: "2026-09-23T00:00:00.000Z" },
  );

  assert.equal(outside.members[0].metadata.relations, undefined);
  assert.equal(outside.warnings.length, 1);
  assert.match(outside.warnings[0], /不在这个包内/);
});

test("同一份种子包解析两次结果完全一致，成员标识稳定", () => {
  const first = parseRealPack();
  const second = parseRealPack();

  assert.deepEqual(first.members, second.members);
  assert.equal(
    first.members.every((member) => /^(rule|document)-[a-z0-9-]+$/.test(member.id)),
    true,
  );
  assert.equal(first.members[0].id.startsWith("rule-mth-"), true);
});

test("仓库里的规则包文件和种子包源文件保持一致", () => {
  const generated = parseRulePackFile(readFileSync(generatedPackPath, "utf8"));
  const parsed = parseRealPack();

  assert.equal(generated.type, RULE_PACK_FILE_TYPE);
  assert.deepEqual(generated.pack, parsed.pack);
  assert.deepEqual(generated.members, parsed.members);
  assert.match(generated.note, /只新增不覆盖/);
});

test("规则包文件的类型、版本和成员缺一不可", () => {
  const { pack, members } = parseRealPack();
  const file = createRulePackFile({
    pack,
    members,
    exportedAt: "2026-09-23T00:00:00.000Z",
  });
  const text = JSON.stringify(file);

  assert.equal(parseRulePackFile(text).members.length, members.length);
  assert.throws(
    () => parseRulePackFile(JSON.stringify({ ...file, type: "别的类型" })),
    /不是规则包/,
  );
  assert.throws(
    () => parseRulePackFile(JSON.stringify({ ...file, version: 99 })),
    /版本无法识别/,
  );
  assert.throws(
    () => parseRulePackFile(JSON.stringify({ ...file, members: [{}] })),
    /成员清单不完整/,
  );
});

test("front-matter 只按种子包用到的两种写法解析", () => {
  const parsed = parseSeedFrontMatter(
    [
      "---",
      "id: X-1",
      "title: 样本",
      "tech_context:",
      "  - nextjs",
      "  - supabase",
      "status: candidate",
      "---",
      "",
      "正文第一行",
    ].join("\n"),
  );

  assert.equal(parsed.fields.id, "X-1");
  assert.equal(parsed.fields.title, "样本");
  assert.deepEqual(parsed.lists.tech_context, ["nextjs", "supabase"]);
  assert.equal(parsed.body, "正文第一行");

  const withoutFrontMatter = parseSeedFrontMatter("# 只有正文");
  assert.deepEqual(withoutFrontMatter.fields, {});
  assert.equal(withoutFrontMatter.body, "# 只有正文");
});
