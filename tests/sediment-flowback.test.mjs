import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOriginNote,
  listSedimentCheckup,
  planPromoteToPublic,
  readUpstreamState,
} from "../src/lib/sediment-flowback.ts";

const projectName = "科创平台2.0";
const note = buildOriginNote(projectName);

function createAsset(overrides = {}) {
  return {
    id: "rule-1",
    projectId: "project-a",
    assetType: "rule",
    title: "接口契约规则",
    summary: "",
    content: "正文",
    metadata: { ruleType: "must", scope: "project" },
    source: {
      sourceType: "manual",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: "current-rule-1",
    status: "active",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

test("提升计划：给公共副本和两条同源关系，不动项目里那份", () => {
  const plan = planPromoteToPublic({
    asset: createAsset(),
    projectName,
    createId: () => "rule-public-1",
  });

  assert.equal(plan.kind, "promote");
  assert.equal(plan.publicAssetId, "rule-public-1");
  assert.equal(plan.publicRelation.targetAssetId, "rule-1");
  assert.equal(plan.publicRelation.note, note);
  assert.equal(plan.projectRelation.note, note);
});

test("提示词不参与提升，已经提升过的会给出原因", () => {
  assert.equal(
    planPromoteToPublic({
      asset: createAsset({ assetType: "prompt" }),
      projectName,
      createId: () => "x",
    }).kind,
    "skipped",
  );

  const already = createAsset({
    metadata: {
      ruleType: "must",
      scope: "project",
      relations: [{ targetAssetId: "rule-public-1", relationType: "reference", note }],
    },
  });
  const plan = planPromoteToPublic({
    asset: already,
    projectName,
    createId: () => "x",
  });

  assert.equal(plan.kind, "skipped");
  assert.match(plan.reason, /已经提升/);
});

test("上游状态：公共那条更新过就提示，没更新就不提示", () => {
  const projectAsset = createAsset({
    metadata: {
      ruleType: "must",
      scope: "project",
      relations: [{ targetAssetId: "rule-public-1", relationType: "reference", note }],
    },
    updatedAt: "2026-09-10T00:00:00.000Z",
  });
  const newerUpstream = createAsset({
    id: "rule-public-1",
    projectId: "default-project",
    updatedAt: "2026-09-20T00:00:00.000Z",
  });

  const updated = readUpstreamState({
    asset: projectAsset,
    projectName,
    assets: [projectAsset, newerUpstream],
  });

  assert.equal(updated.hasUpdate, true);
  assert.equal(updated.upstream?.id, "rule-public-1");

  const older = readUpstreamState({
    asset: projectAsset,
    projectName,
    assets: [
      projectAsset,
      { ...newerUpstream, updatedAt: "2026-09-05T00:00:00.000Z" },
    ],
  });

  assert.equal(older.hasUpdate, false);
});

test("没有同源关系时不上报上游", () => {
  const state = readUpstreamState({
    asset: createAsset(),
    projectName,
    assets: [],
  });

  assert.equal(state.upstream, null);
  assert.equal(state.hasUpdate, false);
});

test("沉淀体检：三条线索各自能筛出东西", () => {
  const publicRule = createAsset({
    id: "rule-public-1",
    projectId: "default-project",
    title: "公共规则",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  const projectRule = createAsset({ id: "rule-p1", title: "只在项目里的规则" });
  const duplicate = createAsset({
    id: "document-p1",
    assetType: "document",
    title: "公共规则",
    metadata: { documentType: "参考资料" },
  });
  const checkup = listSedimentCheckup({
    assets: [publicRule, projectRule, duplicate],
    publicProjectId: "default-project",
    projects: [
      { id: "default-project", name: "公共资产库" },
      { id: "project-a", name: projectName },
    ],
    now: "2026-09-24T00:00:00.000Z",
  });

  assert.equal(checkup.projectOnlyRules.length, 1);
  assert.equal(checkup.projectOnlyRules[0].asset.id, "rule-p1");
  assert.equal(checkup.duplicateTitles.length, 1);
  assert.equal(checkup.duplicateTitles[0].asset.id, "document-p1");
  assert.equal(checkup.stalePublicAssets.length, 1);
  assert.ok(checkup.stalePublicAssets[0].daysSinceUpdate > 90);
});

test("已经提升过的规则不再出现在「只在项目里」清单里", () => {
  const promoted = createAsset({
    id: "rule-promoted",
    metadata: {
      ruleType: "must",
      scope: "project",
      relations: [{ targetAssetId: "rule-public-1", relationType: "reference", note }],
    },
  });
  const checkup = listSedimentCheckup({
    assets: [promoted],
    publicProjectId: "default-project",
    projects: [
      { id: "default-project", name: "公共资产库" },
      { id: "project-a", name: projectName },
    ],
    now: "2026-09-24T00:00:00.000Z",
  });

  assert.equal(checkup.projectOnlyRules.length, 0);
});
