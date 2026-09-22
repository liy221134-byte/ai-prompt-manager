import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DELETE,
  GET,
  POST,
} from "../src/app/api/source-packages/route.ts";

const ROUTE_URL = "http://localhost/api/source-packages";

// 每个用例换一个临时数据目录，接口通过 PROMPT_DB_PATH 找到它
function useTempDataRoot() {
  const dataRootDir = mkdtempSync(join(tmpdir(), "source-package-api-"));
  const previous = {
    promptDbPath: process.env.PROMPT_DB_PATH,
    dataMode: process.env.NEXT_PUBLIC_DATA_MODE,
    vercel: process.env.VERCEL,
  };

  process.env.PROMPT_DB_PATH = join(dataRootDir, "prompts.sqlite");
  // 这些接口只在本地模式放行；构建机上带着 VERCEL 和 supabase 模式跑时会被直接拒绝，
  // 所以用例里显式声明本地模式，避免测试结果取决于运行环境。
  process.env.NEXT_PUBLIC_DATA_MODE = "local";
  delete process.env.VERCEL;

  return {
    dataRootDir,
    restore() {
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

function uploadRequest(filename, bytes, type = "application/octet-stream") {
  const form = new FormData();
  form.append("file", new File([bytes], filename, { type }));

  return new Request(ROUTE_URL, { method: "POST", body: form });
}

test("上传 Markdown 会把原文落盘并返回上传编号", async () => {
  const temp = useTempDataRoot();

  try {
    const bytes = new TextEncoder().encode("# 设计说明\n\n正文");
    const response = await POST(uploadRequest("设计说明.md", bytes, "text/markdown"));
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.match(body.upload.uploadId, /^upload-[0-9a-f-]{36}$/);
    assert.equal(body.upload.filename, "设计说明.md");
    assert.equal(body.upload.kind, "markdown");
    assert.equal(body.upload.byteSize, bytes.byteLength);
    assert.equal(
      body.upload.storedPath,
      `source-packages/${body.upload.uploadId}/设计说明.md`,
    );

    const onDisk = readFileSync(
      join(temp.dataRootDir, ...body.upload.storedPath.split("/")),
    );
    assert.deepEqual(new Uint8Array(onDisk), bytes);
  } finally {
    temp.restore();
  }
});

test("上传后不写资产，只暂存原文", async () => {
  const temp = useTempDataRoot();

  try {
    await POST(uploadRequest("说明.md", new TextEncoder().encode("内容")));

    // 暂存阶段不应该建库，也不应该产生资产表
    assert.equal(existsSync(join(temp.dataRootDir, "prompts.sqlite")), false);
  } finally {
    temp.restore();
  }
});

test("不支持的格式、空文件和假 ZIP 都会被拒绝", async () => {
  const temp = useTempDataRoot();

  try {
    const png = await POST(uploadRequest("图片.png", new Uint8Array([1, 2, 3, 4])));
    assert.equal(png.status, 400);
    assert.match((await png.json()).error, /只支持 Markdown、纯文本和 ZIP/);

    const empty = await POST(uploadRequest("空.md", new Uint8Array()));
    assert.equal(empty.status, 400);
    assert.match((await empty.json()).error, /文件是空的/);

    const fakeZip = await POST(
      uploadRequest("假装是包.zip", new Uint8Array([0x23, 0x20, 0x2d, 0x2d])),
    );
    assert.equal(fakeZip.status, 400);
    assert.match((await fakeZip.json()).error, /不是有效的 ZIP/);
  } finally {
    temp.restore();
  }
});

test("没有文件的请求会被拒绝", async () => {
  const temp = useTempDataRoot();

  try {
    const form = new FormData();
    form.append("other", "x");
    const response = await POST(new Request(ROUTE_URL, { method: "POST", body: form }));

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /没有收到文件/);
  } finally {
    temp.restore();
  }
});

test("按相对路径能把原文原样取回", async () => {
  const temp = useTempDataRoot();

  try {
    const bytes = new TextEncoder().encode("可下载查看的原文");
    const created = await POST(uploadRequest("原文.txt", bytes, "text/plain"));
    const { upload } = await created.json();

    const response = await GET(
      new Request(`${ROUTE_URL}?path=${encodeURIComponent(upload.storedPath)}`),
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-disposition"), /%E5%8E%9F%E6%96%87\.txt/);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  } finally {
    temp.restore();
  }
});

test("越界路径和缺失路径都取不到文件", async () => {
  const temp = useTempDataRoot();

  try {
    const escape = await GET(
      new Request(`${ROUTE_URL}?path=${encodeURIComponent("../prompts.sqlite")}`),
    );
    assert.equal(escape.status, 404);

    const missing = await GET(new Request(ROUTE_URL));
    assert.equal(missing.status, 400);
  } finally {
    temp.restore();
  }
});

test("取消上传会删掉暂存的原文", async () => {
  const temp = useTempDataRoot();

  try {
    const created = await POST(
      uploadRequest("临时.md", new TextEncoder().encode("临时内容")),
    );
    const { upload } = await created.json();
    const filePath = join(temp.dataRootDir, ...upload.storedPath.split("/"));
    assert.equal(existsSync(filePath), true);

    const removed = await DELETE(
      new Request(`${ROUTE_URL}?uploadId=${upload.uploadId}`, { method: "DELETE" }),
    );
    assert.equal(removed.status, 200);
    assert.equal(existsSync(filePath), false);

    const badId = await DELETE(
      new Request(`${ROUTE_URL}?uploadId=../x`, { method: "DELETE" }),
    );
    assert.equal(badId.status, 400);
  } finally {
    temp.restore();
  }
});
