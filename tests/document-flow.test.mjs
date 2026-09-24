import assert from "node:assert/strict";
import test from "node:test";

import {
  documentFlowStages,
  groupDocumentsByStage,
  readProjectChain,
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

test("链路完整性：四环齐了就是齐了，缺哪环标哪环", () => {
  const prd = createDocument("需求说明", "PRD");
  const evidence = {
    ...createDocument("某需求的验收", "验收记录"),
    id: "evidence-1",
    assetType: "evidence",
    metadata: { conclusion: "pending", nodeId: "REQ-001" },
  };
  const partial = readProjectChain({
    assets: [prd, evidence],
    projectId: "project-1",
  });

  assert.equal(partial.find((item) => item.key === "prd").satisfied, true);
  assert.equal(partial.find((item) => item.key === "evidence").satisfied, true);
  assert.equal(partial.find((item) => item.key === "spec").satisfied, false);
  assert.equal(partial.find((item) => item.key === "release").satisfied, false);

  const spec = createDocument("这次怎么改", "实现规格");
  const release = {
    ...createDocument("发布", "发布手册"),
    id: "release-1",
    assetType: "release_record",
    metadata: { version: "v1.0.0", result: "released", gates: [] },
  };
  const complete = readProjectChain({
    assets: [prd, spec, evidence, release],
    projectId: "project-1",
  });

  assert.equal(
    complete.every((item) => item.satisfied),
    true,
  );
});
