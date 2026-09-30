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
  const previous = {
    promptDbPath: process.env.PROMPT_DB_PATH,
    dataMode: process.env.NEXT_PUBLIC_DATA_MODE,
    vercel: process.env.VERCEL,
  };

  process.env.PROMPT_DB_PATH = join(dataRootDir, "prompts.sqlite");
  // 确认接口同样只在本地模式放行，用例里显式声明本地模式，避免受构建机环境影响
  process.env.NEXT_PUBLIC_DATA_MODE = "local";
  delete process.env.VERCEL;

  // 先把单例绑定到当前临时目录，用例结束时关掉它，否则 Windows 删不掉临时文件
  const database = getPromptDatabase();

  return {
    dataRootDir,
    database,
    restore() {
      database.close();
      delete globalThis.promptDatabase;

      setEnv("PROMPT_DB_PATH", previous.promptDbPath);
      setEnv("NEXT_PUBLIC_DATA_MODE", previous.dataMode);
      setEnv("VERCEL", previous.vercel);

      rmSync(dataRootDir, { recursive: true, force: true });
    },
  };
}

function setEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
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

// —— M2.1 T14：外部采集模式 ——

test("外部采集模式：不传项目也能落库，自动生一条采集记录进公共库", async () => {
  const temp = useTempDataRoot();

  try {
    const response = await POST(
      confirmRequest({
        importBatchId: "batch-ext-a",
        mode: "external-collection",
        collectionMeta: { source: "obra/superpowers", ecosystem: "开源社区" },
        uploads: [UPLOADS[1]],
        draft: {
          project: { name: "忽略", goal: "" },
          items: [createDraft().items[1]],
        },
      }),
    );
    const body = await response.json();

    assert.equal(response.status, 201);
    // 2 条草稿资产（1 rule）+ 1 条自动生成的采集记录
    assert.equal(body.created.assets, 2);
    assert.equal(body.projectId, "default-project");

    const assets = temp.database.listAssets("default-project");

    const record = assets.find((asset) => asset.metadata?.documentType === "采集记录");

    assert.ok(record, "应当自动生成一条采集记录");
    assert.equal(record.title, "obra/superpowers");
    assert.equal(record.metadata.collection.ecosystem, "开源社区");
    assert.equal(record.metadata.collection.disposition, "已采");
    assert.equal(record.assetType, "document");

    // 规则带上假设级可信度与来源摘录（合规检查盯的两项）
    const rule = assets.find((asset) => asset.assetType === "rule");
    assert.equal(rule.metadata.confidence, "hypothesis");
    assert.equal(rule.metadata.sourceExcerpt, "提交前必须通过完整检查。");
  } finally {
    temp.restore();
  }
});

test("外部采集模式：没填来源名时拒绝创建", async () => {
  const temp = useTempDataRoot();

  try {
    const response = await POST(
      confirmRequest({
        importBatchId: "batch-ext-b",
        mode: "external-collection",
        uploads: [UPLOADS[0]],
        draft: { project: { name: "x", goal: "" }, items: [createDraft().items[0]] },
      }),
    );

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /外部采集要填来源名/);
  } finally {
    temp.restore();
  }
});
