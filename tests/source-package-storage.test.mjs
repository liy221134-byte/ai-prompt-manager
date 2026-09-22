import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createSourcePackageRelativePath,
  createSourcePackageUploadId,
  listSourcePackageUploadIds,
  readSourcePackageUpload,
  removeSourcePackageUpload,
  saveSourcePackageUpload,
} from "../src/lib/server/source-package-storage.ts";

function createDataRoot() {
  return mkdtempSync(join(tmpdir(), "source-package-"));
}

test("上传的原文按上传编号落盘，返回可写进资产的相对路径", async () => {
  const dataRootDir = createDataRoot();

  try {
    const uploadId = createSourcePackageUploadId();
    const bytes = new TextEncoder().encode("# 设计说明\n\n正文内容");

    const saved = await saveSourcePackageUpload({
      dataRootDir,
      uploadId,
      filename: "设计说明.md",
      bytes,
    });

    assert.equal(
      saved.relativePath,
      createSourcePackageRelativePath(uploadId, "设计说明.md"),
    );
    assert.equal(saved.byteSize, bytes.byteLength);

    const readBack = await readSourcePackageUpload(dataRootDir, saved.relativePath);
    assert.deepEqual(new Uint8Array(readBack), bytes);
  } finally {
    rmSync(dataRootDir, { recursive: true, force: true });
  }
});

test("相对路径越界会被拒绝，读到来源目录之外的文件", async () => {
  const dataRootDir = createDataRoot();

  try {
    await assert.rejects(
      () => readSourcePackageUpload(dataRootDir, "../prompts.sqlite"),
      /越界/,
    );
    await assert.rejects(
      () => readSourcePackageUpload(dataRootDir, "source-packages/../../x"),
      /越界/,
    );
  } finally {
    rmSync(dataRootDir, { recursive: true, force: true });
  }
});

test("删除上传会清掉整个目录，再读就找不到", async () => {
  const dataRootDir = createDataRoot();

  try {
    const uploadId = createSourcePackageUploadId();
    const saved = await saveSourcePackageUpload({
      dataRootDir,
      uploadId,
      filename: "包.zip",
      bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
    });

    assert.deepEqual(await listSourcePackageUploadIds(dataRootDir), [uploadId]);

    await removeSourcePackageUpload(dataRootDir, uploadId);

    assert.deepEqual(await listSourcePackageUploadIds(dataRootDir), []);
    await assert.rejects(() =>
      readSourcePackageUpload(dataRootDir, saved.relativePath),
    );
  } finally {
    rmSync(dataRootDir, { recursive: true, force: true });
  }
});

test("来源目录还不存在时列出上传不会报错", async () => {
  const dataRootDir = createDataRoot();

  try {
    assert.deepEqual(await listSourcePackageUploadIds(dataRootDir), []);
  } finally {
    rmSync(dataRootDir, { recursive: true, force: true });
  }
});
