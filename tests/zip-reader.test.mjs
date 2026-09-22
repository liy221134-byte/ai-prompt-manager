import assert from "node:assert/strict";
import test from "node:test";

import { ZIP_READ_LIMITS, readZipEntries, readZipTextEntries } from "../src/lib/zip-reader.ts";
import { buildZip } from "./zip-fixture.mjs";

const encode = (text) => new TextEncoder().encode(text);

test("能读出压缩和不压缩两种条目", () => {
  const zip = buildZip([
    { name: "说明.md", content: encode("# 设计说明") },
    { name: "笔记.txt", content: encode("纯文本内容"), store: true },
  ]);

  const entries = readZipEntries(zip);

  assert.deepEqual(
    entries.map((entry) => entry.name),
    ["说明.md", "笔记.txt"],
  );
  assert.equal(new TextDecoder().decode(entries[0].bytes), "# 设计说明");
  assert.equal(new TextDecoder().decode(entries[1].bytes), "纯文本内容");
});

test("只取文本文档，跳过图片和目录项", () => {
  const zip = buildZip([
    { name: "docs/", content: new Uint8Array(0) },
    { name: "docs/需求.md", content: encode("需求正文") },
    { name: "docs/截图.png", content: new Uint8Array([1, 2, 3]) },
    { name: "说明.TXT", content: encode("大写扩展名") },
  ]);

  const entries = readZipTextEntries(zip);

  assert.deepEqual(
    entries.map((entry) => entry.name),
    ["docs/需求.md", "说明.TXT"],
  );
});

test("不是 ZIP 的文件会被拒绝", () => {
  assert.throws(() => readZipEntries(encode("这只是一段文本，不是压缩包")), /不是有效的 ZIP/);
});

test("条目数超限会被拒绝", () => {
  const many = Array.from({ length: ZIP_READ_LIMITS.maxEntries + 1 }, (_, index) => ({
    name: `f${index}.md`,
    content: encode("x"),
    store: true,
  }));

  assert.throws(() => readZipEntries(buildZip(many)), /文件太多/);
});

test("单个条目解压后超限会被拒绝", () => {
  const big = new Uint8Array(ZIP_READ_LIMITS.maxEntryBytes + 1);
  const zip = buildZip([{ name: "大文件.md", content: big, store: true }]);

  assert.throws(() => readZipEntries(zip), /单文件上限/);
});
