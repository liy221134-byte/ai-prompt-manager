import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  buildAssetIndex,
  buildCollectionTaskPrompt,
  compileStatusLabels,
  deriveCompileStatus,
  extractCanonicalIds,
  filterByEcosystem,
  parseLedgerSection,
  resolveLandingAssets,
  summarizeEcosystems,
  toCollectionRecordRows,
} from "../src/lib/external-sources-ledger.ts";

// M1 时这个文件的重点在「JSON 快照与 README 是否一致」；
// M2 起台账进了产品（采集记录就是资产库里的文档），快照与生成脚本都退役了，
// 所以这里改成测「记录解析 → 视图行 → 档位推导」这条链，README 只留解析测试
// （迁移脚本还要用它读历史 23 条）。

const readmePath = path.join(
  process.cwd(),
  "seed-packs",
  "external-sources",
  "README.md",
);
const markdown = readFileSync(readmePath, "utf8");
const entries = parseLedgerSection(markdown);

function collectionRecord({
  id,
  title,
  seq,
  ecosystem,
  status = "active",
  landing = "",
  disposition = "",
  collectedAssetIds,
  createdAt,
  confirmation,
}) {
  return {
    id,
    projectId: "default",
    assetType: "document",
    title,
    summary: "",
    content: "",
    status,
    createdAt: createdAt ?? "2026-09-29T10:00:00.000Z",
    updatedAt: "2026-09-29T10:00:00.000Z",
    metadata: {
      documentType: "采集记录",
      role: "source",
      authority: false,
      sourceLocation: "seed-packs/external-sources/README.md",
      collection: {
        seq,
        ecosystem,
        disposition,
        landing,
        ...(collectedAssetIds ? { collectedAssetIds } : {}),
      },
      ...(confirmation ? { confirmation } : {}),
    },
  };
}

function ruleAsset(id, status) {
  return {
    id,
    projectId: "default",
    assetType: "rule",
    title: `规则 ${id}`,
    summary: "",
    content: "",
    status,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    metadata: { ruleType: "must", scope: "global" },
  };
}

function documentAsset(id, title) {
  return {
    id,
    projectId: "default",
    assetType: "document",
    title,
    summary: "",
    content: "",
    status: "active",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    metadata: { documentType: "团队方法", role: "source", authority: false },
  };
}

// —— README 解析（迁移脚本的数据来源）——

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

// —— 记录解析与派生（M2 视图的数据来源）——

test("只把「采集记录」文档挑成视图行，别的资产不进台账", () => {
  const rows = toCollectionRecordRows([
    collectionRecord({ id: "c1", title: "来源一", seq: 1, ecosystem: "开源社区" }),
    documentAsset("document-team-method-okr-md", "OKR：目标与关键结果"),
    ruleAsset("rule-demo", "candidate"),
    collectionRecord({ id: "c2", title: "来源二", seq: 2, ecosystem: "腾讯" }),
  ]);

  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => row.assetId),
    ["c1", "c2"],
  );
  assert.equal(rows[0].source, "来源一");
  assert.equal(rows[0].ecosystem, "开源社区");
  // 行号是给界面看的连续序号，不直接抄台账里的 seq
  assert.deepEqual(
    rows.map((row) => row.seq),
    [1, 2],
  );
});

test("行按登记序号排；没有序号的排在后面", () => {
  const rows = toCollectionRecordRows([
    collectionRecord({
      id: "c-no-seq",
      title: "手工建的",
      ecosystem: "其他",
      createdAt: "2026-09-29T09:00:00.000Z",
    }),
    collectionRecord({ id: "c2", title: "第二条", seq: 2, ecosystem: "阿里" }),
    collectionRecord({ id: "c1", title: "第一条", seq: 1, ecosystem: "腾讯" }),
  ]);

  assert.deepEqual(
    rows.map((row) => row.assetId),
    ["c1", "c2", "c-no-seq"],
  );
});

test("缺字段的记录不崩：空值显示成「—」，生态缺省归到其他", () => {
  const rows = toCollectionRecordRows([
    {
      id: "c-broken",
      projectId: "default",
      assetType: "document",
      title: "半截记录",
      summary: "",
      content: "",
      status: "active",
      createdAt: "2026-09-29T10:00:00.000Z",
      updatedAt: "2026-09-29T10:00:00.000Z",
      metadata: { documentType: "采集记录", role: "source", authority: false },
    },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].ecosystem, "其他");
  assert.equal(rows[0].type, "");
  assert.equal(rows[0].confirmed, null);
});

test("确认记录会跟着记录一起读出来", () => {
  const rows = toCollectionRecordRows([
    collectionRecord({
      id: "c1",
      title: "来源一",
      seq: 1,
      ecosystem: "腾讯",
      confirmation: {
        confirmedBy: "本机使用者",
        confirmedAt: "2026-09-29T12:00:00.000Z",
        basis: "看过原文",
      },
    }),
  ]);

  assert.equal(rows[0].confirmed?.confirmedBy, "本机使用者");
});

test("是否编译的派生：空落点、知识库、已进编译候选、未编译、未导入、已进模板", () => {
  const assets = [
    documentAsset("document-team-method-okr-md", "OKR：目标与关键结果"),
    ruleAsset("rule-live", "active"),
    ruleAsset("rule-draft", "candidate"),
  ];
  const index = buildAssetIndex(assets);

  assert.equal(deriveCompileStatus({ landing: "—" }, index).level, "empty");
  assert.equal(deriveCompileStatus({ landing: "" }, index).level, "empty");

  const knowledge = deriveCompileStatus(
    { landing: "MTH-TEAM-OKR-001", collectedAssetIds: ["document-team-method-okr-md"] },
    index,
  );
  assert.equal(knowledge.level, "knowledge");
  assert.equal(
    knowledge.matchedAssets[0].libraryAssetId,
    "document-team-method-okr-md",
  );

  assert.equal(
    deriveCompileStatus(
      { landing: "RULE-LIVE-001", collectedAssetIds: ["rule-live"] },
      index,
    ).level,
    "compiled_candidate",
  );
  assert.equal(
    deriveCompileStatus(
      { landing: "RULE-DRAFT-001", collectedAssetIds: ["rule-draft"] },
      index,
    ).level,
    "not_compiled",
  );

  // 写了 ID 但库内没有（例如种子包里的规则不在本机库）
  assert.equal(
    deriveCompileStatus({ landing: "PLAYBOOK-DEBUG-001" }, index).level,
    "not_imported",
  );

  // 落点是文件路径或 AGENTS.md 章节，不是库内资产
  assert.equal(
    deriveCompileStatus({ landing: "templates/new-project/AGENTS.md" }, index)
      .level,
    "template",
  );
  assert.equal(
    deriveCompileStatus({ landing: "AGENTS.md「界面改动的验证」" }, index).level,
    "template",
  );
});

test("落点里有规则也有文档时，按规则判档（规则才进 AGENTS.md）", () => {
  const assets = [
    documentAsset("document-reference-x", "参考资料"),
    ruleAsset("rule-live", "active"),
  ];

  const status = deriveCompileStatus(
    { landing: "两条", collectedAssetIds: ["document-reference-x", "rule-live"] },
    buildAssetIndex(assets),
  );

  assert.equal(status.level, "compiled_candidate");
  assert.equal(status.matchedAssets.length, 2);
});

test("「已进编译候选」的措辞说清了还没编译（M1 写的「已编译候选」与事实不符）", () => {
  assert.equal(
    compileStatusLabels.compiled_candidate,
    "已进编译候选（待确认发布）",
  );
});

test("按生态筛选：选中某档只留该档，传空串返全部", () => {
  const rows = toCollectionRecordRows([
    collectionRecord({ id: "c1", title: "一", seq: 1, ecosystem: "腾讯" }),
    collectionRecord({ id: "c2", title: "二", seq: 2, ecosystem: "开源社区" }),
    collectionRecord({ id: "c3", title: "三", seq: 3, ecosystem: "腾讯" }),
  ]);

  assert.equal(filterByEcosystem(rows, "腾讯").length, 2);
  assert.equal(filterByEcosystem(rows, "开源社区").length, 1);
  assert.equal(filterByEcosystem(rows, "").length, 3);
  assert.equal(filterByEcosystem(rows, "字节").length, 0);
});

test("按生态统计条数，多的排前面", () => {
  const rows = toCollectionRecordRows([
    collectionRecord({ id: "c1", title: "一", seq: 1, ecosystem: "腾讯" }),
    collectionRecord({ id: "c2", title: "二", seq: 2, ecosystem: "开源社区" }),
    collectionRecord({ id: "c3", title: "三", seq: 3, ecosystem: "腾讯" }),
  ]);

  assert.deepEqual(summarizeEcosystems(rows), [
    { ecosystem: "腾讯", count: 2 },
    { ecosystem: "开源社区", count: 1 },
  ]);
});

test("落点写资产标题或 ID 时能认出库内资产，认不出的不硬猜", () => {
  const assets = [
    ruleAsset("rule-evidence-scope", "active"),
    documentAsset("document-team-method-okr-md", "OKR：目标与关键结果"),
    ruleAsset("rule-pg", "candidate"),
  ];

  assert.deepEqual(resolveLandingAssets("rule-evidence-scope 等 3 条", assets), [
    "rule-evidence-scope",
  ]);
  assert.deepEqual(
    resolveLandingAssets("OKR：目标与关键结果", assets),
    ["document-team-method-okr-md"],
  );
  assert.deepEqual(resolveLandingAssets("templates/new-project/AGENTS.md", assets), []);
  assert.deepEqual(resolveLandingAssets("", assets), []);
});

// —— M2.1 T13：采集任务单话术 ——

test("采集任务单话术：来源与四段齐全，关注点和生态只在填了时出现", () => {
  const text = buildCollectionTaskPrompt({
    sourceUrl: "https://github.com/anthropics/skills",
  });

  assert.match(text, /请阅读这个 Skills \/ MCP 仓库：https:\/\/github\.com\/anthropics\/skills/);
  assert.match(text, /提炼要求：/);
  assert.match(text, /去重口径：/);
  assert.match(text, /合规硬约束：/);
  assert.match(text, /回填格式（重要，照做）：/);
  // 没填关注点时不冒出「重点关注」
  assert.doesNotMatch(text, /重点关注/);
  // 没选生态时不冒出「（生态：」
  assert.doesNotMatch(text, /（生态：/);
  // 产出物格式契约：md/zip、每文件一条、禁 frontmatter、禁元信息
  assert.match(text, /一个或多个 \.md 文件/);
  assert.match(text, /打包成一个 \.zip/);
  assert.match(text, /不要写 YAML frontmatter/);
  assert.match(text, /不要在文件里写"去重说明"/);
  // 硬约束：只出候选，等人工确认
  assert.match(text, /等我人工确认/);
  // 交回时必须说清落点与下一步（台账如何更新要反馈给用户）
  assert.match(text, /必须在回复里说清两件事/);
  assert.match(text, /采集台账 → 给压缩包/);
});

test("采集任务单话术：填了关注点与生态就带上", () => {
  const text = buildCollectionTaskPrompt({
    sourceUrl: "obra/superpowers",
    ecosystem: "开源社区",
    focus: "只提炼工程纪律类规则，不要安装任何东西",
  });

  assert.match(text, /重点关注：只提炼工程纪律类规则，不要安装任何东西/);
  assert.match(text, /（生态：开源社区）/);
});
