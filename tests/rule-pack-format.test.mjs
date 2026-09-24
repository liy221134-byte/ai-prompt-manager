import assert from "node:assert/strict";
import test from "node:test";

import {
  createRulePackFileFromSelection,
  createSampleRulePackFile,
  planRulePackImport,
  readAssetPackLink,
} from "../src/lib/rule-pack.ts";
import { parseRulePackFile } from "../src/lib/seed-pack-import.ts";

test("示例规则包能通过同一套校验，并且成员带包内编号", () => {
  const sample = createSampleRulePackFile("2026-09-24T00:00:00.000Z");
  const parsed = parseRulePackFile(JSON.stringify(sample));

  assert.equal(parsed.type, "ai-prompt-manager-rule-pack");
  assert.equal(parsed.version, 1);
  assert.equal(parsed.pack.title, "示例规则包");
  assert.equal(parsed.members.length, 1);

  const link = readAssetPackLink(parsed.members[0].metadata);

  assert.ok(link, "示例成员缺少包内编号，装进项目时会被跳过");
  assert.equal(link.packId, parsed.pack.id);
  assert.equal(link.packItemId, "RULE-SAMPLE-001");
});

test("导入数据备份文件时提示走导入备份，而不是只说不是规则包", () => {
  const backup = JSON.stringify({
    type: "ai-prompt-manager-backup",
    version: 2,
    exportedAt: "2026-09-24T00:00:00.000Z",
    projects: [],
    assets: [],
  });

  assert.throws(
    () => parseRulePackFile(backup),
    /这是数据备份文件，不是规则包。要恢复数据请用「数据管理 → 导入备份」。/,
  );
});

test("其它 JSON 文件提示缺少规则包类型标记", () => {
  assert.throws(
    () => parseRulePackFile(JSON.stringify({ hello: "world" })),
    /type 应为 ai-prompt-manager-rule-pack/,
  );
});

test("打包选中的资产：编号按勾选顺序补，已有包内编号的沿用", () => {
  const file = createRulePackFileFromSelection({
    packId: "rule-pack-mine",
    title: "我的规则包",
    summary: "打包测试",
    assets: [
      {
        id: "rule-a",
        assetType: "rule",
        title: "规则甲",
        summary: "",
        content: "甲",
        metadata: {},
        status: "active",
      },
      {
        id: "doc-b",
        assetType: "document",
        title: "文档乙",
        summary: "",
        content: "乙",
        metadata: {
          pack: {
            packId: "rule-pack-old",
            packItemId: "OLD-007",
            packVersion: "0.1.0",
            packAssetType: "document",
          },
        },
        status: "active",
      },
    ],
    now: "2026-09-24T00:00:00.000Z",
  });

  const parsed = parseRulePackFile(JSON.stringify(file));
  const links = parsed.members.map((member) =>
    readAssetPackLink(member.metadata),
  );

  assert.equal(parsed.members.length, 2);
  assert.deepEqual(
    links.map((link) => link?.packId),
    ["rule-pack-mine", "rule-pack-mine"],
  );
  assert.deepEqual(
    links.map((link) => link?.packItemId),
    ["PACK-001", "OLD-007"],
  );
});

test("成员字段不对时当场报是哪一条、哪个字段，而不是写进库再读不出来", () => {
  const sample = createSampleRulePackFile("2026-09-24T00:00:00.000Z");
  const broken = {
    ...sample,
    members: sample.members.map((member) => ({
      ...member,
      metadata: { ...member.metadata, stage: "build" },
    })),
  };

  assert.throws(
    () =>
      planRulePackImport({
        file: broken,
        existingAssets: [],
        targetProjectId: "project-1",
        now: "2026-09-24T00:00:00.000Z",
      }),
    /不能装：执行阶段（stage）取值不认识：build/,
  );
});

test("示例规则包能通过装载前的资产结构校验", () => {
  const plan = planRulePackImport({
    file: createSampleRulePackFile("2026-09-24T00:00:00.000Z"),
    existingAssets: [],
    targetProjectId: "project-1",
    now: "2026-09-24T00:00:00.000Z",
  });

  assert.equal(plan.assetsToCreate.length, 1);
  assert.equal(plan.packAsset?.title, "示例规则包");
});
