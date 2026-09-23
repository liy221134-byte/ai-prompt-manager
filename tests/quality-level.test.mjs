import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { documentTypeOptions } from "../src/lib/asset-list.ts";
import {
  engineeringDocumentKeys,
  engineeringDocuments,
  listDocumentGaps,
  listRequiredDocuments,
  qualityLevelProfiles,
  readQualityProfile,
  summarizeDocumentGaps,
} from "../src/lib/quality-level.ts";

const templateDir = new URL("../templates/engineering/", import.meta.url);
const now = "2026-09-23T12:00:00.000Z";

function createDocument(overrides = {}) {
  const { metadata, ...rest } = overrides;

  return {
    id: "document-1",
    projectId: "project-a",
    assetType: "document",
    title: "某个文档",
    summary: "",
    content: "正文",
    metadata: {
      documentType: "参考资料",
      ...metadata,
    },
    source: {
      sourceType: "manual",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: "current-document-1",
    status: "active",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: now,
    updatedAt: now,
    ...rest,
  };
}

test("四档等级都有要求清单，等级越高要求越多", () => {
  const personal = qualityLevelProfiles.personal;
  const lowRisk = qualityLevelProfiles.low_risk;
  const userData = qualityLevelProfiles.user_data;
  const highSensitive = qualityLevelProfiles.high_sensitive;

  assert.equal(personal.label, "个人工具");
  assert.equal(highSensitive.label, "高敏感项目");

  // 每一档都包含上一档的文档要求
  for (const key of personal.documents) {
    assert.ok(lowRisk.documents.includes(key), `${key} 应该被低风险生产继承`);
    assert.ok(userData.documents.includes(key), `${key} 应该被涉及用户数据继承`);
  }

  assert.ok(userData.documents.includes("security"));
  assert.equal(highSensitive.documents.length, engineeringDocumentKeys.length);
  assert.ok(highSensitive.releaseChecks.length > personal.releaseChecks.length);
});

test("等级不认识时按个人工具处理", () => {
  assert.equal(readQualityProfile("乱写的等级").level, "personal");
  assert.equal(readQualityProfile(undefined).level, "personal");
  assert.equal(readQualityProfile("user_data").level, "user_data");
});

test("每份要求文档都对应仓库里的模板文件，标题和文件一级标题一致", () => {
  const files = readdirSync(templateDir);

  for (const [key, document] of Object.entries(engineeringDocuments)) {
    assert.ok(
      files.includes(document.templateFile),
      `${key} 指向的模板文件 ${document.templateFile} 不存在`,
    );

    const content = readFileSync(
      new URL(document.templateFile, templateDir),
      "utf8",
    );
    const heading = content.split("\n").find((line) => line.startsWith("# "));

    assert.equal(heading, `# ${document.title}`);
  }
});

test("每份要求文档的文档类型都能在编辑器下拉里选到", () => {
  for (const document of Object.values(engineeringDocuments)) {
    assert.ok(
      documentTypeOptions.includes(document.documentType),
      `${document.title} 的文档类型「${document.documentType}」不在编辑器选项里`,
    );
  }
});

test("缺口对照：文档类型对得上或标题一样就算已有", () => {
  const assets = [
    createDocument({
      id: "document-arch",
      title: "我们项目的架构",
      metadata: { documentType: "架构说明" },
    }),
    createDocument({
      id: "document-env",
      title: "环境变量清单",
      metadata: { documentType: "参考资料" },
    }),
  ];
  const gaps = listDocumentGaps({
    level: "personal",
    assets,
    projectId: "project-a",
  });

  assert.deepEqual(
    gaps.map((gap) => [gap.document.key, gap.satisfied]),
    [
      ["architecture", true],
      ["environment_variables", true],
    ],
  );
  assert.equal(gaps[0].assetId, "document-arch");
  assert.equal(gaps[1].assetTitle, "环境变量清单");
  assert.deepEqual(summarizeDocumentGaps(gaps), {
    total: 2,
    satisfied: 2,
    missing: 0,
  });
});

test("缺口对照：草稿、归档、垃圾箱、别的项目和非文档资产都不算已有", () => {
  const assets = [
    createDocument({
      id: "document-draft",
      title: "架构与请求链路",
      status: "draft",
      metadata: { documentType: "架构说明" },
    }),
    createDocument({
      id: "document-archived",
      title: "架构与请求链路",
      status: "archived",
      metadata: { documentType: "架构说明" },
    }),
    createDocument({
      id: "document-trashed",
      title: "架构与请求链路",
      deletedAt: now,
      metadata: { documentType: "架构说明" },
    }),
    createDocument({
      id: "document-other-project",
      projectId: "project-b",
      title: "架构与请求链路",
      metadata: { documentType: "架构说明" },
    }),
    {
      ...createDocument({ id: "asset-rule", title: "架构说明" }),
      assetType: "rule",
      metadata: { ruleType: "must", scope: "project" },
    },
  ];
  const gaps = listDocumentGaps({
    level: "high_sensitive",
    assets,
    projectId: "project-a",
  });

  assert.equal(gaps.length, engineeringDocumentKeys.length);
  assert.ok(gaps.every((gap) => !gap.satisfied));
  assert.equal(summarizeDocumentGaps(gaps).missing, engineeringDocumentKeys.length);
});

test("要求清单里的文档顺序稳定，先基础后专项", () => {
  const titles = listRequiredDocuments("user_data").map(
    (document) => document.title,
  );

  assert.deepEqual(titles, [
    "架构与请求链路",
    "数据流",
    "环境变量清单",
    "发布与回滚",
    "备份与恢复",
    "安全检查",
  ]);
});
