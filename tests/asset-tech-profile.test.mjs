import assert from "node:assert/strict";
import test from "node:test";

import {
  isAssetData,
  normalizeAssetRelations,
  normalizeTechProfileMetadata,
  assetToPrompt,
  promptToAsset,
} from "../src/data/assets.ts";
import {
  findProjectTechProfile,
  listAdrCandidates,
  validateTechStack,
} from "../src/lib/tech-profile.ts";
import {
  buildCreateAssetInput,
  createEmptyAssetDraft,
} from "../src/lib/asset-draft.ts";

function createTechProfile(metadata, overrides = {}) {
  return {
    id: "tech_profile-a",
    projectId: "default-project",
    assetType: "tech_profile",
    title: "技术档案",
    summary: "",
    content: "",
    metadata,
    source: {
      sourceType: "manual",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: "current-tech_profile-a",
    status: "active",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: "2026-09-22T10:00:00.000Z",
    updatedAt: "2026-09-22T10:00:00.000Z",
    ...overrides,
  };
}

const entry = (overrides = {}) => ({
  name: "Next.js",
  version: "16",
  purpose: "前端框架",
  isDeviation: false,
  adrAssetId: null,
  ...overrides,
});

test("技术档案元数据合法时通过校验", () => {
  assert.equal(
    isAssetData(createTechProfile({ stack: [entry()] })),
    true,
  );
  assert.equal(
    isAssetData(
      createTechProfile({
        stack: [entry({ isDeviation: true, adrAssetId: "document-adr-1" })],
      }),
    ),
    true,
  );
});

test("技术档案元数据不合法时被拒绝", () => {
  assert.equal(isAssetData(createTechProfile({ stack: "不是数组" })), false);
  assert.equal(isAssetData(createTechProfile({ stack: [entry({ isDeviation: "yes" })] })), false);
  assert.equal(isAssetData(createTechProfile({ stack: [entry({ name: "" })] })), false);
});

test("规则和文档也可以带关系，关系类型不合法会被拒绝", () => {
  const document = {
    id: "document-a",
    projectId: "default-project",
    assetType: "document",
    title: "需求",
    summary: "",
    content: "正文",
    metadata: {
      documentType: "PRD",
      relations: [
        { targetAssetId: "rule-a", relationType: "reference", note: "引用" },
      ],
    },
    source: {
      sourceType: "manual",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: "current-document-a",
    status: "active",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: "2026-09-22T10:00:00.000Z",
    updatedAt: "2026-09-22T10:00:00.000Z",
  };

  assert.equal(isAssetData(document), true);
  assert.equal(
    isAssetData({
      ...document,
      metadata: {
        ...document.metadata,
        relations: [
          { targetAssetId: "rule-a", relationType: "随便写的", note: "" },
        ],
      },
    }),
    false,
  );
});

test("技术档案元数据缺字段时补成空值，不完整的条目会被丢掉", () => {
  const form = normalizeTechProfileMetadata({ stack: [entry()] });

  assert.deepEqual(form.relations, []);
  assert.equal(form.stack.length, 1);
  assert.equal(form.stack[0].name, "Next.js");

  // 少字段的条目直接丢弃，不带 undefined 进编辑器
  assert.deepEqual(
    normalizeTechProfileMetadata({ stack: [{ name: "X" }] }).stack,
    [],
  );

  const empty = normalizeTechProfileMetadata(null);
  assert.deepEqual(empty, { stack: [], relations: [] });
});

test("认不出来的关系会被丢掉", () => {
  const relations = normalizeAssetRelations([
    { targetAssetId: "a", relationType: "reference", note: "ok" },
    { targetAssetId: "", relationType: "reference", note: "空目标" },
    { targetAssetId: "b", relationType: "unknown", note: "" },
  ]);

  assert.deepEqual(relations, [
    { targetAssetId: "a", relationType: "reference", note: "ok" },
  ]);
});

test("偏离默认选型必须挂 ADR", () => {
  assert.match(validateTechStack([]), /至少填写一项/);
  assert.equal(validateTechStack([entry()]), null);
  assert.match(
    validateTechStack([entry({ isDeviation: true })]),
    /需要先选一条 ADR/,
  );
  assert.equal(
    validateTechStack([entry({ isDeviation: true, adrAssetId: "document-adr-1" })]),
    null,
  );
  // 没填名称的空行不参与校验
  assert.equal(validateTechStack([entry(), entry({ name: "  ", isDeviation: true })]), null);
});

test("ADR 候选只取同项目的、没进垃圾箱的 ADR 文档", () => {
  const base = {
    summary: "",
    content: "正文",
    source: {
      sourceType: "manual",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    status: "active",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: "2026-09-22T10:00:00.000Z",
    updatedAt: "2026-09-22T10:00:00.000Z",
  };

  const assets = [
    { ...base, id: "document-adr-1", projectId: "p1", assetType: "document", title: "ADR 1", metadata: { documentType: "ADR" }, currentVersionId: "c1" },
    { ...base, id: "document-prd", projectId: "p1", assetType: "document", title: "PRD", metadata: { documentType: "PRD" }, currentVersionId: "c2" },
    { ...base, id: "document-adr-p2", projectId: "p2", assetType: "document", title: "别的项目的 ADR", metadata: { documentType: "ADR" }, currentVersionId: "c3" },
    { ...base, id: "document-adr-trashed", projectId: "p1", assetType: "document", title: "垃圾箱里的 ADR", metadata: { documentType: "ADR" }, deletedAt: "2026-09-22T11:00:00.000Z", deletedReason: "manual", currentVersionId: "c4" },
  ];

  assert.deepEqual(
    listAdrCandidates(assets, "p1").map((asset) => asset.id),
    ["document-adr-1"],
  );
});

test("一个项目只认一份技术档案", () => {
  const assets = [
    createTechProfile({ stack: [entry()], notes: "" }),
    createTechProfile({ stack: [entry()], notes: "" }, { id: "tech_profile-b", projectId: "p2" }),
    createTechProfile({ stack: [entry()], notes: "" }, { id: "tech_profile-c", deletedAt: "2026-09-22T11:00:00.000Z", deletedReason: "manual" }),
  ];

  assert.equal(findProjectTechProfile(assets, "default-project")?.id, "tech_profile-a");
  assert.equal(findProjectTechProfile(assets, "p2")?.id, "tech_profile-b");
  assert.equal(findProjectTechProfile(assets, "p3"), null);
});

test("关系能写进草稿再存回元数据，没选目标的行会被丢掉", () => {
  const input = buildCreateAssetInput({
    id: "document-alpha",
    projectId: "project-1",
    draft: {
      ...createEmptyAssetDraft("document"),
      title: "需求说明",
      content: "正文",
      documentType: "PRD",
      relations: [
        {
          key: "relation-1",
          targetAssetId: "rule-a",
          relationType: "reference",
          note: "引用提交规范",
        },
        {
          key: "relation-2",
          targetAssetId: "",
          relationType: "depends_on",
          note: "没选目标",
        },
      ],
    },
    now: "2026-09-22T10:00:00.000Z",
  });

  assert.deepEqual(input.asset.metadata.relations, [
    {
      targetAssetId: "rule-a",
      relationType: "reference",
      note: "引用提交规范",
    },
  ]);
});

test("提示词的关系能跟着资产映射来回走，空关系不写多余字段", () => {
  const prompt = {
    id: "prompt-a",
    title: "提示词",
    category: "测试",
    tags: ["a"],
    content: "正文",
    useCase: "场景",
    createdAt: "2026-09-22T10:00:00.000Z",
    updatedAt: "2026-09-22T10:00:00.000Z",
    deletedAt: null,
    deletedReason: null,
    mergedIntoPromptId: null,
    mergeVersionId: null,
    relations: [
      { targetAssetId: "rule-a", relationType: "depends_on", note: "依赖" },
    ],
  };

  const asset = promptToAsset(prompt, "default-project");

  assert.deepEqual(asset.metadata.relations, prompt.relations);
  assert.deepEqual(assetToPrompt(asset).relations, prompt.relations);

  const withoutRelations = assetToPrompt(
    promptToAsset({ ...prompt, relations: undefined }, "default-project"),
  );
  assert.equal(withoutRelations.relations, undefined);
});
