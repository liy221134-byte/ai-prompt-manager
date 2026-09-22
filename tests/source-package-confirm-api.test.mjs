import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { POST } from "../src/app/api/source-packages/confirm/route.ts";
import { getPromptDatabase } from "../src/lib/server/prompt-database.ts";

const ROUTE_URL = "http://localhost/api/source-packages/confirm";

function useTempDataRoot() {
  const dataRootDir = mkdtempSync(join(tmpdir(), "source-package-confirm-"));
  const previous = process.env.PROMPT_DB_PATH;

  process.env.PROMPT_DB_PATH = join(dataRootDir, "prompts.sqlite");

  // 先把单例绑定到当前临时目录，用例结束时关掉它，否则 Windows 删不掉临时文件
  const database = getPromptDatabase();

  return {
    dataRootDir,
    database,
    restore() {
      database.close();
      delete globalThis.promptDatabase;

      if (previous === undefined) {
        delete process.env.PROMPT_DB_PATH;
      } else {
        process.env.PROMPT_DB_PATH = previous;
      }

      rmSync(dataRootDir, { recursive: true, force: true });
    },
  };
}

function confirmRequest(body) {
  return new Request(ROUTE_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createDraft() {
  return {
    project: { name: "导入的项目", goal: "把文档整理成资产" },
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
    ],
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

test("确认后一次性创建项目、来源包和资产", async () => {
  const temp = useTempDataRoot();

  try {
    const response = await POST(
      confirmRequest({
        importBatchId: "batch-a",
        project: { mode: "new", name: "导入的项目", goal: "把文档整理成资产" },
        uploads: UPLOADS,
        draft: createDraft(),
      }),
    );
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.deepEqual(body.created, { project: true, sourcePackages: 2, assets: 2 });
    assert.equal(body.projectId, "project-batch-a");

    const assets = temp.database.listAssets("project-batch-a");

    assert.deepEqual(
      assets.map((asset) => asset.assetType).sort(),
      ["document", "rule", "source_package", "source_package"],
    );

    // 规则是草稿状态，文档是活跃状态
    const rule = assets.find((asset) => asset.assetType === "rule");
    assert.equal(rule.status, "draft");

    // 资产第 1 版的来源指向对应的来源包
    const document = assets.find((asset) => asset.assetType === "document");
    const versions = temp.database.listAssetVersions(document.id);
    assert.equal(versions.length, 1);
    assert.equal(versions[0].versionNumber, 1);
    assert.deepEqual(versions[0].sourceAssetIds, ["pkg-batch-a-1"]);

  } finally {
    temp.restore();
  }
});

test("导入到已有项目时不新建项目", async () => {
  const temp = useTempDataRoot();

  try {
    const response = await POST(
      confirmRequest({
        importBatchId: "batch-b",
        project: { mode: "existing", projectId: "default-project" },
        uploads: [UPLOADS[0]],
        draft: {
          project: { name: "忽略", goal: "" },
          items: [createDraft().items[0]],
        },
      }),
    );

    assert.equal(response.status, 201);

    const body = await response.json();
    assert.equal(body.created.project, false);
    assert.equal(body.projectId, "default-project");
  } finally {
    temp.restore();
  }
});

test("草稿不完整或缺少上传记录时拒绝创建", async () => {
  const temp = useTempDataRoot();

  try {
    const missingUploads = await POST(
      confirmRequest({
        importBatchId: "batch-c",
        project: { mode: "existing", projectId: "default-project" },
        uploads: [],
        draft: createDraft(),
      }),
    );
    assert.equal(missingUploads.status, 400);
    assert.match((await missingUploads.json()).error, /没有可创建的上传记录/);

    const emptyTitle = await POST(
      confirmRequest({
        importBatchId: "batch-d",
        project: { mode: "existing", projectId: "default-project" },
        uploads: [UPLOADS[0]],
        draft: {
          project: { name: "x", goal: "" },
          items: [{ ...createDraft().items[0], title: " " }],
        },
      }),
    );
    assert.equal(emptyTitle.status, 400);
    assert.match((await emptyTitle.json()).error, /草稿内容不完整/);
  } finally {
    temp.restore();
  }
});

test("同一批次重复确认不会写第二遍", async () => {
  const temp = useTempDataRoot();

  try {
    const body = {
      importBatchId: "batch-e",
      project: { mode: "existing", projectId: "default-project" },
      uploads: [UPLOADS[0]],
      draft: { project: { name: "x", goal: "" }, items: [createDraft().items[0]] },
    };

    const first = await POST(confirmRequest(body));
    assert.equal(first.status, 201);

    const second = await POST(confirmRequest(body));
    assert.equal(second.status, 409);
    assert.match((await second.json()).error, /已经存在/);
  } finally {
    temp.restore();
  }
});
