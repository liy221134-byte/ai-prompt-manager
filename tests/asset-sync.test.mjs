import assert from "node:assert/strict";
import test from "node:test";

import { isSameAssetContent, planAssetSync } from "../src/lib/asset-sync.ts";

const now = "2026-09-24T12:00:00.000Z";

function createAsset(id, overrides = {}) {
  const { metadata, ...rest } = overrides;

  return {
    id,
    projectId: "project-a",
    assetType: "document",
    title: `文档 ${id}`,
    summary: "",
    content: "正文",
    metadata: { documentType: "参考资料", ...metadata },
    source: {
      sourceType: "manual",
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
    ...rest,
  };
}

function createProject(id) {
  return {
    id,
    name: `项目 ${id}`,
    description: "",
    status: "active",
    stage: "development",
    riskLevel: "personal",
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
}

test("只在一边的资产：本机多的推到云端，云端多的拉到本机", () => {
  const plan = planAssetSync({
    localProjects: [createProject("project-a")],
    cloudProjects: [createProject("project-a")],
    localAssets: [createAsset("only-local"), createAsset("both")],
    cloudAssets: [createAsset("only-cloud"), createAsset("both")],
  });

  assert.deepEqual(plan.assetsToPush.map((a) => a.id), ["only-local"]);
  assert.deepEqual(
    plan.assetsToPull.map((a) => a.id).sort(),
    ["only-cloud"],
  );
  assert.deepEqual(plan.conflicts, []);
  assert.equal(plan.unchanged, 1);
});

test("两边都有且内容一样：不动，也不进冲突", () => {
  assert.equal(isSameAssetContent(createAsset("a"), createAsset("a")), true);
  assert.equal(
    isSameAssetContent(createAsset("a"), createAsset("a", { content: "改过" })),
    false,
  );
  // 云端是 jsonb，键的顺序和本机可能不同；顺序不同不算内容不同
  assert.equal(
    isSameAssetContent(
      createAsset("a", { metadata: { documentType: "参考资料", module: "" } }),
      createAsset("a", { metadata: { module: "", documentType: "参考资料" } }),
    ),
    true,
  );
});

test("谁新谁赢：本机新就推，云端新就拉", () => {
  const plan = planAssetSync({
    localProjects: [],
    cloudProjects: [],
    localAssets: [
      createAsset("local-newer", { content: "本机改的", updatedAt: "2026-09-24T13:00:00.000Z" }),
      createAsset("cloud-newer", { content: "本机的旧内容", updatedAt: "2026-09-24T11:00:00.000Z" }),
    ],
    cloudAssets: [
      createAsset("local-newer", { content: "云端的旧内容", updatedAt: "2026-09-24T10:00:00.000Z" }),
      createAsset("cloud-newer", { content: "云端改的", updatedAt: "2026-09-24T14:00:00.000Z" }),
    ],
  });

  assert.deepEqual(plan.assetsToPush.map((a) => a.id), ["local-newer"]);
  assert.deepEqual(plan.assetsToPull.map((a) => a.id), ["cloud-newer"]);
});

test("时间一样但内容不同：两边都留，列进待裁决", () => {
  const plan = planAssetSync({
    localProjects: [],
    cloudProjects: [],
    localAssets: [createAsset("conflict", { content: "本机版本" })],
    cloudAssets: [createAsset("conflict", { content: "云端版本" })],
  });

  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.conflicts[0].local.content, "本机版本");
  assert.equal(plan.conflicts[0].cloud.content, "云端版本");
  assert.deepEqual(plan.assetsToPush, []);
  assert.deepEqual(plan.assetsToPull, []);
});

test("方向限定：只拉时不推，只推时不拉", () => {
  const pullOnly = planAssetSync({
    localProjects: [],
    cloudProjects: [],
    localAssets: [createAsset("only-local")],
    cloudAssets: [createAsset("only-cloud")],
    direction: "pull",
  });

  assert.deepEqual(pullOnly.assetsToPush, []);
  assert.deepEqual(pullOnly.assetsToPull.map((a) => a.id), ["only-cloud"]);

  const pushOnly = planAssetSync({
    localProjects: [],
    cloudProjects: [],
    localAssets: [createAsset("only-local")],
    cloudAssets: [createAsset("only-cloud")],
    direction: "push",
  });

  assert.deepEqual(pushOnly.assetsToPush.map((a) => a.id), ["only-local"]);
  assert.deepEqual(pushOnly.assetsToPull, []);
});

test("项目也按 id 补：缺的项目建到另一边", () => {
  const plan = planAssetSync({
    localProjects: [createProject("project-a"), createProject("project-local")],
    cloudProjects: [createProject("project-a"), createProject("project-cloud")],
    localAssets: [],
    cloudAssets: [],
  });

  assert.deepEqual(
    plan.projectsToCreateRemotely.map((p) => p.id),
    ["project-local"],
  );
  assert.deepEqual(
    plan.projectsToCreateLocally.map((p) => p.id),
    ["project-cloud"],
  );
});
