import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPILE_GENERATOR_VERSION,
  compileRuleDrafts,
  listCompileCandidates,
  listConflictCandidates,
  readCompileDecision,
  readCompileTargets,
} from "../src/lib/rule-compile.ts";

const now = "2026-09-23T08:30:00.000Z";

// 规则适用的项目规模存在 pack 链接里——那是这条规则自己声明的规模，同一个包里每条可以不一样
function packWithScale(scales) {
  return {
    packId: "pack-a",
    packItemId: "item-1",
    packVersion: "0.1.0",
    packAssetType: "method",
    projectScale: scales,
  };
}

function createRule(overrides = {}) {
  return {
    id: "rule-1",
    projectId: "project-a",
    assetType: "rule",
    title: "提交前必须跑检查",
    summary: "",
    content: "提交前必须跑完整检查。\n\n补充说明。",
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
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test("默认编译去向是 AGENTS.md，标了 none 的规则不进任何草稿", () => {
  assert.deepEqual(readCompileTargets({}), ["agents"]);
  assert.deepEqual(readCompileTargets({ compileTarget: [] }), ["agents"]);
  assert.deepEqual(readCompileTargets({ compileTarget: ["none"] }), ["none"]);
});

test("候选集按活跃状态和裁决结果分流，并给出排除原因", () => {
  const assets = [
    createRule({ id: "rule-active", title: "活跃规则" }),
    createRule({ id: "rule-draft", title: "草稿规则", status: "draft" }),
    createRule({
      id: "rule-none",
      title: "标记不编译",
      metadata: { ruleType: "must", scope: "project", compileTarget: ["none"] },
    }),
    createRule({
      id: "rule-excluded",
      title: "裁决排除",
      metadata: {
        ruleType: "must",
        scope: "project",
        compileDecision: {
          decision: "excluded",
          note: "和上一条重复",
          decidedAt: now,
        },
      },
    }),
    createRule({
      id: "rule-trashed",
      title: "垃圾箱里的规则",
      deletedAt: now,
      deletedReason: "manual",
    }),
    createRule({ id: "rule-other-project", projectId: "project-b" }),
    createRule({ id: "document-a", assetType: "document", metadata: { documentType: "PRD" } }),
  ];
  const candidates = listCompileCandidates(assets, "project-a");

  assert.deepEqual(
    candidates.included.map((candidate) => candidate.rule.id),
    ["rule-active"],
  );
  assert.deepEqual(
    candidates.excluded.map((item) => [item.rule.id, item.reason]),
    [
      ["rule-draft", "不是活跃状态"],
      ["rule-none", "标记为不参与编译"],
      ["rule-excluded", "你已裁决不参与编译"],
    ],
  );
});

test("技术上下文参与筛选：有交集就收，一项都对不上才排除", () => {
  const assets = [
    createRule({
      id: "rule-next",
      title: "Next 专用",
      metadata: { ruleType: "must", scope: "project", techContext: ["nextjs"] },
    }),
    createRule({
      id: "rule-db",
      title: "库专用",
      metadata: {
        ruleType: "must",
        scope: "project",
        techContext: ["supabase"],
      },
    }),
    createRule({
      id: "rule-both",
      title: "两项技术",
      metadata: {
        ruleType: "must",
        scope: "project",
        techContext: ["nextjs", "supabase"],
      },
    }),
    createRule({
      id: "rule-generic",
      title: "通用",
      metadata: { ruleType: "must", scope: "project", techContext: ["generic"] },
    }),
    createRule({ id: "rule-none", title: "没标技术" }),
  ];

  const filtered = listCompileCandidates(assets, "project-a", [], ["nextjs"]);

  assert.deepEqual(
    filtered.included.map((candidate) => candidate.rule.id).sort(),
    ["rule-both", "rule-generic", "rule-next", "rule-none"],
  );
  assert.deepEqual(
    filtered.excluded.map((item) => [item.rule.id, item.reason]),
    [
      [
        "rule-db",
        "技术上下文对不上：这条规则是 supabase，这个项目的技术栈是 nextjs",
      ],
    ],
  );
});

test("项目技术上下文为空时不筛：所有活跃规则照旧进候选", () => {
  const assets = [
    createRule({
      id: "rule-db",
      title: "库专用",
      metadata: {
        ruleType: "must",
        scope: "project",
        techContext: ["supabase"],
      },
    }),
  ];

  assert.equal(listCompileCandidates(assets, "project-a").included.length, 1);
  assert.equal(
    listCompileCandidates(assets, "project-a", [], []).included.length,
    1,
  );
});

test("项目规模参与筛选：有交集就收，一项都对不上才排除", () => {
  const assets = [
    createRule({
      id: "rule-large",
      title: "只给大型平台",
      metadata: {
        ruleType: "must",
        scope: "project",
        pack: packWithScale(["large"]),
      },
    }),
    createRule({
      id: "rule-medium",
      title: "给中型产品",
      metadata: {
        ruleType: "must",
        scope: "project",
        pack: packWithScale(["medium"]),
      },
    }),
    createRule({ id: "rule-any", title: "没标规模" }),
  ];

  const filtered = listCompileCandidates(
    assets,
    "project-a",
    [],
    [],
    ["personal"],
  );

  assert.deepEqual(
    filtered.included.map((candidate) => candidate.rule.id).sort(),
    ["rule-any"],
  );
  assert.deepEqual(
    filtered.excluded.map((item) => [item.rule.id, item.reason]),
    [
      [
        "rule-large",
        "项目规模对不上：这条规则适用于 大型平台，这个项目是 个人工具",
      ],
      [
        "rule-medium",
        "项目规模对不上：这条规则适用于 中型云端产品，这个项目是 个人工具",
      ],
    ],
  );
});

test("项目规模为空时不筛；规则标了多项规模时有一项对上就收", () => {
  const assets = [
    createRule({
      id: "rule-both",
      title: "个人和中型都适用",
      metadata: {
        ruleType: "must",
        scope: "project",
        pack: packWithScale(["personal", "medium"]),
      },
    }),
    createRule({
      id: "rule-large",
      title: "只给大型平台",
      metadata: {
        ruleType: "must",
        scope: "project",
        pack: packWithScale(["large"]),
      },
    }),
  ];

  // 不传规模 = 不筛
  assert.equal(listCompileCandidates(assets, "project-a").included.length, 2);

  const filtered = listCompileCandidates(
    assets,
    "project-a",
    [],
    [],
    ["personal"],
  );

  assert.deepEqual(
    filtered.included.map((candidate) => candidate.rule.id),
    ["rule-both"],
  );
});

test("候选集按作用层级分组，未填层级排在最后", () => {
  const assets = [
    createRule({
      id: "rule-module",
      title: "模块规则",
      metadata: { ruleType: "must", scope: "project", level: "module" },
    }),
    createRule({
      id: "rule-global",
      title: "全局规则",
      metadata: { ruleType: "must", scope: "global", level: "global" },
    }),
    createRule({ id: "rule-plain", title: "没填层级" }),
  ];
  const candidates = listCompileCandidates(assets, "project-a");

  assert.deepEqual(
    candidates.groups.map((group) => group.label),
    ["全局", "模块", "未填层级"],
  );
  assert.deepEqual(
    candidates.groups.map((group) => group.rules.map((rule) => rule.id)),
    [["rule-global"], ["rule-module"], ["rule-plain"]],
  );
});

test("冲突候选只列维度重叠的规则，并写明重叠在哪", () => {
  const assets = [
    createRule({
      id: "rule-a",
      title: "模块内必须写测试",
      metadata: {
        ruleType: "must",
        scope: "project",
        level: "module",
        techContext: ["nextjs"],
      },
    }),
    createRule({
      id: "rule-b",
      title: "小改动不许写测试",
      metadata: {
        ruleType: "forbidden",
        scope: "project",
        level: "module",
        techContext: ["nextjs"],
      },
    }),
    createRule({
      id: "rule-c",
      title: "另一层级的技术约束",
      metadata: {
        ruleType: "technology",
        scope: "task",
        level: "code",
        techContext: ["supabase"],
      },
    }),
    createRule({
      id: "rule-d",
      title: "毫不相关的建议",
      metadata: {
        ruleType: "recommended",
        scope: "task",
        level: "code",
        techContext: ["supabase"],
      },
    }),
  ];
  const candidates = listConflictCandidates(assets);

  // 只有「必须 × 禁止」这一对是高置信候选；同样重叠但方向不相反的不列出来
  assert.equal(candidates.length, 1);
  assert.deepEqual(
    [candidates[0].left.id, candidates[0].right.id],
    ["rule-a", "rule-b"],
  );
  assert.ok(
    candidates[0].sharedDimensions.includes("同一层级上一条「必须」一条「禁止」"),
  );
  assert.ok(candidates[0].sharedDimensions.includes("作用层级：模块"));
});

test("生成的 AGENTS.md 带头部、分组、理由和来源，排除的规则不出现", () => {
  const packTitles = { "rule-pack-a": "工程方法种子资产包" };
  const rules = [
    createRule({
      id: "rule-must",
      title: "接口契约与数据所有权",
      content: "每类数据必须有唯一写入方。",
      metadata: {
        ruleType: "must",
        scope: "project",
        level: "module",
        rationale: "曾经因为共享表变更出过事故",
        confidence: "provisional",
        verification: "门禁检查",
        pack: {
          packId: "rule-pack-a",
          packItemId: "RULE-BOUNDARY-001",
          packVersion: "0.2.1",
          packAssetType: "rule",
          projectScale: ["personal"],
        },
      },
    }),
    createRule({
      id: "rule-should",
      title: "建议先写失败用例",
      content: "先写失败用例再改代码。",
      metadata: {
        ruleType: "recommended",
        scope: "project",
        level: "module",
      },
    }),
    createRule({
      id: "rule-start-only",
      title: "只在开工提示里出现",
      content: "开工前先读需求。",
      metadata: {
        ruleType: "must",
        scope: "project",
        level: "module",
        compileTarget: ["start_prompt"],
      },
    }),
  ];
  const drafts = compileRuleDrafts({
    projectName: "资产库",
    rules,
    packTitles,
    excludedCount: 3,
    profileSummary: "技术档案：Next.js 16 / Supabase",
    now,
  });

  assert.equal(drafts.agents.fileName, "AGENTS.md");
  assert.match(drafts.agents.content, /^# AGENTS\.md/);
  assert.match(
    drafts.agents.content,
    new RegExp(`由 AI 提示词资产管理工具生成（${COMPILE_GENERATOR_VERSION}）`),
  );
  assert.match(drafts.agents.content, /来源项目：资产库 · 参与编译 2 条 · 已排除 3 条/);
  assert.match(drafts.agents.content, /技术档案：Next\.js 16 \/ Supabase/);
  assert.match(drafts.agents.content, /## 模块/);
  assert.match(drafts.agents.content, /### 必须/);
  assert.match(drafts.agents.content, /### 建议/);
  assert.match(drafts.agents.content, /\*\*接口契约与数据所有权\*\*：每类数据必须有唯一写入方。/);
  assert.match(drafts.agents.content, /理由：曾经因为共享表变更出过事故/);
  assert.match(
    drafts.agents.content,
    /来源：工程方法种子资产包（包内编号 RULE-BOUNDARY-001） · 可信度：暂时验证/,
  );
  assert.match(drafts.agents.content, /验证方式：门禁检查/);

  // 只标了 start_prompt 的规则不进 AGENTS.md
  assert.equal(drafts.agents.content.includes("只在开工提示里出现"), false);

  assert.equal(drafts.startPrompt.fileName, "START_PROMPT.md");
  assert.match(drafts.startPrompt.content, /只列「必须」和「禁止」/);
  assert.match(drafts.startPrompt.content, /## 必须/);
  assert.match(drafts.startPrompt.content, /只在开工提示里出现/);
  // 建议类不进开工提示
  assert.equal(drafts.startPrompt.content.includes("建议先写失败用例"), false);
});

test("裁决结果能读回来，坏数据按没裁决处理", () => {
  const decision = {
    decision: "excluded",
    note: "重复",
    decidedAt: now,
  };

  assert.deepEqual(readCompileDecision({ compileDecision: decision }), decision);
  assert.equal(readCompileDecision({}), null);
  assert.equal(
    readCompileDecision({ compileDecision: { decision: "不知道" } }),
    null,
  );
});

test("规则正文只有标题和小标题时，不把标题重复写一遍", () => {
  const { agents, startPrompt } = compileRuleDrafts({
    projectName: "示例项目",
    rules: [
      createRule({
        title: "接口契约与数据所有权规则",
        content:
          "# 接口契约与数据所有权规则\n\n## 核心结论\n\n接口返回的数据先定归属，再谈复用。\n",
        metadata: { ruleType: "must", scope: "project" },
      }),
    ],
    packTitles: {},
    excludedCount: 0,
    now,
  });

  assert.match(
    agents.content,
    /- \*\*接口契约与数据所有权规则\*\*：接口返回的数据先定归属，再谈复用。/,
  );
  assert.match(
    startPrompt.content,
    /- \*\*接口契约与数据所有权规则\*\*：接口返回的数据先定归属，再谈复用。/,
  );
  assert.doesNotMatch(
    agents.content,
    /接口契约与数据所有权规则\*\*：接口契约与数据所有权规则/,
  );
});

test("正文里一句实际的话都没有时，标题后面不留空冒号", () => {
  const { agents } = compileRuleDrafts({
    projectName: "示例项目",
    rules: [
      createRule({
        title: "只有标题的规则",
        content: "# 只有标题的规则\n\n## 核心结论\n",
        metadata: { ruleType: "must", scope: "project" },
      }),
    ],
    packTitles: {},
    excludedCount: 0,
    now,
  });

  assert.match(agents.content, /- \*\*只有标题的规则\*\*\n/);
  assert.doesNotMatch(agents.content, /只有标题的规则\*\*：/);
});
