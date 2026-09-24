import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDeliveryPack,
  buildKickoffPrompts,
  listPublicAssetRecommendations,
} from "../src/lib/project-kickoff.ts";

function createAsset(overrides = {}) {
  return {
    id: "rule-1",
    projectId: "default-project",
    assetType: "rule",
    title: "公共规则",
    summary: "",
    content: "正文",
    metadata: { ruleType: "must", scope: "project" },
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
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

test("推荐：硬约束规则优先，已经装过的不再推荐", () => {
  const must = createAsset({
    id: "rule-must",
    title: "必须跑测试",
    metadata: { ruleType: "must", scope: "project" },
  });
  const suggested = createAsset({
    id: "rule-suggested",
    title: "建议拆模块",
    metadata: { ruleType: "recommended", scope: "project" },
  });
  const installed = createAsset({
    id: "rule-installed-copy",
    title: "已经装过的规则",
    projectId: "project-a",
  });
  const recommendations = listPublicAssetRecommendations({
    assets: [suggested, must, installed],
    publicProjectId: "default-project",
    projectId: "project-a",
    level: "personal",
  });

  assert.equal(recommendations[0].asset.id, "rule-must");
  assert.match(recommendations[0].reason, /硬约束/);
  assert.ok(
    recommendations.every((item) => item.asset.id !== "rule-installed-copy"),
  );
});

test("推荐：模板会带上，公共库的实例文档不会往项目里推", () => {
  const template = createAsset({
    id: "template-1",
    assetType: "template",
    title: "实现规格（Spec）",
    metadata: { outputFileName: "implementation-spec.md", note: "" },
  });
  const referenceDoc = createAsset({
    id: "document-1",
    assetType: "document",
    title: "个人工具画像",
    metadata: { documentType: "参考资料" },
  });
  const instanceDoc = createAsset({
    id: "document-2",
    assetType: "document",
    title: "某次迭代的架构说明",
    metadata: { documentType: "架构说明" },
  });
  const recommendations = listPublicAssetRecommendations({
    assets: [template, referenceDoc, instanceDoc],
    publicProjectId: "default-project",
    projectId: "project-a",
    level: "personal",
  });
  const ids = recommendations.map((item) => item.asset.id);

  assert.ok(ids.includes("template-1"));
  assert.ok(ids.includes("document-1"));
  assert.equal(ids.includes("document-2"), false);
});

test("立项提示词：四份产物都在，内容带上项目名和项目说明", () => {
  const prompts = buildKickoffPrompts({
    projectName: "科创平台2.0",
    projectGoal: "打通数据链路",
    levelLabel: "低风险生产",
    stack: [{ name: "Next.js", version: "16" }],
  });

  assert.deepEqual(
    prompts.map((prompt) => prompt.key),
    ["prd", "spec", "tech", "acceptance"],
  );
  for (const prompt of prompts) {
    assert.match(prompt.prompt, /科创平台2\.0/);
    assert.match(prompt.prompt, /打通数据链路/);
    assert.match(prompt.prompt, /一次问完/);
  }
  assert.match(prompts[1].prompt, /数据结构与迁移/);
});

test("交付包：按规则、文档、模板分节，文件名带项目名", () => {
  const pack = buildDeliveryPack({
    projectName: "科创平台2.0",
    projectGoal: "打通数据链路",
    levelLabel: "低风险生产",
    stack: [{ name: "Next.js" }],
    projectId: "project-a",
    assets: [
      createAsset({ id: "rule-a", projectId: "project-a", title: "规则甲" }),
      createAsset({
        id: "document-a",
        projectId: "project-a",
        assetType: "document",
        title: "架构说明",
        metadata: { documentType: "架构说明" },
      }),
      createAsset({
        id: "template-a",
        projectId: "project-a",
        assetType: "template",
        title: "Spec 模板",
        metadata: { outputFileName: "spec.md", note: "" },
      }),
      // 别的项目的不进包
      createAsset({ id: "rule-other", projectId: "project-b", title: "别人的规则" }),
    ],
    now: "2026-09-24T00:00:00.000Z",
  });

  assert.match(pack.fileName, /开发体系包\.md$/);
  assert.match(pack.content, /## 一、规则/);
  assert.match(pack.content, /### 规则甲/);
  assert.match(pack.content, /## 二、文档/);
  assert.match(pack.content, /### 架构说明（架构说明）/);
  assert.match(pack.content, /## 三、模板/);
  assert.equal(pack.content.includes("别人的规则"), false);
  assert.equal(pack.files.length, 3);
});
