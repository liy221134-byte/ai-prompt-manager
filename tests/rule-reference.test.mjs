import assert from "node:assert/strict";
import test from "node:test";

import {
  listProjectOnlyRules,
  listProjectReferencedPacks,
  listProjectRulesForUse,
} from "../src/lib/rule-reference.ts";

const now = "2026-09-24T00:00:00.000Z";

function createRule(
  id,
  { projectId = "project-a", pack = null, detachedFrom = null, ...rest } = {},
) {
  return {
    id,
    projectId,
    assetType: "rule",
    title: rest.title ?? `规则 ${id}`,
    summary: "",
    content: "规则正文",
    metadata: {
      ruleType: "recommended",
      scope: "project",
      ...(pack ? { pack } : {}),
      ...(detachedFrom ? { detachedFrom } : {}),
    },
    source: {
      sourceType: "import",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: `current-${id}`,
    status: rest.status ?? "active",
    archivedAt: null,
    deletedAt: rest.deletedAt ?? null,
    deletedReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

function createPack(
  id,
  {
    projectId = "project-a",
    title = "工程方法种子资产包",
    excludedItemIds = [],
    // 引用记录用 packId 指向公共库那份包；不传时就是自己的标识
    packId = id,
    referencedAssetIds = [],
  } = {},
) {
  return {
    id,
    projectId,
    assetType: "rule_pack",
    title,
    summary: "",
    content: "",
    metadata: {
      packVersion: "0.4.0",
      packConfidence: "provisional",
      projectScale: ["personal"],
      sourceNote: "",
      ...(packId ? { packId } : {}),
      ...(referencedAssetIds.length > 0 ? { referencedAssetIds } : {}),
      ...(excludedItemIds.length > 0 ? { excludedItemIds } : {}),
    },
    source: {
      sourceType: "import",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: `current-${id}`,
    status: "active",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

const packLink = (packItemId, packId = "rule-pack-a") => ({
  packId,
  packItemId,
  packVersion: "0.4.0",
  packAssetType: "method",
  projectScale: ["personal"],
});

test("项目没装包时，只列出项目自己的规则", () => {
  const assets = [
    createRule("rule-own", { title: "项目自己的规则" }),
    createRule("rule-public", { projectId: "default-project" }),
  ];
  const entries = listProjectRulesForUse(assets, {
    projectId: "project-a",
    publicProjectId: "default-project",
  });

  assert.deepEqual(
    entries.map((entry) => [entry.rule.id, entry.fromPublic]),
    [["rule-own", false]],
  );
});

test("项目引用了包：公共库里的成员跟着进来，并标出包名", () => {
  const assets = [
    createPack("rule-pack-a", { projectId: "project-a" }),
    createRule("rule-own", { title: "项目自己的规则" }),
    createRule("rule-m1", {
      projectId: "default-project",
      pack: packLink("MTH-001"),
    }),
    createRule("rule-m2", {
      projectId: "default-project",
      pack: packLink("MTH-002"),
    }),
    // 别的包的成员不进来
    createRule("rule-other", {
      projectId: "default-project",
      pack: packLink("OTH-001", "rule-pack-b"),
    }),
  ];
  const entries = listProjectRulesForUse(assets, {
    projectId: "project-a",
    publicProjectId: "default-project",
  });

  assert.deepEqual(
    entries.map((entry) => [entry.rule.id, entry.fromPublic, entry.packTitle]),
    [
      ["rule-own", false, ""],
      ["rule-m1", true, "工程方法种子资产包"],
      ["rule-m2", true, "工程方法种子资产包"],
    ],
  );
});

test("项目里那份老副本与公共库正本重复时，只显示公共库那份", () => {
  const assets = [
    createPack("rule-pack-a", { projectId: "project-a" }),
    // 老数据：装包时复制进来的副本（包内编号与公共库正本相同）
    createRule("rule-copy", { pack: packLink("MTH-001") }),
    // 项目自己改过、脱钩的规则（没有包来源）照常显示
    createRule("rule-custom", { title: "项目改过的规则" }),
    createRule("rule-m1", {
      projectId: "default-project",
      pack: packLink("MTH-001"),
    }),
  ];
  const entries = listProjectRulesForUse(assets, {
    projectId: "project-a",
    publicProjectId: "default-project",
  });

  assert.deepEqual(
    entries.map((entry) => [entry.rule.id, entry.fromPublic]),
    [
      ["rule-custom", false],
      ["rule-m1", true],
    ],
  );
});

test("公共库里没有这份包的成员时，项目自己那份留着", () => {
  const assets = [
    createPack("rule-pack-a", { projectId: "project-a" }),
    createRule("rule-copy", { pack: packLink("MTH-001") }),
  ];
  const entries = listProjectRulesForUse(assets, {
    projectId: "project-a",
    publicProjectId: "default-project",
  });

  assert.deepEqual(
    entries.map((entry) => [entry.rule.id, entry.fromPublic]),
    [["rule-copy", false]],
  );
});

test("归档的包不算引用，项目专属规则也不含包成员", () => {
  const archivedPack = createPack("rule-pack-a", { projectId: "project-a" });
  const assets = [
    { ...archivedPack, status: "archived" },
    createRule("rule-own"),
    createRule("rule-copy", { pack: packLink("MTH-001") }),
  ];

  assert.deepEqual(listProjectReferencedPacks(assets, "project-a"), []);
  assert.deepEqual(
    listProjectOnlyRules(assets, "project-a").map((rule) => rule.id),
    ["rule-own"],
  );
});

test("引用记录里的排除清单：被排除的规则不进项目列表", () => {
  const assets = [
    createPack("rule-pack-a", { excludedItemIds: ["MTH-002"] }),
    createRule("rule-m1", {
      projectId: "default-project",
      pack: packLink("MTH-001"),
    }),
    createRule("rule-m2", {
      projectId: "default-project",
      pack: packLink("MTH-002"),
    }),
  ];
  const entries = listProjectRulesForUse(assets, {
    projectId: "project-a",
    publicProjectId: "default-project",
  });

  assert.deepEqual(
    entries.map((entry) => entry.rule.id),
    ["rule-m1"],
  );
});

test("排除清单只作用于本项目的引用记录，别的项目不受影响", () => {
  const assets = [
    createPack("rule-pack-a", {
      projectId: "project-a",
      excludedItemIds: ["MTH-001"],
    }),
    // 同一个包，另一个项目的引用记录：没有排除清单
    createPack("rule-pack-a-ref-project-b", {
      projectId: "project-b",
      packId: "rule-pack-a",
    }),
    createRule("rule-m1", {
      projectId: "default-project",
      pack: packLink("MTH-001"),
    }),
  ];

  assert.deepEqual(
    listProjectRulesForUse(assets, {
      projectId: "project-a",
      publicProjectId: "default-project",
    }).map((entry) => entry.rule.id),
    [],
  );
  assert.deepEqual(
    listProjectRulesForUse(assets, {
      projectId: "project-b",
      publicProjectId: "default-project",
    }).map((entry) => entry.rule.id),
    ["rule-m1"],
  );
});

test("脱钩副本顶掉公共库同一个包内编号的正本", () => {
  const assets = [
    createPack("rule-pack-a"),
    createRule("rule-detached", {
      pack: packLink("MTH-001"),
      detachedFrom: { packId: "rule-pack-a", packItemId: "MTH-001" },
    }),
    createRule("rule-m1", {
      projectId: "default-project",
      pack: packLink("MTH-001"),
    }),
  ];
  const entries = listProjectRulesForUse(assets, {
    projectId: "project-a",
    publicProjectId: "default-project",
  });

  assert.deepEqual(
    entries.map((entry) => [entry.rule.id, entry.fromPublic]),
    [["rule-detached", false]],
  );
});

test("脱钩副本算项目专属规则，进沉淀体检的口径", () => {
  const assets = [
    createPack("rule-pack-a"),
    createRule("rule-detached", {
      pack: packLink("MTH-001"),
      detachedFrom: { packId: "rule-pack-a", packItemId: "MTH-001" },
    }),
    createRule("rule-own"),
    // 没脱钩的老副本仍然不算项目专属
    createRule("rule-copy", { pack: packLink("MTH-002") }),
  ];

  assert.deepEqual(
    listProjectOnlyRules(assets, "project-a").map((rule) => rule.id),
    ["rule-detached", "rule-own"],
  );
});

test("引用记录点名的公共规则出现在项目列表里，角标不带包名", () => {
  const assets = [
    createPack("rule-pack-public-library-ref-project-a", {
      projectId: "project-a",
      title: "公共资产库挑入",
      packId: "",
      referencedAssetIds: ["rule-picked-1", "rule-picked-2"],
    }),
    createRule("rule-picked-1", { projectId: "default-project" }),
    createRule("rule-picked-2", { projectId: "default-project" }),
    // 没被点名的公共规则不进来
    createRule("rule-not-picked", { projectId: "default-project" }),
  ];
  const entries = listProjectRulesForUse(assets, {
    projectId: "project-a",
    publicProjectId: "default-project",
  });

  assert.deepEqual(
    entries.map((entry) => [entry.rule.id, entry.fromPublic, entry.packTitle]),
    [
      ["rule-picked-1", true, ""],
      ["rule-picked-2", true, ""],
    ],
  );
});

test("同一条既在包成员里又被点名时只出现一次", () => {
  const assets = [
    createPack("rule-pack-a"),
    createPack("rule-pack-public-library-ref-project-a", {
      projectId: "project-a",
      title: "公共资产库挑入",
      packId: "",
      referencedAssetIds: ["rule-m1"],
    }),
    createRule("rule-m1", {
      projectId: "default-project",
      pack: packLink("MTH-001"),
    }),
  ];
  const entries = listProjectRulesForUse(assets, {
    projectId: "project-a",
    publicProjectId: "default-project",
  });

  assert.deepEqual(
    entries.map((entry) => [entry.rule.id, entry.packTitle]),
    [["rule-m1", "工程方法种子资产包"]],
  );
});

test("点名引用的规则脱钩之后，让位给项目里那份副本", () => {
  const assets = [
    createPack("rule-pack-public-library-ref-project-a", {
      projectId: "project-a",
      title: "公共资产库挑入",
      packId: "",
      referencedAssetIds: ["rule-picked-1"],
    }),
    createRule("rule-picked-1", { projectId: "default-project" }),
    createRule("rule-detached", {
      detachedFrom: { sourceAssetId: "rule-picked-1" },
    }),
  ];
  const entries = listProjectRulesForUse(assets, {
    projectId: "project-a",
    publicProjectId: "default-project",
  });

  assert.deepEqual(
    entries.map((entry) => [entry.rule.id, entry.fromPublic]),
    [["rule-detached", false]],
  );
});
