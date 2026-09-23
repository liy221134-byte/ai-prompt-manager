import assert from "node:assert/strict";
import test from "node:test";

import { isAssetData } from "../src/data/assets.ts";
import {
  createRulePackFileFromAssets,
  listPackMembers,
  listPackMembersForInstall,
  listProjectPacks,
  planRulePackImport,
  planRulePackInstall,
  readAssetPackLink,
} from "../src/lib/rule-pack.ts";
import {
  parseRulePackFile,
  seedPackFilesToRulePack,
} from "../src/lib/seed-pack-import.ts";

const packId = "rule-pack-sample";
const now = "2026-09-23T06:00:00.000Z";

function createSamplePack() {
  return seedPackFilesToRulePack(
    [
      {
        path: "README.md",
        content: "# 样本规则包\n\n## 用途\n\n用来验证安装和导出。\n",
      },
      {
        path: "manifest.md",
        content: "| 字段 | 内容 |\n| --- | --- |\n| 版本 | `0.3.0` |\n",
      },
      {
        path: "assets/001-must-check.md",
        content: [
          "---",
          "id: SAMPLE-001",
          "title: 提交前必须跑检查",
          "asset_type: rule",
          "rule_type: must",
          "purpose: development",
          "priority: p0",
          "scope: project",
          "confidence: provisional",
          "related_assets:",
          "  - SAMPLE-002",
          "---",
          "",
          "# 提交前必须跑检查",
          "",
          "## 核心结论",
          "",
          "提交前必须跑完整检查。",
        ].join("\n"),
      },
      {
        path: "assets/002-guide.md",
        content: [
          "---",
          "id: SAMPLE-002",
          "title: 小改动的处理建议",
          "asset_type: method",
          "purpose: development",
          "priority: p2",
          "scope: project",
          "confidence: hypothesis",
          "---",
          "",
          "# 小改动的处理建议",
          "",
          "## 核心结论",
          "",
          "只改文案时可以只跑快速检查。",
        ].join("\n"),
      },
    ],
    { packId, exportedAt: now, fallbackTitle: "样本规则包" },
  );
}

function createPackAsset(parsed) {
  return {
    id: parsed.pack.id,
    projectId: "project-a",
    assetType: "rule_pack",
    title: parsed.pack.title,
    summary: parsed.pack.summary,
    content: parsed.pack.content,
    metadata: parsed.pack.metadata,
    source: {
      sourceType: "import",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: `current-${parsed.pack.id}`,
    status: parsed.pack.status,
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

test("安装计划把成员复制到目标项目并接上包链接", () => {
  const parsed = createSamplePack();
  const pack = createPackAsset(parsed);
  const plan = planRulePackInstall({
    pack,
    members: parsed.members,
    existingAssets: [pack],
    targetProjectId: "project-a",
    now,
  });

  assert.equal(plan.skipped.length, 0);
  assert.equal(plan.assetsToCreate.length, 2);
  assert.deepEqual(
    plan.assetsToCreate.map((asset) => asset.id),
    ["rule-sample-001", "rule-sample-002"],
  );

  const [first, second] = plan.assetsToCreate;
  assert.equal(isAssetData(first), true);
  assert.equal(first.projectId, "project-a");
  assert.equal(first.status, "active");
  assert.equal(first.source.sourceAssetId, pack.id);
  assert.equal(first.currentVersionId, "current-rule-sample-001");

  const link = readAssetPackLink(first.metadata);
  assert.equal(link.packId, pack.id);
  assert.equal(link.packItemId, "SAMPLE-001");
  assert.deepEqual(first.metadata.relations, [
    {
      targetAssetId: "rule-sample-002",
      relationType: "reference",
      note: "包内关联",
    },
  ]);

  assert.equal(readAssetPackLink(second.metadata).packItemId, "SAMPLE-002");
});

test("同一个包重复装进同一个项目只跳过不重复建", () => {
  const parsed = createSamplePack();
  const pack = createPackAsset(parsed);
  const first = planRulePackInstall({
    pack,
    members: parsed.members,
    existingAssets: [pack],
    targetProjectId: "project-a",
    now,
  });
  const second = planRulePackInstall({
    pack,
    members: parsed.members,
    existingAssets: [pack, ...first.assetsToCreate],
    targetProjectId: "project-a",
    now,
  });

  assert.equal(second.assetsToCreate.length, 0);
  assert.deepEqual(
    second.skipped.map((item) => item.packItemId),
    ["SAMPLE-001", "SAMPLE-002"],
  );
});

test("同一个包装进第二个项目时标识加序号，关系跟着重映射", () => {
  const parsed = createSamplePack();
  const pack = createPackAsset(parsed);
  const first = planRulePackInstall({
    pack,
    members: parsed.members,
    existingAssets: [pack],
    targetProjectId: "project-a",
    now,
  });
  const second = planRulePackInstall({
    pack,
    members: parsed.members,
    existingAssets: [pack, ...first.assetsToCreate],
    targetProjectId: "project-b",
    now,
  });

  assert.equal(second.skipped.length, 0);
  assert.deepEqual(
    second.assetsToCreate.map((asset) => asset.id),
    ["rule-sample-001-2", "rule-sample-002-2"],
  );
  assert.equal(second.assetsToCreate[0].projectId, "project-b");
  assert.deepEqual(second.assetsToCreate[0].metadata.relations, [
    {
      targetAssetId: "rule-sample-002-2",
      relationType: "reference",
      note: "包内关联",
    },
  ]);
});

test("没有包链接的成员会被跳过并报出来", () => {
  const parsed = createSamplePack();
  const pack = createPackAsset(parsed);
  const orphan = {
    id: "rule-orphan",
    assetType: "rule",
    title: "没有包链接的规则",
    summary: "",
    content: "内容",
    metadata: { ruleType: "must", scope: "project" },
    status: "active",
  };
  const plan = planRulePackInstall({
    pack,
    members: [...parsed.members, orphan],
    existingAssets: [pack],
    targetProjectId: "project-a",
    now,
  });

  assert.equal(plan.assetsToCreate.length, 2);
  assert.deepEqual(plan.skipped, [
    { packItemId: "rule-orphan", title: "没有包链接的规则" },
  ]);
});

test("按项目统计装过的包，成员清单排除垃圾箱", () => {
  const parsed = createSamplePack();
  const pack = createPackAsset(parsed);
  const plan = planRulePackInstall({
    pack,
    members: parsed.members,
    existingAssets: [pack],
    targetProjectId: "project-a",
    now,
  });
  const trashed = {
    ...plan.assetsToCreate[1],
    deletedAt: now,
    deletedReason: "manual",
  };
  const assets = [pack, plan.assetsToCreate[0], trashed];

  const options = listProjectPacks(assets, "project-a");
  assert.equal(options.length, 1);
  assert.equal(options[0].packId, pack.id);
  assert.equal(options[0].title, "样本规则包");
  assert.equal(options[0].memberCount, 1);
  assert.deepEqual(listProjectPacks(assets, "project-b"), []);
  assert.equal(listPackMembers(assets, pack.id).length, 1);
});

test("导出的包文件能再读回来，重复成员只导一次", () => {
  const parsed = createSamplePack();
  const pack = createPackAsset(parsed);
  const first = planRulePackInstall({
    pack,
    members: parsed.members,
    existingAssets: [pack],
    targetProjectId: "project-a",
    now,
  });
  const second = planRulePackInstall({
    pack,
    members: parsed.members,
    existingAssets: [pack, ...first.assetsToCreate],
    targetProjectId: "project-b",
    now,
  });
  const file = createRulePackFileFromAssets({
    pack,
    members: [...first.assetsToCreate, ...second.assetsToCreate],
    exportedAt: now,
  });

  assert.equal(file.members.length, 2);
  assert.deepEqual(
    file.members.map((member) => member.metadata.pack.packItemId),
    ["SAMPLE-001", "SAMPLE-002"],
  );
  assert.equal(file.pack.metadata.packVersion, "0.3.0");

  const roundTrip = parseRulePackFile(JSON.stringify(file));
  assert.deepEqual(roundTrip, file);

  // 导出的文件再装进一个新库，成员完整重建
  const plan = planRulePackInstall({
    pack,
    members: roundTrip.members,
    existingAssets: [],
    targetProjectId: "project-c",
    now,
  });
  assert.equal(plan.assetsToCreate.length, 2);
});

test("装到第三个项目时按包内编号去重，跳过数不重复计算", () => {
  const parsed = createSamplePack();
  const pack = createPackAsset(parsed);
  const first = planRulePackInstall({
    pack,
    members: parsed.members,
    existingAssets: [pack],
    targetProjectId: "project-a",
    now,
  });
  const second = planRulePackInstall({
    pack,
    members: parsed.members,
    existingAssets: [pack, ...first.assetsToCreate],
    targetProjectId: "project-b",
    now,
  });
  const installed = [pack, ...first.assetsToCreate, ...second.assetsToCreate];
  const installMembers = listPackMembersForInstall(installed, pack.id, "project-a");

  // 两个项目里各有一份，安装用成员只留一份，且优先包所在项目的那本
  assert.equal(listPackMembers(installed, pack.id).length, 4);
  assert.equal(installMembers.length, 2);
  assert.equal(installMembers.every((asset) => asset.projectId === "project-a"), true);

  const again = planRulePackInstall({
    pack,
    members: installMembers.map((asset) => ({
      id: asset.id,
      assetType: asset.assetType,
      title: asset.title,
      summary: asset.summary,
      content: asset.content,
      metadata: asset.metadata,
      status: asset.status,
    })),
    existingAssets: installed,
    targetProjectId: "project-b",
    now,
  });

  assert.equal(again.assetsToCreate.length, 0);
  assert.equal(again.skipped.length, 2);
});

test("导入包文件：空库里先建包资产，再把成员装进目标项目", () => {
  const parsed = createSamplePack();
  const file = parseRulePackFile(
    JSON.stringify(
      createRulePackFileFromAssets({
        pack: createPackAsset(parsed),
        members: [],
        exportedAt: now,
      }),
    ),
  );
  // 用解析出来的成员装，等价于从文件读到的内容
  const importFile = { ...file, members: parsed.members };
  const plan = planRulePackImport({
    file: importFile,
    existingAssets: [],
    targetProjectId: "project-a",
    now,
  });

  assert.equal(plan.packAsset?.id, packId);
  assert.equal(plan.packAsset?.assetType, "rule_pack");
  assert.equal(plan.packAsset?.projectId, "project-a");
  assert.equal(isAssetData(plan.packAsset), true);
  assert.equal(plan.assetsToCreate.length, 2);
  assert.equal(plan.skipped.length, 0);
  assert.equal(plan.assetsToCreate[0].projectId, "project-a");
});

test("导入包文件：库里已经有这个包就不再建包资产，成员装到别的项目", () => {
  const parsed = createSamplePack();
  const pack = createPackAsset(parsed);
  const file = { ...createRulePackFileFromAssets({
    pack,
    members: [],
    exportedAt: now,
  }), members: parsed.members };
  const first = planRulePackImport({
    file,
    existingAssets: [pack],
    targetProjectId: "project-a",
    now,
  });
  const second = planRulePackImport({
    file,
    existingAssets: [pack, ...first.assetsToCreate],
    targetProjectId: "project-b",
    now,
  });
  const again = planRulePackImport({
    file,
    existingAssets: [pack, ...first.assetsToCreate, ...second.assetsToCreate],
    targetProjectId: "project-b",
    now,
  });

  assert.equal(first.packAsset, null);
  assert.equal(second.packAsset, null);
  assert.equal(second.assetsToCreate.length, 2);
  assert.deepEqual(
    second.assetsToCreate.map((asset) => asset.id),
    ["rule-sample-001-2", "rule-sample-002-2"],
  );
  assert.equal(again.assetsToCreate.length, 0);
  assert.equal(again.skipped.length, 2);
});
