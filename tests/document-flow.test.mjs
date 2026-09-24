import assert from "node:assert/strict";
import test from "node:test";

import {
  documentFlowStages,
  groupDocumentsByStage,
  listProjectAcceptanceDocuments,
  listProjectReleaseDocuments,
  readProjectChain,
  readDocumentStage,
} from "../src/lib/document-flow.ts";

function createDocument(title, documentType, extraMetadata = {}) {
  return {
    id: `document-${title}`,
    projectId: "project-1",
    assetType: "document",
    title,
    summary: "",
    content: "正文",
    metadata: { documentType, ...extraMetadata },
    source: {
      sourceType: "manual",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: `current-${title}`,
    status: "active",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: "2026-09-24T00:00:00.000Z",
    updatedAt: "2026-09-24T00:00:00.000Z",
  };
}

test("文档类型能对上链路阶段（六段）", () => {
  assert.equal(readDocumentStage("PRD"), "requirement");
  assert.equal(readDocumentStage("实现规格"), "spec");
  assert.equal(readDocumentStage("架构说明"), "delivery");
  assert.equal(readDocumentStage("数据库说明"), "delivery");
  assert.equal(readDocumentStage("验收记录"), "acceptance");
  assert.equal(readDocumentStage("发布记录"), "release");
  assert.equal(readDocumentStage("发布手册"), "release");
  assert.equal(readDocumentStage("参考资料"), "other");
});

test("不认识的文档类型归到其他，不会丢掉", () => {
  assert.equal(readDocumentStage("我自己起的类型"), "other");
});

test("分组顺序固定，空组也保留", () => {
  const groups = groupDocumentsByStage([
    createDocument("需求说明", "PRD"),
    createDocument("这次怎么改", "实现规格"),
    createDocument("架构", "架构说明"),
  ]);

  assert.deepEqual(
    groups.map((group) => group.stage),
    [...documentFlowStages],
  );
  assert.equal(groups[0].documents.length, 1);
  assert.equal(groups[1].documents.length, 1);
  assert.equal(groups[2].documents.length, 1);
  assert.equal(groups[3].documents.length, 0);
  assert.equal(groups[4].documents.length, 0);
  assert.ok(groups[3].hint.length > 0, "空组也要有说明，告诉人这一格放什么");
  assert.ok(groups[4].hint.length > 0, "发布那一格也要有说明");
});

test("非文档资产不参与分组", () => {
  const rule = { ...createDocument("规则", "PRD"), assetType: "rule" };
  const groups = groupDocumentsByStage([rule]);

  assert.equal(
    groups.reduce((total, group) => total + group.documents.length, 0),
    0,
  );
});

test("验收记录和发布记录都从文档里认，草稿也算不上数", () => {
  const assets = [
    createDocument("v1 验收清单", "验收记录"),
    createDocument("v1 发布记录", "发布记录"),
    createDocument("发布与回滚", "发布手册"),
    // 草稿还没提交，不算数
    { ...createDocument("草稿验收", "验收记录"), status: "draft" },
    // 别的项目的不算
    { ...createDocument("别的项目验收", "验收记录"), projectId: "project-2" },
    createDocument("参考资料", "参考资料"),
  ];

  assert.deepEqual(
    listProjectAcceptanceDocuments(assets, "project-1").map(
      (document) => document.title,
    ),
    ["v1 验收清单"],
  );
  assert.deepEqual(
    listProjectReleaseDocuments(assets, "project-1").map(
      (document) => document.title,
    ),
    ["v1 发布记录"],
  );
});

test("链路完整性：四环齐了就是齐了，缺哪环标哪环", () => {
  const prd = createDocument("需求说明", "PRD");
  const acceptance = createDocument("v1 验收清单", "验收记录", {
    evidence: { conclusion: "pending", commitRef: "" },
  });
  const partial = readProjectChain({
    assets: [prd, acceptance],
    projectId: "project-1",
  });

  assert.equal(partial.find((item) => item.key === "prd").satisfied, true);
  assert.equal(partial.find((item) => item.key === "evidence").satisfied, true);
  assert.equal(partial.find((item) => item.key === "spec").satisfied, false);
  assert.equal(partial.find((item) => item.key === "release").satisfied, false);

  const spec = createDocument("这次怎么改", "实现规格");
  const release = createDocument("v1.0.0 发布记录", "发布记录", {
    release: {
      version: "v1.0.0",
      releasedAt: "2026-09-24",
      result: "released",
      rollbackTarget: "",
      gates: [],
    },
  });
  const complete = readProjectChain({
    assets: [prd, spec, acceptance, release],
    projectId: "project-1",
  });

  assert.equal(
    complete.every((item) => item.satisfied),
    true,
  );

  // 发布手册只是「发布那一段的文档」，不算一条发布记录
  const withManualOnly = readProjectChain({
    assets: [prd, spec, acceptance, createDocument("发布与回滚", "发布手册")],
    projectId: "project-1",
  });

  assert.equal(
    withManualOnly.find((item) => item.key === "release").satisfied,
    false,
  );
});
