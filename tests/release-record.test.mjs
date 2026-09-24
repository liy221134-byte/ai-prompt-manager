import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGateItemsFromLevel,
  findLatestProjectRelease,
  listProjectReleases,
  summarizeGates,
} from "../src/lib/release-record.ts";

const now = "2026-09-23T12:00:00.000Z";

// 发布记录是「文档类型 = 发布记录」的项目文档，版本和门禁在元数据里
function createRelease(overrides = {}) {
  const { metadata, ...rest } = overrides;

  return {
    id: "release-1",
    projectId: "project-a",
    assetType: "document",
    title: "v2.10.0 发布记录",
    summary: "",
    content: "这次改了……",
    metadata: {
      documentType: "发布记录",
      release: {
        version: "v2.10.0",
        releasedAt: "2026-09-23",
        result: "released",
        rollbackTarget: "v2.9.0",
        gates: [],
      },
      ...metadata,
    },
    source: {
      sourceType: "manual",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: "current-release-1",
    status: "active",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: now,
    updatedAt: now,
    ...rest,
  };
}

function releaseMetadata(overrides = {}) {
  return {
    release: {
      version: "v2.10.0",
      releasedAt: "2026-09-23",
      result: "released",
      rollbackTarget: "v2.9.0",
      gates: [],
      ...overrides,
    },
  };
}

test("门禁清单按等级预填：等级越高默认项越多，默认都不勾", () => {
  const personal = buildGateItemsFromLevel("personal");
  const userData = buildGateItemsFromLevel("user_data");

  assert.equal(personal.length, 2);
  assert.ok(userData.length > personal.length);
  assert.ok(personal.every((gate) => gate.done === false && gate.note === ""));
  assert.ok(personal.every((gate) => gate.label.trim().length > 0));
  assert.equal(new Set(personal.map((gate) => gate.key)).size, personal.length);

  // 等级不认识时按最低档处理
  assert.deepEqual(
    buildGateItemsFromLevel("乱写的等级"),
    buildGateItemsFromLevel("personal"),
  );
});

test("门禁完成情况：算完成几项、还剩哪几项", () => {
  const summary = summarizeGates([
    { key: "gate-1", label: "工程检查通过", done: true, note: "跑了 check" },
    { key: "gate-2", label: "备份已生成", done: false, note: "" },
    { key: "gate-3", label: "回滚目标已确定", done: false, note: "" },
  ]);

  assert.equal(summary.total, 3);
  assert.equal(summary.done, 1);
  assert.deepEqual(summary.pending, ["备份已生成", "回滚目标已确定"]);
  assert.deepEqual(summarizeGates([]), { total: 0, done: 0, pending: [] });
});

test("只有活跃、没进垃圾箱、同项目的发布记录参与比较", () => {
  const assets = [
    createRelease(),
    createRelease({ id: "release-draft", status: "draft" }),
    createRelease({ id: "release-trashed", deletedAt: now }),
    createRelease({ id: "release-other", projectId: "project-b" }),
    // 别的文档类型不算发布记录
    createRelease({
      id: "document-other",
      metadata: { documentType: "发布手册" },
    }),
  ];

  assert.deepEqual(
    listProjectReleases(assets, "project-a").map((record) => record.assetId),
    ["release-1"],
  );
});

test("最近一次发布按发布日期算，没写日期时用更新时间兜底", () => {
  const assets = [
    createRelease({
      id: "release-old",
      metadata: releaseMetadata({ releasedAt: "2026-09-20" }),
    }),
    createRelease({
      id: "release-new",
      metadata: releaseMetadata({ releasedAt: "2026-09-23" }),
    }),
    createRelease({
      id: "release-undated",
      metadata: releaseMetadata({ releasedAt: "" }),
      updatedAt: "2026-09-22T00:00:00.000Z",
    }),
  ];

  assert.equal(
    findLatestProjectRelease(assets, "project-a").assetId,
    "release-new",
  );
  assert.equal(findLatestProjectRelease([], "project-a"), null);
  assert.equal(
    findLatestProjectRelease(
      [
        createRelease({
          id: "only-dated",
          metadata: releaseMetadata({ releasedAt: "" }),
        }),
      ],
      "project-a",
    ).assetId,
    "only-dated",
  );
});
