import assert from "node:assert/strict";
import test from "node:test";

import { planSourcePackageCreation } from "../src/lib/source-package-confirm.ts";

const NOW = "2026-09-22T10:00:00.000Z";

function createDraft() {
  return {
    project: { name: "资产库导入", goal: "把文档整理成资产" },
    items: [
      {
        id: "draft-1",
        sourceFilename: "需求.md",
        assetType: "document",
        title: "需求说明",
        summary: "一句话说明",
        content: "需求正文",
        reason: "像文档",
      },
      {
        id: "draft-2",
        sourceFilename: "规范.md",
        assetType: "rule",
        title: "提交规范",
        summary: "提交前必须跑检查",
        content: "提交前必须通过完整检查。",
        reason: "包含强制要求",
      },
      {
        id: "draft-3",
        sourceFilename: "模板.md",
        assetType: "prompt",
        title: "评审提示词",
        summary: "用来评审需求",
        content: "请评审 {{需求}}",
        reason: "可复用提示词",
      },
    ],
    skipped: [],
  };
}

const UPLOADS = [
  {
    uploadId: "upload-a",
    filename: "需求.md",
    storedPath: "source-packages/upload-a/需求.md",
    byteSize: 1024,
  },
  {
    uploadId: "upload-b",
    filename: "规范.md",
    storedPath: "source-packages/upload-b/规范.md",
    byteSize: 2048,
  },
];

test("新建项目时连项目一起算出来，名称和目标来自草稿", () => {
  const plan = planSourcePackageCreation({
    draft: createDraft(),
    uploads: UPLOADS,
    importBatchId: "batch-1",
    project: { mode: "new", name: "资产库导入", goal: "把文档整理成资产" },
    now: NOW,
  });

  assert.equal(plan.project?.id, "project-batch-1");
  assert.equal(plan.project?.name, "资产库导入");
  assert.equal(plan.project?.description, "把文档整理成资产");
  assert.equal(plan.project?.status, "active");
  assert.equal(plan.project?.stage, "development");
});

test("选已有项目时不重复建项目", () => {
  const plan = planSourcePackageCreation({
    draft: createDraft(),
    uploads: UPLOADS,
    importBatchId: "batch-2",
    project: { mode: "existing", projectId: "default-project" },
    now: NOW,
  });

  assert.equal(plan.project, null);
  assert.equal(plan.assets[0].asset.projectId, "default-project");
  assert.equal(plan.sourcePackages[0].projectId, "default-project");
});

test("每个上传文件留一条只读来源包，正文不进资产内容", () => {
  const plan = planSourcePackageCreation({
    draft: createDraft(),
    uploads: UPLOADS,
    importBatchId: "batch-3",
    project: { mode: "existing", projectId: "default-project" },
    now: NOW,
  });

  assert.equal(plan.sourcePackages.length, 2);
  assert.deepEqual(
    plan.sourcePackages.map((asset) => asset.assetType),
    ["source_package", "source_package"],
  );
  assert.equal(plan.sourcePackages[0].content, "");
  assert.equal(plan.sourcePackages[0].metadata.storedPath, "source-packages/upload-a/需求.md");
  assert.equal(plan.sourcePackages[0].metadata.byteSize, 1024);
  assert.equal(plan.sourcePackages[0].source.sourceType, "import");
  assert.equal(plan.sourcePackages[0].source.originalFilename, "需求.md");
});

test("资产第 1 版的来源指向对应的来源包，规则默认是草稿", () => {
  const plan = planSourcePackageCreation({
    draft: createDraft(),
    uploads: UPLOADS,
    importBatchId: "batch-4",
    project: { mode: "existing", projectId: "default-project" },
    now: NOW,
  });

  const [document, rule, prompt] = plan.assets;

  assert.equal(document.version.versionNumber, 1);
  assert.equal(document.version.versionReason, "initial");
  assert.deepEqual(document.version.sourceAssetIds, ["pkg-batch-4-1"]);
  assert.equal(document.asset.status, "active");

  assert.deepEqual(rule.version.sourceAssetIds, ["pkg-batch-4-2"]);
  assert.equal(rule.asset.status, "draft");
  assert.equal(rule.asset.metadata.ruleType, "recommended");

  assert.equal(prompt.asset.status, "active");
  assert.equal(prompt.asset.metadata.category, "导入");
  // 模板.md 没有对应的来源包，来源数组留空而不是硬凑
  assert.deepEqual(prompt.version.sourceAssetIds, []);
  assert.equal(prompt.asset.metadata.useCase, "用来评审需求");
});

test("标识按类型和批次生成，便于回溯同一次导入", () => {
  const plan = planSourcePackageCreation({
    draft: createDraft(),
    uploads: UPLOADS,
    importBatchId: "batch-5",
    project: { mode: "existing", projectId: "default-project" },
    now: NOW,
  });

  assert.deepEqual(
    plan.assets.map(({ asset }) => asset.id),
    ["document-batch-5-1", "rule-batch-5-2", "prompt-batch-5-3"],
  );
  assert.deepEqual(
    plan.assets.map(({ asset }) => asset.currentVersionId),
    ["current-document-batch-5-1", "current-rule-batch-5-2", "current-prompt-batch-5-3"],
  );
  assert.deepEqual(
    plan.sourcePackages.map((asset) => asset.id),
    ["pkg-batch-5-1", "pkg-batch-5-2"],
  );
});
