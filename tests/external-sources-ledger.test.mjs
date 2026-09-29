import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  deriveCompileStatus,
  extractCanonicalIds,
  parseLedgerSection,
} from "../src/lib/external-sources-ledger.ts";

const readmePath = path.join(
  process.cwd(),
  "seed-packs",
  "external-sources",
  "README.md",
);
const snapshotPath = path.join(
  process.cwd(),
  "src",
  "data",
  "external-sources-ledger.json",
);

const markdown = readFileSync(readmePath, "utf8");
const entries = parseLedgerSection(markdown);
const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));

const LEDGER_FIELDS = [
  "seq",
  "source",
  "type",
  "status",
  "sourceUrl",
  "disposition",
  "landing",
  "verifiedAt",
  "note",
];

test("能解析出第六节采集台账的全部来源", () => {
  assert.equal(entries.length, 23);
  assert.equal(entries[0].seq, 1);
  assert.equal(entries[0].source, "Ponytail（7 层防重复造轮子）");
  assert.equal(entries[0].type, "Skill/MCP");
  assert.equal(entries[0].landing, "templates/new-project/AGENTS.md");
  assert.equal(entries[0].verifiedAt, "2026-09");
  assert.equal(entries[22].source.startsWith("S8 WorkBuddy 生态"), true);
});

test("解析时清洗 Markdown 标记：加粗与行内代码不留在纯文本里", () => {
  // 第 14 行（S4）在 README 里写作 **S4 Supabase 官方 Skills**（…），落点带反引号
  const s4 = entries[13];
  assert.equal(s4.source.startsWith("**"), false);
  assert.equal(s4.source.includes("`"), false);
  assert.equal(s4.landing, "RULE-PG-FK-INDEX-001 等 6 条");
});

test("找不到台账小节或表格不完整时返回空数组", () => {
  assert.deepEqual(parseLedgerSection("# 别的文档\n\n没有表格"), []);
  assert.deepEqual(
    parseLedgerSection("## 六、采集进度台账\n\n| 只有表头 |\n"),
    [],
  );
});

test("能从「落到哪条资产」里抽出规范 ID", () => {
  assert.deepEqual(extractCanonicalIds("`MTH-TEAM-OKR-001`"), [
    "MTH-TEAM-OKR-001",
  ]);
  assert.deepEqual(extractCanonicalIds("RULE-PG-FK-INDEX-001 等 6 条"), [
    "RULE-PG-FK-INDEX-001",
  ]);
  assert.deepEqual(extractCanonicalIds("AGENTS.md「界面改动的验证」"), []);
});

test("是否编译的派生：空落点、知识库、已编译候选、未编译、未导入、已进模板", () => {
  const index = {
    "MTH-TEAM-OKR-001": {
      libraryAssetId: "document-team-method-okr-md",
      canonicalId: "MTH-TEAM-OKR-001",
      title: "OKR：目标与关键结果",
      assetType: "document",
      status: "active",
      role: "source",
      authority: false,
    },
    "RULE-LIVE-001": {
      libraryAssetId: "rule-live",
      canonicalId: "RULE-LIVE-001",
      title: "某条已发布规则",
      assetType: "rule",
      status: "active",
    },
    "RULE-DRAFT-001": {
      libraryAssetId: "rule-draft",
      canonicalId: "RULE-DRAFT-001",
      title: "某条候选规则",
      assetType: "rule",
      status: "candidate",
    },
  };

  assert.equal(deriveCompileStatus("—", index).level, "empty");
  assert.equal(deriveCompileStatus("", index).level, "empty");

  const knowledge = deriveCompileStatus("`MTH-TEAM-OKR-001`", index);
  assert.equal(knowledge.level, "knowledge");
  assert.equal(knowledge.matchedAssets[0].libraryAssetId, "document-team-method-okr-md");

  assert.equal(deriveCompileStatus("`RULE-LIVE-001`", index).level, "compiled_candidate");
  assert.equal(deriveCompileStatus("`RULE-DRAFT-001`", index).level, "not_compiled");

  // 写了 ID 但库内没有（例如种子包里的规则不在本机库）
  assert.equal(deriveCompileStatus("`PLAYBOOK-DEBUG-001`", index).level, "not_imported");

  // 落点是文件路径或 AGENTS.md 章节，不是库内资产
  assert.equal(
    deriveCompileStatus("templates/new-project/AGENTS.md", index).level,
    "template",
  );
  assert.equal(
    deriveCompileStatus("AGENTS.md「界面改动的验证」", index).level,
    "template",
  );
});

// 这条就是「纳入 check:fast」的落点：README 改了但没重跑生成脚本，这里会红。
test("JSON 快照与 README 台账逐字段一致（README 改了要重跑生成脚本）", () => {
  assert.equal(snapshot.count, entries.length);
  assert.equal(snapshot.sources.length, entries.length);

  entries.forEach((entry, position) => {
    const record = snapshot.sources[position];
    for (const field of LEDGER_FIELDS) {
      assert.equal(
        record[field],
        entry[field],
        `第 ${entry.seq} 条来源的 ${field} 与 README 不一致，请重跑 npm run generate:leads3-ledger`,
      );
    }
    assert.ok(record.compileStatus, `第 ${entry.seq} 条缺少 compileStatus`);
  });
});
