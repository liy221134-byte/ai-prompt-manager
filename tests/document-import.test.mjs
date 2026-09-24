import assert from "node:assert/strict";
import test from "node:test";

import { isAssetData } from "../src/data/assets.ts";
import {
  buildDocumentImportDrafts,
  DOCUMENT_IMPORT_LIMITS,
  materializeDocumentAssets,
  readDocumentTitle,
} from "../src/lib/document-import.ts";

test("标题取文件名，去掉扩展名和路径", () => {
  assert.equal(readDocumentTitle("需求说明书.md"), "需求说明书");
  assert.equal(readDocumentTitle("E:\\codeX项目\\docs\\design\\架构.md"), "架构");
  assert.equal(readDocumentTitle("验收清单.txt"), "验收清单");
  assert.equal(readDocumentTitle(".md"), "未命名文档");
});

test("同名文档默认标成已存在，空文件不进清单", () => {
  const drafts = buildDocumentImportDrafts({
    files: [
      { fileName: "架构说明.md", content: "# 架构\n\n正文。", byteSize: 20 },
      { fileName: "空文件.md", content: "   \n", byteSize: 5 },
      { fileName: "新文档.md", content: "正文", byteSize: 6 },
    ],
    existing: [{ id: "document-1", title: "架构说明" }],
  });

  assert.equal(drafts.length, 2);
  assert.equal(drafts[0].existingAssetId, "document-1");
  assert.equal(drafts[1].existingAssetId, null);
});

test("超过单文件上限的会被标出来", () => {
  const drafts = buildDocumentImportDrafts({
    files: [
      {
        fileName: "大文档.md",
        content: "正文",
        byteSize: DOCUMENT_IMPORT_LIMITS.bytesPerFile + 1,
      },
    ],
    existing: [],
  });

  assert.equal(drafts[0].tooLarge, true);
});

test("一次最多导入限定份数", () => {
  const files = Array.from(
    { length: DOCUMENT_IMPORT_LIMITS.filesPerBatch + 5 },
    (_, index) => ({
      fileName: `文档-${index + 1}.md`,
      content: "正文",
      byteSize: 6,
    }),
  );
  const drafts = buildDocumentImportDrafts({ files, existing: [] });

  assert.equal(drafts.length, DOCUMENT_IMPORT_LIMITS.filesPerBatch);
});

test("生成的文档资产能通过产品自己的结构校验", () => {
  const drafts = buildDocumentImportDrafts({
    files: [{ fileName: "需求说明.md", content: "# 需求\n\n正文。", byteSize: 18 }],
    existing: [],
  });
  const assets = materializeDocumentAssets({
    drafts,
    projectId: "project-1",
    documentType: "参考资料",
    batchId: "batch-1",
    now: "2026-09-24T00:00:00.000Z",
  });

  assert.equal(assets.length, 1);
  assert.equal(assets[0].assetType, "document");
  assert.equal(assets[0].title, "需求说明");
  assert.equal(assets[0].metadata.documentType, "参考资料");
  assert.equal(assets[0].source.originalFilename, "需求说明.md");
  assert.equal(isAssetData(assets[0]), true);
});
