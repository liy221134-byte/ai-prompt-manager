import assert from "node:assert/strict";
import test from "node:test";

import {
  SOURCE_PACKAGE_UPLOAD_LIMITS,
  detectSourcePackageKind,
  sanitizeSourcePackageFilename,
  validateSourcePackageFile,
} from "../src/lib/source-package-upload.ts";

const zipHead = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const notZipHead = new Uint8Array([0x23, 0x20, 0x2d, 0x2d, 0x20]);

test("按扩展名识别 Markdown、纯文本和 ZIP", () => {
  assert.equal(detectSourcePackageKind("说明.md"), "markdown");
  assert.equal(detectSourcePackageKind("README.MARKDOWN"), "markdown");
  assert.equal(detectSourcePackageKind("笔记.txt"), "text");
  assert.equal(detectSourcePackageKind("文档包.zip"), "zip");
  assert.equal(detectSourcePackageKind("截图.png"), null);
  assert.equal(detectSourcePackageKind("没有扩展名"), null);
});

test("文件名去掉目录和危险字符，避免写到来源目录之外", () => {
  assert.equal(sanitizeSourcePackageFilename("文档.md"), "文档.md");
  assert.equal(sanitizeSourcePackageFilename("../../etc/passwd"), "passwd");
  assert.equal(sanitizeSourcePackageFilename("C:\\windows\\a.txt"), "a.txt");
  assert.equal(sanitizeSourcePackageFilename("a<b>c?.md"), "a_b_c_.md");
  assert.equal(sanitizeSourcePackageFilename("...隐藏.md"), "隐藏.md");
  assert.equal(sanitizeSourcePackageFilename("CON.md"), "_CON.md");
  assert.equal(sanitizeSourcePackageFilename("   "), "未命名文件");
});

test("只接受 Markdown、纯文本和 ZIP", () => {
  const rejected = validateSourcePackageFile({
    filename: "图片.png",
    byteSize: 1024,
  });

  assert.equal(rejected.ok, false);
  assert.match(rejected.message, /只支持 Markdown、纯文本和 ZIP/);
});

test("空文件被拒绝", () => {
  const rejected = validateSourcePackageFile({ filename: "空.md", byteSize: 0 });

  assert.equal(rejected.ok, false);
  assert.match(rejected.message, /空文件|文件是空的/);
});

test("ZIP 超过 20 MB 被拒绝", () => {
  const rejected = validateSourcePackageFile({
    filename: "大包.zip",
    byteSize: SOURCE_PACKAGE_UPLOAD_LIMITS.zipBytes + 1,
    head: zipHead,
  });

  assert.equal(rejected.ok, false);
  assert.match(rejected.message, /20 MB/);
});

test("后缀是 zip 但内容不是压缩包会被拒绝", () => {
  const rejected = validateSourcePackageFile({
    filename: "假装是包.zip",
    byteSize: 2048,
    head: notZipHead,
  });

  assert.equal(rejected.ok, false);
  assert.match(rejected.message, /不是有效的 ZIP/);
});

test("文本文件超过 5 MB 被拒绝", () => {
  const rejected = validateSourcePackageFile({
    filename: "很长的笔记.txt",
    byteSize: SOURCE_PACKAGE_UPLOAD_LIMITS.textBytes + 1,
  });

  assert.equal(rejected.ok, false);
  assert.match(rejected.message, /5 MB/);
});

test("合规文件通过校验并带回清洗后的文件名", () => {
  const markdown = validateSourcePackageFile({
    filename: "设计说明.md",
    byteSize: 2048,
  });
  assert.equal(markdown.ok, true);
  assert.equal(markdown.kind, "markdown");
  assert.equal(markdown.filename, "设计说明.md");

  const zip = validateSourcePackageFile({
    filename: "文档包.zip",
    byteSize: 1024 * 1024,
    head: zipHead,
  });
  assert.equal(zip.ok, true);
  assert.equal(zip.kind, "zip");

  const text = validateSourcePackageFile({
    filename: "../说明.txt",
    byteSize: 1024,
  });
  assert.equal(text.ok, true);
  assert.equal(text.filename, "说明.txt");
});

test("刚好达到上限的文件可以通过", () => {
  const zip = validateSourcePackageFile({
    filename: "刚好.zip",
    byteSize: SOURCE_PACKAGE_UPLOAD_LIMITS.zipBytes,
    head: zipHead,
  });
  assert.equal(zip.ok, true);

  const text = validateSourcePackageFile({
    filename: "刚好.txt",
    byteSize: SOURCE_PACKAGE_UPLOAD_LIMITS.textBytes,
  });
  assert.equal(text.ok, true);
});
