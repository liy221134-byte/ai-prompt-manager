import assert from "node:assert/strict";
import test from "node:test";

import {
  listPromoteSuggestions,
  suggestSedimentScope,
} from "../src/lib/sediment-scope.ts";

function createAsset(overrides = {}) {
  return {
    id: "rule-1",
    projectId: "project-a",
    assetType: "rule",
    title: "规则",
    summary: "",
    content: "正文",
    metadata: { ruleType: "must", scope: "project" },
    source: {
      sourceType: "manual",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: "current-1",
    status: "active",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

test("讲通用约束的建议升公共", () => {
  const suggestion = suggestSedimentScope({
    asset: createAsset({
      title: "密钥管理",
      content: "密钥只放环境变量，任何项目都不得写进仓库。",
    }),
    projectName: "科创平台2.0",
  });

  assert.equal(suggestion.scope, "public");
  assert.match(suggestion.reason, /通用约束/);
});

test("点名了本项目的建议留在项目", () => {
  const suggestion = suggestSedimentScope({
    asset: createAsset({
      content: "科创平台2.0 这个项目必须每两周做一次迁移演练。",
    }),
    projectName: "科创平台2.0",
  });

  assert.equal(suggestion.scope, "project");
  assert.match(suggestion.reason, /科创平台2\.0/);
});

test("带版本号或本机路径的建议留在项目", () => {
  const version = suggestSedimentScope({
    asset: createAsset({ content: "v2.15.0 上线前必须导出一次备份。" }),
    projectName: "科创平台2.0",
  });
  const path = suggestSedimentScope({
    asset: createAsset({ content: "把 E:\\codeX项目\\.data 三个文件一起复制。" }),
    projectName: "科创平台2.0",
  });

  assert.equal(version.scope, "project");
  assert.equal(path.scope, "project");
});

test("看不出通用性的先留在项目里，并说清理由", () => {
  const suggestion = suggestSedimentScope({
    asset: createAsset({ title: "张三的偏好", content: "写周报时先列结论。" }),
    projectName: "科创平台2.0",
  });

  assert.equal(suggestion.scope, "project");
  assert.match(suggestion.reason, /看不出通用性/);
});

test("批量分流只挑建议升公共的", () => {
  const suggestions = listPromoteSuggestions({
    assets: [
      createAsset({
        id: "rule-universal",
        content: "提交前必须跑一次自动化测试，任何项目都一样。",
      }),
      createAsset({ id: "rule-local", content: "v2.15.0 上线前导一次备份。" }),
    ],
    projectName: "科创平台2.0",
  });

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].asset.id, "rule-universal");
});
