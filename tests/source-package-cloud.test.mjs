import assert from "node:assert/strict";
import test from "node:test";

import {
  SOURCE_PACKAGE_BUCKET,
  createCloudSourcePackagePath,
  createSourcePackageDownloadUrl,
  removeCloudSourcePackageUpload,
  uploadSourcePackageToCloud,
} from "../src/lib/source-package-cloud.ts";

function createFakeClient(overrides = {}) {
  const calls = [];

  const client = {
    storage: {
      from(bucket) {
        return {
          async upload(path, bytes, options) {
            calls.push({ action: "upload", bucket, path, size: bytes.byteLength, options });
            return overrides.upload ?? { error: null };
          },
          async createSignedUrl(path, expiresIn) {
            calls.push({ action: "createSignedUrl", bucket, path, expiresIn });
            return (
              overrides.createSignedUrl ?? {
                data: { signedUrl: "https://example.test/signed" },
                error: null,
              }
            );
          },
          async list(prefix) {
            calls.push({ action: "list", bucket, prefix });
            return overrides.list ?? { data: [], error: null };
          },
          async remove(paths) {
            calls.push({ action: "remove", bucket, paths });
            return overrides.remove ?? { error: null };
          },
        };
      },
    },
  };

  return { client, calls };
}

test("云端原文路径以用户 id 开头，把隔离边界写进路径", () => {
  assert.equal(
    createCloudSourcePackagePath({
      userId: "user-1",
      uploadId: "upload-a",
      filename: "文档包.zip",
    }),
    "user-1/upload-a/文档包.zip",
  );
});

test("上传原文到私有桶，不覆盖同名对象", async () => {
  const { client, calls } = createFakeClient();
  const bytes = new TextEncoder().encode("原文内容");

  const result = await uploadSourcePackageToCloud(client, {
    userId: "user-1",
    uploadId: "upload-a",
    filename: "说明.md",
    bytes,
    contentType: "text/markdown",
  });

  assert.deepEqual(result, {
    storedPath: "user-1/upload-a/说明.md",
    byteSize: bytes.byteLength,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].bucket, SOURCE_PACKAGE_BUCKET);
  assert.equal(calls[0].options.upsert, false);
  assert.equal(calls[0].options.contentType, "text/markdown");
});

test("上传失败时给中文提示", async () => {
  const { client } = createFakeClient({
    upload: { error: { message: "row-level security" } },
  });

  await assert.rejects(
    () =>
      uploadSourcePackageToCloud(client, {
        userId: "user-1",
        uploadId: "upload-a",
        filename: "说明.md",
        bytes: new Uint8Array([1]),
      }),
    /上传原文到云端失败/,
  );
});

test("私有桶通过签名地址下载", async () => {
  const { client, calls } = createFakeClient();

  const url = await createSourcePackageDownloadUrl(
    client,
    "user-1/upload-a/说明.md",
    600,
  );

  assert.equal(url, "https://example.test/signed");
  assert.equal(calls[0].expiresIn, 600);

  const failing = createFakeClient({
    createSignedUrl: { data: null, error: { message: "not found" } },
  });
  await assert.rejects(
    () => createSourcePackageDownloadUrl(failing.client, "missing.md"),
    /获取原文下载地址失败/,
  );
});

test("放弃上传时按目录整批删除", async () => {
  const { client, calls } = createFakeClient({
    list: { data: [{ name: "a.md" }, { name: "b.zip" }], error: null },
  });

  const result = await removeCloudSourcePackageUpload(client, {
    userId: "user-1",
    uploadId: "upload-a",
  });

  assert.equal(result.removed, 2);
  assert.equal(calls[0].prefix, "user-1/upload-a");
  assert.deepEqual(calls[1].paths, [
    "user-1/upload-a/a.md",
    "user-1/upload-a/b.zip",
  ]);
});

test("上传目录为空时不做删除动作", async () => {
  const { client, calls } = createFakeClient();

  const result = await removeCloudSourcePackageUpload(client, {
    userId: "user-1",
    uploadId: "upload-a",
  });

  assert.equal(result.removed, 0);
  assert.equal(calls.filter((call) => call.action === "remove").length, 0);
});
