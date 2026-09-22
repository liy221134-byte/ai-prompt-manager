import assert from "node:assert/strict";
import test from "node:test";

import {
  SOURCE_PACKAGE_MAX_ASSETS,
  applySourcePackageDraftEdits,
  checkSourcePackageDraftLimit,
  normalizeSourcePackageDraft,
  splitSourcePackageDraftItem,
} from "../src/lib/source-package-draft.ts";
import {
  SOURCE_PACKAGE_TEXT_LIMITS,
  extractSourcePackageText,
  limitSourcePackageText,
} from "../src/lib/source-package-text.ts";
import { buildZip } from "./zip-fixture.mjs";

const encode = (text) => new TextEncoder().encode(text);

function createDraft() {
  return {
    project: { name: "导入的项目", goal: "整理成资产" },
    items: [
      {
        id: "draft-1",
        sourceFilename: "需求.md",
        assetType: "document",
        title: "需求说明",
        summary: "一句话",
        content: "需求正文",
        reason: "看起来像文档",
      },
      {
        id: "draft-2",
        sourceFilename: "规范.md",
        assetType: "rule",
        title: "提交规范",
        summary: "",
        content: "提交前必须跑检查",
        reason: "包含强制要求",
      },
    ],
    skipped: [],
  };
}

test("Markdown 和纯文本直接解码，并去掉 BOM", () => {
  const documents = extractSourcePackageText({
    filename: "说明.md",
    bytes: encode("\uFEFF# 标题\n正文"),
  });

  assert.deepEqual(documents, [{ filename: "说明.md", text: "# 标题\n正文" }]);
});

test("ZIP 按条目取出文本文档，忽略其他类型", () => {
  const zip = buildZip([
    { name: "docs/需求.md", content: encode("需求正文") },
    { name: "docs/图.png", content: new Uint8Array([1, 2]) },
  ]);

  const documents = extractSourcePackageText({ filename: "包.zip", bytes: zip });

  assert.deepEqual(documents, [{ filename: "docs/需求.md", text: "需求正文" }]);
});

test("文档包里没有文本文件时给出明确提示", () => {
  const zip = buildZip([{ name: "图.png", content: new Uint8Array([1, 2]) }]);

  assert.throws(
    () => extractSourcePackageText({ filename: "包.zip", bytes: zip }),
    /没有可识别的 Markdown 或文本文件/,
  );
});

test("单个文件或整包内容过长会被拦下", () => {
  assert.throws(
    () =>
      limitSourcePackageText([
        {
          filename: "很长.md",
          text: "x".repeat(SOURCE_PACKAGE_TEXT_LIMITS.perFileChars + 1),
        },
      ]),
    /内容过长/,
  );

  const many = Array.from(
    { length: (SOURCE_PACKAGE_TEXT_LIMITS.totalChars / 30000) + 2 },
    (_, index) => ({ filename: `f${index}.md`, text: "x".repeat(30000) }),
  );

  assert.throws(() => limitSourcePackageText(many), /总量过大/);
});

test("解析 AI 草稿：支持代码块包裹、类型兜底、缺正文归入未识别", () => {
  const content = [
    "```json",
    JSON.stringify({
      project: { name: "资产库导入", goal: "把文档变成资产" },
      items: [
        {
          sourceFilename: "需求.md",
          assetType: "document",
          title: "需求说明",
          summary: "一句话",
          content: "需求正文",
          reason: "像文档",
        },
        {
          sourceFilename: "规范.md",
          assetType: "不认识的类型",
          title: "规范",
          content: "必须遵守",
        },
        { sourceFilename: "空文件.md", assetType: "document", content: "" },
      ],
      skipped: [{ sourceFilename: "图.png", reason: "二进制图片" }],
    }),
    "```",
  ].join("\n");

  const draft = normalizeSourcePackageDraft(content);

  assert.equal(draft.project.name, "资产库导入");
  assert.equal(draft.items.length, 2);
  assert.equal(draft.items[0].assetType, "document");
  // 认不出来的类型统一按文档处理，不会凭空造出新类型
  assert.equal(draft.items[1].assetType, "document");
  assert.equal(draft.items[1].title, "规范");
  assert.equal(draft.skipped.length, 2);
  assert.match(draft.skipped[1].reason, /没有给出正文/);
  assert.deepEqual(
    draft.items.map((item) => item.id),
    ["draft-1", "draft-2"],
  );
});

test("AI 草稿不是 JSON 或没有内容时抛中文错误", () => {
  assert.throws(() => normalizeSourcePackageDraft("这不是 JSON"), /不是有效的 JSON/);
  assert.throws(
    () => normalizeSourcePackageDraft(JSON.stringify({ items: [] })),
    /没有识别出任何可用内容/,
  );
});

test("预览里的跳过、改类型和合并会落成新草稿", () => {
  const draft = createDraft();

  const edited = applySourcePackageDraftEdits(draft, {
    removedIds: ["draft-2"],
    typeOverrides: { "draft-1": "rule" },
  });

  assert.deepEqual(edited.items.map((item) => item.id), ["draft-1"]);
  assert.equal(edited.items[0].assetType, "rule");

  const merged = applySourcePackageDraftEdits(draft, {
    merges: [{ targetId: "draft-1", sourceIds: ["draft-2"] }],
  });

  assert.equal(merged.items.length, 1);
  assert.equal(merged.items[0].title, "需求说明");
  assert.match(merged.items[0].content, /需求正文/);
  assert.match(merged.items[0].content, /## 提交规范/);
  assert.match(merged.items[0].content, /提交前必须跑检查/);
});

test("确认创建前会检查数量和空草稿", () => {
  assert.match(checkSourcePackageDraftLimit({ ...createDraft(), items: [] }), /至少要保留一条/);

  const tooMany = {
    ...createDraft(),
    items: Array.from({ length: SOURCE_PACKAGE_MAX_ASSETS + 1 }, (_, index) => ({
      ...createDraft().items[0],
      id: `draft-${index}`,
    })),
  };
  assert.match(checkSourcePackageDraftLimit(tooMany), /最多创建 200 条/);

  assert.equal(checkSourcePackageDraftLimit(createDraft()), null);
});

test("按二级标题把一条草稿拆成多条", () => {
  const draft = createDraft();
  draft.items[0] = {
    ...draft.items[0],
    content: "## 背景\n\n背景内容\n\n## 目标\n\n目标内容",
  };

  const { draft: split, message } = splitSourcePackageDraftItem(draft, "draft-1");

  assert.equal(split.items.length, 3);
  assert.equal(split.items[0].title, "背景");
  assert.equal(split.items[0].content, "背景内容");
  assert.equal(split.items[1].title, "目标");
  // 原条目被替换掉，其余草稿位置不变
  assert.equal(split.items[2].id, "draft-2");
  assert.match(message, /已拆成 2 条/);
});

test("没有两个小标题时拆分不动，并说明原因", () => {
  const draft = createDraft();

  const { draft: unchanged, message } = splitSourcePackageDraftItem(draft, "draft-1");

  assert.equal(unchanged, draft);
  assert.match(message, /没有两个以上的 ## 小标题/);
});
