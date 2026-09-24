import assert from "node:assert/strict";
import test from "node:test";

import { createInitialAssetVersionId } from "../src/data/assets.ts";
import { assetToDraft, buildUpdateAssetInput } from "../src/lib/asset-draft.ts";
import {
  planDetachToProject,
  readDetachedFrom,
} from "../src/lib/rule-reference.ts";

const now = "2026-09-25T00:00:00.000Z";

const packLink = (packItemId, packId = "rule-pack-a") => ({
  packId,
  packItemId,
  packVersion: "0.4.0",
  packAssetType: "rule",
  projectScale: ["personal"],
});

function createPublicRule({ pack = packLink("MTH-001") } = {}) {
  return {
    id: "rule-public-1",
    projectId: "default-project",
    assetType: "rule",
    title: "提交前必须跑检查",
    summary: "摘要",
    content: "公共库那份的正文",
    metadata: {
      ruleType: "must",
      scope: "project",
      relations: [],
      ...(pack ? { pack } : {}),
    },
    source: {
      sourceType: "import",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: "current-rule-public-1",
    status: "active",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

test("另存为项目规则：正文原样复制，带上脱钩标记，落在目标项目里", () => {
  const plan = planDetachToProject({
    rule: createPublicRule(),
    projectId: "project-a",
    createId: () => "rule-detached-1",
    now,
  });

  assert.equal(plan.kind, "detach");
  assert.equal(plan.asset.id, "rule-detached-1");
  assert.equal(plan.asset.projectId, "project-a");
  assert.equal(plan.asset.assetType, "rule");
  assert.equal(plan.asset.title, "提交前必须跑检查");
  assert.equal(plan.asset.content, "公共库那份的正文");
  assert.equal(plan.asset.status, "active");
  assert.equal(plan.asset.deletedAt, null);
  assert.equal(
    plan.asset.currentVersionId,
    createInitialAssetVersionId("rule-detached-1"),
  );
  assert.deepEqual(readDetachedFrom(plan.asset.metadata), {
    sourceAssetId: "rule-public-1",
    packId: "rule-pack-a",
    packItemId: "MTH-001",
  });
  // 包链接保留：筛选和「这个项目装了哪些包」还要认它
  assert.equal(plan.asset.metadata.pack.packItemId, "MTH-001");
  // 原来的资产关系不能原样搬（目标标识在新项目里不存在），清空由人重建
  assert.deepEqual(plan.asset.metadata.relations, []);
});

test("项目自己的规则不用脱钩", () => {
  const plan = planDetachToProject({
    rule: { ...createPublicRule(), projectId: "project-a" },
    projectId: "project-a",
    createId: () => "rule-x",
    now,
  });

  assert.equal(plan.kind, "skipped");
  assert.match(plan.reason, /本来就是这个项目的/);
});

test("从公共库直接挑进来的规则（不属于任何包）也能脱钩", () => {
  const plan = planDetachToProject({
    rule: createPublicRule({ pack: null }),
    projectId: "project-a",
    createId: () => "rule-detached-2",
    now,
  });

  assert.equal(plan.kind, "detach");
  assert.deepEqual(readDetachedFrom(plan.asset.metadata), {
    sourceAssetId: "rule-public-1",
    packId: "",
    packItemId: "",
  });
});

test("已经脱钩过的副本不再脱钩", () => {
  const plan = planDetachToProject({
    rule: createPublicRule({
      pack: {
        ...packLink("MTH-001"),
      },
    }),
    projectId: "project-a",
    createId: () => "rule-x",
    now,
  });

  assert.equal(plan.kind, "detach");

  const again = planDetachToProject({
    rule: {
      ...plan.asset,
      metadata: {
        ...plan.asset.metadata,
        detachedFrom: { packId: "rule-pack-a", packItemId: "MTH-001" },
      },
    },
    projectId: "project-a",
    createId: () => "rule-y",
    now,
  });

  assert.equal(again.kind, "skipped");
  assert.match(again.reason, /已经脱钩/);
});

test("编辑脱钩副本之后，脱钩标记还在（否则副本会被当成重复副本藏起来）", () => {
  const plan = planDetachToProject({
    rule: createPublicRule(),
    projectId: "project-a",
    createId: () => "rule-detached-1",
    now,
  });

  assert.equal(plan.kind, "detach");

  const draft = assetToDraft(plan.asset);
  const saved = buildUpdateAssetInput(
    plan.asset,
    { ...draft, title: "改过的标题", content: "改过的正文" },
    { versionId: "version-2", now: "2026-09-25T01:00:00.000Z" },
  );

  assert.equal(saved.asset.title, "改过的标题");
  assert.equal(saved.asset.content, "改过的正文");
  assert.deepEqual(readDetachedFrom(saved.asset.metadata), {
    sourceAssetId: "rule-public-1",
    packId: "rule-pack-a",
    packItemId: "MTH-001",
  });
});
