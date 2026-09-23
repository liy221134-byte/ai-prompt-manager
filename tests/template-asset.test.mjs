import assert from "node:assert/strict";
import test from "node:test";

import { isAssetData } from "../src/data/assets.ts";
import { compileRuleDrafts } from "../src/lib/rule-compile.ts";
import {
  buildAutoVariableValues,
  compileWithTemplate,
  listProjectTemplates,
  readTemplateVariables,
  resolveAutoVariable,
  resolveTemplateVariableValues,
  templateDraftToAsset,
  templateFileToDraft,
} from "../src/lib/template-asset.ts";

const now = "2026-09-23T10:00:00.000Z";

function createTemplateAsset(overrides = {}) {
  return {
    id: "template-agents",
    projectId: "project-a",
    assetType: "template",
    title: "AGENTS",
    summary: "",
    content: "# 项目规则\n\n## 产品规则\n\n{{在这里填写当前项目的产品规则}}\n",
    metadata: { outputFileName: "AGENTS.md", note: "" },
    source: {
      sourceType: "import",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: "AGENTS.md",
    },
    currentVersionId: "current-template-agents",
    status: "active",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createRulesDraft() {
  const rule = {
    id: "rule-1",
    projectId: "project-a",
    assetType: "rule",
    title: "提交前必须跑检查",
    summary: "",
    content: "提交前必须跑完整检查。",
    metadata: { ruleType: "must", scope: "project", level: "module" },
    source: {
      sourceType: "manual",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: "current-rule-1",
    status: "active",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: now,
    updatedAt: now,
  };

  return compileRuleDrafts({
    projectName: "资产库",
    rules: [rule],
    packTitles: {},
    excludedCount: 0,
    now,
  }).agents;
}

test("模板文件映射成模板资产草稿：文件名当标题和产物文件名", () => {
  const draft = templateFileToDraft({
    fileName: "templates/new-project/START_PROMPT.md",
    content: "# 开工提示\n\n项目名称：{{项目名称}}\n",
  });

  assert.equal(draft.title, "START_PROMPT");
  assert.equal(draft.summary, "开工提示");
  assert.equal(draft.metadata.outputFileName, "START_PROMPT.md");
  assert.equal(draft.content, "# 开工提示\n\n项目名称：{{项目名称}}");

  const asset = templateDraftToAsset({
    id: "template-start",
    projectId: "project-a",
    draft,
    originalFilename: "START_PROMPT.md",
    now,
  });

  assert.equal(isAssetData(asset), true);
  assert.equal(asset.assetType, "template");
  assert.equal(asset.source.sourceType, "import");
  assert.equal(asset.source.originalFilename, "START_PROMPT.md");
  assert.equal(asset.metadata.outputFileName, "START_PROMPT.md");
});

test("变量清单从正文实时解析，重复的只算一次", () => {
  const variables = readTemplateVariables(
    "# {{项目名称}}\n\n{{项目名称}}：{{一句话目标}}\n",
  );

  assert.deepEqual(variables, ["项目名称", "一句话目标"]);
  assert.deepEqual(readTemplateVariables("没有变量"), []);
});

test("自动变量只给项目名、项目说明和技术栈", () => {
  const values = buildAutoVariableValues({
    projectName: "资产库",
    projectGoal: "把文档整理成资产",
    techStack: "Next.js 16 / Supabase",
  });

  assert.equal(values.projectName, "资产库");
  assert.equal(values.projectGoal, "把文档整理成资产");
  assert.equal(values.techStack, "Next.js 16 / Supabase");

  // 变量名写法不统一时按关键词识别
  assert.equal(resolveAutoVariable("项目名称"), "projectName");
  assert.equal(
    resolveAutoVariable("一句话说明这个项目解决什么问题"),
    "projectGoal",
  );
  assert.equal(resolveAutoVariable("技术栈"), "techStack");
  assert.equal(resolveAutoVariable("谁使用这个产品"), null);

  const resolved = resolveTemplateVariableValues(
    ["项目名称", "一句话目标", "谁使用这个产品", "规则集"],
    values,
  );
  assert.deepEqual(resolved.resolved, {
    项目名称: "资产库",
    一句话目标: "把文档整理成资产",
  });
  assert.deepEqual(resolved.pending, ["谁使用这个产品"]);
});

test("套模板生成产物：自动变量填好，规则插进占位符，待填变量列出来", () => {
  const template = createTemplateAsset({
    content: [
      "# {{项目名称}} 规则",
      "",
      "> {{一句话说明这个项目解决的问题}}",
      "",
      "## 技术栈",
      "",
      "{{技术栈}}",
      "",
      "## 规则",
      "",
      "{{规则集}}",
      "",
      "## 产品规则",
      "",
      "{{在这里填写当前项目的产品规则}}",
      "",
    ].join("\n"),
  });
  const result = compileWithTemplate({
    template,
    projectName: "资产库",
    projectGoal: "把文档整理成资产",
    techStack: "Next.js 16 / Supabase",
    rulesDraft: createRulesDraft(),
    now,
  });

  assert.equal(result.fileName, "AGENTS.md");
  assert.equal(result.usedTemplate, true);
  assert.equal(result.rulesAppended, false);
  assert.match(result.content, /^# 资产库 规则/m);
  assert.match(result.content, /> 把文档整理成资产/);
  assert.match(result.content, /Next\.js 16 \/ Supabase/);
  assert.match(result.content, /## 模块/);
  assert.match(result.content, /\*\*提交前必须跑检查\*\*：提交前必须跑完整检查。/);
  assert.match(result.content, /由 AI 提示词资产管理工具生成（v2\.3\.0）/);
  assert.deepEqual(result.filledVariables, ["项目名称", "一句话说明这个项目解决的问题", "技术栈"]);
  assert.deepEqual(result.pendingVariables, ["在这里填写当前项目的产品规则"]);
});

test("模板里没写规则集占位符时，规则追加到产物末尾并注明", () => {
  const template = createTemplateAsset({
    content: "# {{项目名称}} 开工提示\n\n目标：{{一句话目标}}\n",
  });
  const result = compileWithTemplate({
    template,
    projectName: "资产库",
    projectGoal: "把文档整理成资产",
    techStack: "",
    rulesDraft: createRulesDraft(),
    now,
  });

  assert.equal(result.rulesAppended, true);
  assert.match(result.content, /## 规则（由编译追加）/);
  assert.match(result.content, /\*\*提交前必须跑检查\*\*/);
  assert.deepEqual(result.pendingVariables, []);
});

test("项目里只列活跃且未进垃圾箱的模板", () => {
  const assets = [
    createTemplateAsset({ id: "template-a", title: "A 模板" }),
    createTemplateAsset({ id: "template-b", title: "B 模板", status: "draft" }),
    createTemplateAsset({
      id: "template-c",
      title: "C 模板",
      projectId: "project-b",
    }),
    createTemplateAsset({
      id: "template-d",
      title: "D 模板",
      deletedAt: now,
      deletedReason: "manual",
    }),
    createTemplateAsset({ id: "doc-1", assetType: "document", metadata: { documentType: "PRD" } }),
  ];

  assert.deepEqual(
    listProjectTemplates(assets, "project-a").map((asset) => asset.id),
    ["template-a"],
  );
});
