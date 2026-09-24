import assert from "node:assert/strict";
import test from "node:test";

import {
  documentFlowStages,
  groupDocumentsByStage,
  readDocumentStage,
} from "../src/lib/document-flow.ts";

function createDocument(title, documentType) {
  return {
    id: `document-${title}`,
    projectId: "project-1",
    assetType: "document",
    title,
    summary: "",
    content: "正文",
    metadata: { documentType },
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

test("文档类型能对上链路阶段", () => {
  assert.equal(readDocumentStage("PRD"), "requirement");
  assert.equal(readDocumentStage("实现规格"), "spec");
  assert.equal(readDocumentStage("架构说明"), "delivery");
  assert.equal(readDocumentStage("验收记录"), "acceptance");
  assert.equal(readDocumentStage("发布手册"), "acceptance");
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
  assert.ok(groups[3].hint.length > 0, "空组也要有说明，告诉人这一格放什么");
});

test("非文档资产不参与分组", () => {
  const rule = { ...createDocument("规则", "PRD"), assetType: "rule" };
  const groups = groupDocumentsByStage([rule]);

  assert.equal(
    groups.reduce((total, group) => total + group.documents.length, 0),
    0,
  );
});
