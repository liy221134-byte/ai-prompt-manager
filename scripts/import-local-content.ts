// 把仓库里已经写好的内容装进本机库（默认 .data/prompts.sqlite）。
// 走应用自己的写入路径（本机资产库层），每次新增都带一条版本记录；重复执行安全：
// 按标识或同名跳过，只新增不覆盖，不做任何删除。
//
// 八个步骤：
//   1. 公共资产库 ← 两个种子资产包（工程方法 0.4.0、操作者训练 0.1.0）
//   2. 公共资产库 ← 工程文档模板（templates/engineering，10 份）
//   3. 公共资产库 ← 提示词（开发规范提示词包 5 条 + 立项提示词 4 条）
//   4. 项目文档   ← 七份英文标题改成中文并补文档类型（只改标题和类型，内容不动）
//   5. 项目文档   ← 补四段链路缺的文档（需求 / 规格与计划 / 交付 / 验收与发布）
//                    含验收清单：交付这 13 条需求的那几版，逐份装进库
//   6. 项目图谱   ← 建「需求 + 模块」节点并挂上对应文档；代码扫描出来的节点归档
//   7. 验收覆盖   ← 每份验收清单挂到它覆盖的需求节点上（只在缺关系时补）
//   8. 复核       ← 用工程基线同一份口径数一遍每条需求有几条验收记录
//
// 用法：
//   node scripts/import-local-content.mjs --dry-run   只列清单，不写库
//   node scripts/import-local-content.mjs             真写
// 可选：PROMPT_DB_PATH 指向别的库文件；--project 指定目标项目（默认按名字找）。

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  createInitialAssetVersionId,
  isAssetData,
  readAssetRelations,
  type AssetRelation,
  type AssetData,
  type DocumentAssetData,
  type GraphNodeAssetData,
  type GraphNodeType,
  type PromptAssetData,
} from "../src/data/assets.ts";
import { DEFAULT_PROJECT_ID } from "../src/data/projects.ts";
import { summarizeNodeEvidence } from "../src/lib/acceptance-evidence.ts";
import { listProjectGraphNodes } from "../src/lib/graph-node.ts";
import { planRulePackImport } from "../src/lib/rule-pack.ts";
import { parseRulePackFile } from "../src/lib/seed-pack-import.ts";
import {
  templateDraftToAsset,
  templateFileToDraft,
} from "../src/lib/template-asset.ts";
import { getPromptDatabase } from "../src/lib/server/prompt-database.ts";

const projectRoot = resolve(import.meta.dirname, "..");
const dryRun = process.argv.includes("--dry-run");
const projectNameArg = readArg("project") ?? "AI提示词资产管理系统";
const database = getPromptDatabase();
const now = new Date().toISOString();
const totals = {
  规则包: 0,
  规则: 0,
  模板: 0,
  提示词: 0,
  文档: 0,
  图谱节点: 0,
  关系: 0,
  改名: 0,
  归档: 0,
  跳过: 0,
};

function readArg(name: string) {
  const index = process.argv.indexOf(`--${name}`);

  return index >= 0 ? process.argv[index + 1] : undefined;
}

function listAssets() {
  return database.listAssets() as AssetData[];
}

function slugify(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readHeading(content: string) {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
}

function writeAsset(asset: AssetData, changeReason: string, bucket: keyof typeof totals) {
  // 用 unknown 过一遍校验：写库前的兜底，防止结构不对的资产进去读不出来
  if (!isAssetData(asset as unknown)) {
    throw new Error(`资产结构不合法，已拦下：${asset.title}`);
  }

  if (dryRun) {
    console.log(`  [空跑] ${bucket}：${asset.title}`);
    totals[bucket] += 1;
    return;
  }

  const created = database.createAsset({
    asset,
    versionId: asset.currentVersionId,
    changeReason,
  });

  if (!created) {
    totals.跳过 += 1;
    return;
  }

  totals[bucket] += 1;
}

function findAssetById(id: string) {
  return listAssets().find((asset) => asset.id === id) ?? null;
}

function findAssetByTitle(projectId: string, title: string) {
  return (
    listAssets().find(
      (asset) => asset.projectId === projectId && asset.title.trim() === title,
    ) ?? null
  );
}

// 已存在的资产先写进本地缓存，避免同一次运行里重复创建
const createdThisRun = new Map<string, string>();

function assetIdByTitle(projectId: string, title: string) {
  const created = createdThisRun.get(`${projectId}|${title.trim()}`);

  if (created) {
    return created;
  }

  return findAssetByTitle(projectId, title)?.id ?? null;
}

// ---------- 1. 公共资产库 ← 种子资产包 ----------

function importSeedPacks() {
  console.log("1. 公共资产库 ← 种子资产包");

  for (const packDirectory of [
    "engineering-foundations",
    "operator-training",
  ]) {
    const file = parseRulePackFile(
      readFileSync(
        join(projectRoot, "seed-packs", packDirectory, `${packDirectory}.pack.json`),
        "utf8",
      ),
    );
    const plan = planRulePackImport({
      file,
      existingAssets: listAssets(),
      targetProjectId: DEFAULT_PROJECT_ID,
      now,
    });

    if (plan.packAsset) {
      writeAsset(plan.packAsset, "导入规则包", "规则包");
      createdThisRun.set(
        `${DEFAULT_PROJECT_ID}|${plan.packAsset.title.trim()}`,
        plan.packAsset.id,
      );
    }

    for (const asset of plan.assetsToCreate) {
      writeAsset(
        asset,
        "安装规则包",
        asset.assetType === "rule" ? "规则" : "文档",
      );
      createdThisRun.set(
        `${DEFAULT_PROJECT_ID}|${asset.title.trim()}`,
        asset.id,
      );
    }

    totals.跳过 += plan.skipped.length;
    console.log(
      `   包「${file.pack.title}」版本 ${file.pack.metadata.packVersion}：` +
        `新增 ${plan.assetsToCreate.length} 条，跳过 ${plan.skipped.length} 条`,
    );
  }
}

// ---------- 2. 公共资产库 ← 工程文档模板 ----------

function importEngineeringTemplates() {
  console.log("2. 公共资产库 ← 工程文档模板");

  const templateDirectory = join(projectRoot, "templates", "engineering");
  const fileNames = readdirSync(templateDirectory)
    .filter((name) => name.endsWith(".md"))
    .sort();

  for (const fileName of fileNames) {
    const content = readFileSync(join(templateDirectory, fileName), "utf8");
    const draft = templateFileToDraft({ fileName, content });
    // 标题取正文的一级标题（中文），文件名留在产物文件名里
    draft.title = readHeading(content) || draft.title;
    // 同一份模板只认一份：按标题去重，避免同名两份在库里打架
    if (assetIdByTitle(DEFAULT_PROJECT_ID, draft.title)) {
      totals.跳过 += 1;
      continue;
    }

    const id = `template-${slugify(fileName)}`;

    if (findAssetById(id)) {
      totals.跳过 += 1;
      continue;
    }

    const asset = templateDraftToAsset({
      id,
      projectId: DEFAULT_PROJECT_ID,
      draft,
      originalFilename: fileName,
      now,
    });

    writeAsset(asset, "导入模板", "模板");
    createdThisRun.set(`${DEFAULT_PROJECT_ID}|${asset.title.trim()}`, asset.id);
  }
}

// ---------- 3. 公共资产库 ← 提示词 ----------

// 开发规范提示词包的正文结构固定：`## N. 标题` + `分类：` + `标签：` + 一个围栏代码块
function parseDevelopmentRulePrompts() {
  const content = readFileSync(
    join(projectRoot, "prompt-packs", "development-rules.md"),
    "utf8",
  );

  return content
    .split(/^##\s+\d+\.\s+/m)
    .slice(1)
    .map((section, index) => {
      const title = section.split(/\r?\n/, 1)[0].trim();
      const category = section.match(/^分类：(.+)$/m)?.[1]?.trim() ?? "其他";
      const tags = (section.match(/^标签：(.+)$/m)?.[1] ?? "")
        .split(/[、,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean);
      const prompt = section.match(/```markdown\r?\n([\s\S]*?)```/)?.[1]?.trim() ?? "";

      return { key: `dev-rule-${index + 1}`, title, category, tags, prompt };
    })
    .filter((entry) => entry.prompt);
}

// 立项提示词：和「立项与交付」面板里生成的一致，只是把项目信息留成变量让人填
function buildKickoffPrompts() {
  const common = [
    "项目：{{项目名称}}",
    "项目说明：{{项目说明}}",
    "质量等级：{{质量等级}}",
    "已定技术栈：{{技术栈}}",
    "",
    "要求：先问我该问的问题（一次问完，等我回答），再产出；不要一次给多个方案让我挑；不要编造事实。",
  ].join("\n");

  return [
    {
      key: "kickoff-prd",
      title: "立项① 需求（PRD）提示词",
      useCase: "开新项目时产出轻量 PRD：解决的问题、做什么、不做什么、成功标准。",
      tags: ["立项", "PRD", "需求"],
      prompt: `${common}\n\n请产出一份轻量 PRD：\n1. 要解决的问题和给谁用；\n2. 这次做什么（按功能列，每条一句话）；\n3. 明确不做什么；\n4. 成功标准（能验证的指标或现象）；\n5. 上线前必须满足的条件。\n控制在两页以内。`,
    },
    {
      key: "kickoff-spec",
      title: "立项② 实现规格（Spec）提示词",
      useCase: "动代码之前先产出实现规格：动哪些文件、数据怎么变、边界在哪、怎么回滚。",
      tags: ["立项", "Spec", "实现规格"],
      prompt: `${common}\n\n请产出一份实现规格（Spec）：\n1. 需求追溯：对应哪条需求、成功标准；\n2. 现状：现在怎么做的、涉及哪些文件和数据；\n3. 方案：改成什么样、为什么这么选；\n4. 数据结构与迁移：表和字段怎么变、老数据怎么办、怎么回滚；\n5. 接口与状态：输入输出和状态流转；\n6. 边界与错误：空值、超长、重复、并发各自怎么处理；\n7. 验收映射：每条验收条件怎么验；\n8. 风险与回滚。\n用自然语言写，不要贴整段代码。`,
    },
    {
      key: "kickoff-tech",
      title: "立项③ 技术档案提示词",
      useCase: "开新项目时产出技术档案：约束是什么、选了什么、禁止什么、偏离默认选型的理由。",
      tags: ["立项", "技术选型", "技术档案"],
      prompt: `${common}\n\n请产出一份技术档案：\n1. 先问清约束（用户量、数据敏感度、要不要自有服务器、预算、维护人力）；\n2. 技术栈清单，每行：技术名称 | 版本（不确定写「待定」） | 在这个项目里负责什么；\n3. 禁止项（这个项目不该引入什么）；\n4. 什么条件下才允许替换；\n5. 偏离默认选型的部分，说明理由（我会另写一条决策记录）。`,
    },
    {
      key: "kickoff-acceptance",
      title: "立项④ 验收清单提示词",
      useCase: "开新项目时产出验收清单：每条需求怎么验、看到什么算对。",
      tags: ["立项", "验收", "测试"],
      prompt: `${common}\n\n请产出一份验收清单：\n1. 按需求逐条列，每条写：验收条件、手工验证步骤、预期结果；\n2. 标出哪些必须自动化测试挡住；\n3. 标出边界情况（空数据、超长、重复、并发）；\n4. 每条都要我能自己点一遍就能判定通过或失败。`,
    },
  ];
}

function importPrompts() {
  console.log("3. 公共资产库 ← 提示词");

  const entries = [
    ...parseDevelopmentRulePrompts().map((entry) => ({
      ...entry,
      category: entry.category,
      useCase: `开发规范提示词包：${entry.title}`,
      sourceFile: "prompt-packs/development-rules.md",
    })),
    ...buildKickoffPrompts().map((entry) => ({
      ...entry,
      category: "立项与交付",
      sourceFile: "scripts/import-local-content.ts",
    })),
  ];

  for (const entry of entries) {
    if (findAssetByTitle(DEFAULT_PROJECT_ID, entry.title)) {
      totals.跳过 += 1;
      continue;
    }

    // 标识用固定的短键：中文标题算不出拼音，靠标题生成标识会撞车
    const id = `prompt-${entry.key}`;

    if (findAssetById(id)) {
      totals.跳过 += 1;
      continue;
    }

    const asset: PromptAssetData = {
      id,
      projectId: DEFAULT_PROJECT_ID,
      assetType: "prompt",
      title: entry.title,
      summary: entry.useCase,
      content: entry.prompt,
      metadata: {
        category: entry.category,
        tags: entry.tags,
        useCase: entry.useCase,
        mergedIntoAssetId: null,
        mergeVersionId: null,
      },
      source: {
        sourceType: "import",
        sourceAssetId: null,
        importBatchId: null,
        originalFilename: entry.sourceFile,
      },
      currentVersionId: createInitialAssetVersionId(id),
      status: "active",
      archivedAt: null,
      deletedAt: null,
      deletedReason: null,
      createdAt: now,
      updatedAt: now,
    };

    writeAsset(asset, "导入提示词", "提示词");
    createdThisRun.set(`${DEFAULT_PROJECT_ID}|${asset.title.trim()}`, asset.id);
  }
}

// ---------- 4~6. 项目：文档、图谱 ----------

// 七份早先导入的文档标题是英文文件名，改中文标题并补上文档类型（只改标题和类型）
const documentRenames = [
  { from: "backup", to: "备份与恢复", documentType: "备份说明" },
  { from: "cloud-deployment", to: "Vercel + Supabase 免费部署指南", documentType: "架构说明" },
  { from: "database-schema", to: "数据库结构", documentType: "数据库说明" },
  { from: "engineering-map", to: "工程地图", documentType: "架构说明" },
  { from: "mcp-server", to: "本机 MCP 服务", documentType: "架构说明" },
  { from: "release-rollback", to: "发布与回滚", documentType: "发布手册" },
  { from: "user-map", to: "用户地图", documentType: "参考资料" },
];

// 补四段链路缺的文档：需求 → 规格与计划 → 交付 → 验收与发布
const projectDocuments: { file: string; id: string; documentType: string }[] = [
  { file: "docs/product-brief.md", id: "document-product-brief", documentType: "PRD" },
  { file: "docs/user-stories.md", id: "document-user-stories", documentType: "PRD" },
  { file: "docs/roadmap.md", id: "document-roadmap", documentType: "参考资料" },
  { file: "docs/v2-plan.md", id: "document-v2-plan", documentType: "实现规格" },
  { file: "docs/requirements-v2.md", id: "document-requirements-v2", documentType: "实现规格" },
  {
    file: "docs/project-lifecycle-gaps.md",
    id: "document-project-lifecycle-gaps",
    documentType: "实现规格",
  },
  {
    file: "docs/superpowers/specs/2026-09-24-v2.14.0-sediment-flowback-design.md",
    id: "document-spec-v2-14-0",
    documentType: "实现规格",
  },
  {
    file: "docs/superpowers/specs/2026-09-24-v2.15.0-kickoff-pack-design.md",
    id: "document-spec-v2-15-0",
    documentType: "实现规格",
  },
  { file: "docs/project-map.md", id: "document-project-map", documentType: "架构说明" },
  {
    file: "docs/development-rules.md",
    id: "document-development-rules",
    documentType: "参考资料",
  },
  {
    file: "docs/operations/database-migrations.md",
    id: "document-database-migrations",
    documentType: "数据库说明",
  },
];

// 验收清单：仓库 docs/acceptance 里能作为这 13 条需求验收证据的那些版本，逐份装进库。
// 只装对得上需求的；week-03（提示词备份）、v2.1.1~v2.1.3、v2.4.0、v2.12.0、v2.13.0、v2.17.0
// 还留在仓库里，等哪条需求要拿它当证据再加。
// 标识按文件名生成，和已经入库的那几份一致（v2.16.0 → document-acceptance-v2-16-0）。
const acceptanceVersions = [
  "week-01",
  "week-02",
  "week-04",
  "week-05",
  "week-06",
  "week-07",
  "week-08",
  "week-09",
  "v1.0.0",
  "v2.0.0",
  "v2.1.0",
  "v2.2.0",
  "v2.3.0",
  "v2.5.0",
  "v2.6.0",
  "v2.7.0",
  "v2.8.0",
  "v2.9.0",
  "v2.10.0",
  "v2.11.0",
  "v2.14.0",
  "v2.15.0",
  "v2.16.0",
  "v2.18.0",
];

function acceptanceDocumentId(version: string) {
  return `document-acceptance-${slugify(version)}`;
}

// 一条需求挂哪几份清单，按「哪一版交付了它」定，一份清单可以挂多条需求
const acceptanceCoverage = [
  { requirement: "REQ-001", versions: ["week-01", "week-02", "v1.0.0"] },
  { requirement: "REQ-002", versions: ["week-02", "v1.0.0"] },
  { requirement: "REQ-003", versions: ["week-06"] },
  { requirement: "REQ-004", versions: ["week-08", "week-09", "v2.1.0"] },
  { requirement: "REQ-005", versions: ["v2.0.0", "v2.1.0", "v2.11.0"] },
  { requirement: "REQ-006", versions: ["v2.2.0", "v2.3.0", "v2.18.0"] },
  { requirement: "REQ-007", versions: ["v2.8.0", "v2.9.0", "v2.10.0"] },
  { requirement: "REQ-008", versions: ["v2.5.0"] },
  { requirement: "REQ-009", versions: ["v2.6.0"] },
  { requirement: "REQ-010", versions: ["v2.14.0", "v2.16.0"] },
  { requirement: "REQ-011", versions: ["v2.15.0"] },
  { requirement: "REQ-012", versions: ["week-04", "week-05", "week-07", "v1.0.0", "v2.11.0"] },
  { requirement: "REQ-013", versions: ["v2.7.0", "v2.16.0"] },
];

for (const version of acceptanceVersions) {
  projectDocuments.push({
    file: `docs/acceptance/${version}.md`,
    id: acceptanceDocumentId(version),
    documentType: "验收记录",
  });
}

function resolveProjectId() {
  const project = database
    .listProjects()
    .find((entry) => entry.name.trim() === projectNameArg.trim());

  if (!project) {
    throw new Error(`找不到项目「${projectNameArg}」，先确认项目名再跑。`);
  }

  return project.id;
}

function renameProjectDocuments(projectId: string) {
  console.log("4. 项目文档 ← 改成中文标题");

  for (const entry of documentRenames) {
    const existing = findAssetByTitle(projectId, entry.from);

    if (!existing || existing.assetType !== "document") {
      totals.跳过 += 1;
      continue;
    }

    if (findAssetByTitle(projectId, entry.to)) {
      totals.跳过 += 1;
      continue;
    }

    if (dryRun) {
      console.log(`  [空跑] 改名：${entry.from} → ${entry.to}`);
      totals.改名 += 1;
      continue;
    }

    const versionId = `${existing.id}-rename-${Date.now()}`;
    const updated = {
      ...existing,
      title: entry.to,
      summary: `${entry.documentType} · 从 ${entry.from}.md 导入`,
      metadata: { ...existing.metadata, documentType: entry.documentType },
      currentVersionId: versionId,
      updatedAt: now,
    } as DocumentAssetData;

    database.updateAsset({
      asset: updated,
      versionId,
      changeReason: "标题改成中文、补文档类型",
    });
    totals.改名 += 1;
  }
}

function importProjectDocuments(projectId: string) {
  console.log("5. 项目文档 ← 补四段链路缺的文档");

  for (const entry of projectDocuments) {
    const content = readFileSync(join(projectRoot, entry.file), "utf8");
    const title = readHeading(content) || entry.file;

    if (findAssetById(entry.id) || findAssetByTitle(projectId, title)) {
      totals.跳过 += 1;
      continue;
    }

    const asset: DocumentAssetData = {
      id: entry.id,
      projectId,
      assetType: "document",
      title,
      summary: `${entry.documentType} · 从 ${entry.file} 导入`,
      content,
      metadata: {
        documentType: entry.documentType,
        authority: false,
        module: "",
        effectiveVersion: "",
        sourceLocation: entry.file,
        updateTrigger: "",
        freshness: "",
        lastVerifiedAt: "",
        relations: [],
      },
      source: {
        sourceType: "import",
        sourceAssetId: null,
        importBatchId: null,
        originalFilename: entry.file,
      },
      currentVersionId: createInitialAssetVersionId(entry.id),
      status: "active",
      archivedAt: null,
      deletedAt: null,
      deletedReason: null,
      createdAt: now,
      updatedAt: now,
    };

    writeAsset(asset, "导入项目文档", "文档");
    createdThisRun.set(`${projectId}|${title}`, asset.id);
  }
}

// 图谱节点：需求 / 模块两类，每个节点挂上对应文档；代码扫描出来的模块和接口节点归档。
// parent 用节点编号指向上一级；docs / implements 用资产标题指向文档和需求节点。
type GraphSeed = {
  code: string;
  nodeType: GraphNodeType;
  title: string;
  parent?: string;
  content: string;
  docs?: string[];
  implements?: string[];
};

const graphSeed: GraphSeed[] = [
  {
    code: "REQ-001",
    nodeType: "requirement",
    title: "提示词卡片：标题、分类、标签、正文、适用场景",
    content:
      "做什么：提示词卡片包含标题、分类、标签、正文和适用场景，能在库里找到、搜到、筛出来。\n" +
      "现在到哪：字段、卡片、编辑器和筛选从 1.0 起就在用。\n" +
      "看文档：产品范围（做什么／不做什么）、用户地图（入口在哪）。",
    docs: ["产品范围", "用户地图"],
  },
  {
    code: "REQ-002",
    nodeType: "requirement",
    title: "变量填充与一键复制",
    parent: "REQ-001",
    content:
      "做什么：识别正文里的 {{变量}}，填好值一键复制成品，这是核心流程的最后一步。\n" +
      "验收口径：docs/acceptance/week-02.md 的变量识别与复制标准。",
    docs: ["用户故事与线上自测清单"],
  },
  {
    code: "REQ-003",
    nodeType: "requirement",
    title: "AI 采集：粘贴原文 → 识别结构 → 我确认 → 保存",
    content:
      "做什么：粘贴原文，让 AI 识别出结构、分类和标签，我确认后才落库。\n" +
      "硬约束：AI 不得静默覆盖我的内容，结果先预览再保存。",
    docs: ["产品范围"],
  },
  {
    code: "REQ-004",
    nodeType: "requirement",
    title: "AI 优化与合并：先预览再保存",
    parent: "REQ-003",
    content:
      "做什么：对单条提示词做 AI 优化，把多条合并成一条，两件事都先给草稿。\n" +
      "硬约束：合并前的原文留在版本记录里，可以恢复。",
    docs: ["产品范围"],
  },
  {
    code: "REQ-005",
    nodeType: "requirement",
    title: "统一资产底座：提示词、规则、文档、模板、图谱、规则包",
    content:
      "做什么：提示词、规则、文档、模板、技术档案、规则包、图谱节点都放同一套资产底座里，\n" +
      "带来源、关系、版本记录和状态。\n" +
      "看文档：2.0 资产管理底座计划（这一层怎么设计的）、数据库结构（落在哪张表）。",
    docs: ["2.0 资产管理底座计划", "数据库结构"],
  },
  {
    code: "REQ-006",
    nodeType: "requirement",
    title: "规则包与规则编译",
    parent: "REQ-005",
    content:
      "做什么：把规则装成包（种子资产包／规则包文件），再按项目编译成 AGENTS.md 这类产物。\n" +
      "看文档：需求收敛（文档／模板边界、Spec 层）。",
    docs: ["需求收敛：文档／模板边界、Spec 层与交互流程（待确认）"],
  },
  {
    code: "REQ-007",
    nodeType: "requirement",
    title: "工程基线与项目质量等级",
    parent: "REQ-005",
    content:
      "做什么：给项目定质量等级（个人工具／中型产品／大型平台），据此要求必选的文档、门禁和演练。\n" +
      "看文档：生产级项目指南地图（等级怎么判）、用户地图（界面入口）。",
    docs: ["生产级项目指南地图", "用户地图"],
  },
  {
    code: "REQ-008",
    nodeType: "requirement",
    title: "项目图谱与影响分析",
    parent: "REQ-005",
    content:
      "做什么：把需求、模块、数据、接口、测试五类节点串成树，看「指向谁／谁指向它／间接影响」。\n" +
      "看文档：工程地图（这一层由哪些文件实现）。",
    docs: ["工程地图"],
  },
  {
    code: "REQ-009",
    nodeType: "requirement",
    title: "工程导入：数据库 Schema／代码目录／项目文档",
    parent: "REQ-005",
    content:
      "做什么：三条导入来源——SQL 建表语句生成数据节点、代码目录生成模块与接口节点、\n" +
      "选一批 Markdown 原样建成项目文档。\n" +
      "看文档：工程地图、数据库迁移（表和迁移的现状）。",
    docs: ["工程地图", "数据库迁移"],
  },
  {
    code: "REQ-010",
    nodeType: "requirement",
    title: "沉淀回流：提升为公共资产、上游提醒、沉淀体检",
    parent: "REQ-005",
    content:
      "做什么：项目里的规则／文档／模板可以提升到公共资产库（复制、不删原件），两边记同源；\n" +
      "公共库改过之后给提示，可看差异、可显式拉取；体检列出只在项目里的规则。",
    docs: ["v2.14.0 沉淀回流：设计 + 任务清单", "从「沉淀」到「立项」：这条链路现在断在哪"],
  },
  {
    code: "REQ-011",
    nodeType: "requirement",
    title: "立项起步包：按等级推荐、立项提示词、开发体系包",
    parent: "REQ-005",
    content:
      "做什么：开新项目时按质量等级推荐该装哪些公共资产，给四条立项提示词，\n" +
      "并能把项目当前内容导出一份开发体系包。",
    docs: ["v2.15.0 立项起步包：设计 + 任务清单", "v2.15.0 验收清单（立项起步包）"],
  },
  {
    code: "REQ-012",
    nodeType: "requirement",
    title: "本机与云端双模式、账号密码登录、数据隔离",
    parent: "REQ-005",
    content:
      "做什么：本机模式走 SQLite（离线可用、可读本机目录），云端模式走 Supabase，\n" +
      "用个人邮箱密码登录，数据靠 RLS 按账号隔离。",
    docs: ["Vercel + Supabase 免费部署指南", "数据库结构"],
  },
  {
    code: "REQ-013",
    nodeType: "requirement",
    title: "MCP：让 AI 直接读写本机库",
    parent: "REQ-005",
    content:
      "做什么：本机 MCP 服务让 AI 查库、写库（新建、编辑、改状态、批量入库），\n" +
      "不开端口、不要密钥，能力不超过人在界面上能做的。",
    docs: ["本机 MCP 服务", "v2.16.0 验收清单（MCP 批量入库与沉淀分流建议）"],
  },
  {
    code: "MOD-001",
    nodeType: "module",
    title: "提示词库与编辑器",
    content:
      "负责什么：提示词列表、筛选、卡片、编辑器和详情抽屉，是使用频次最高的一层。\n" +
      "对应需求：REQ-001、REQ-002。",
    implements: ["REQ-001", "REQ-002"],
    docs: ["工程地图"],
  },
  {
    code: "MOD-002",
    nodeType: "module",
    title: "资产层与版本记录",
    content:
      "负责什么：所有资产的读写、版本记录、关系、状态和备份格式兼容。\n" +
      "对应需求：REQ-005。",
    implements: ["REQ-005"],
    docs: ["数据库结构"],
  },
  {
    code: "MOD-003",
    nodeType: "module",
    title: "数据源：本机 SQLite 与 Supabase",
    content:
      "负责什么：按运行模式在两种数据源之间切换，界面和纯逻辑共用同一套契约。\n" +
      "对应需求：REQ-012。",
    implements: ["REQ-012"],
    docs: ["Vercel + Supabase 免费部署指南"],
  },
  {
    code: "MOD-004",
    nodeType: "module",
    title: "工程导入与目录扫描",
    content:
      "负责什么：解析 SQL 建表语句、扫描本机代码目录、把项目文档原样导入。\n" +
      "对应需求：REQ-009。",
    implements: ["REQ-009"],
    docs: ["数据库迁移"],
  },
  {
    code: "MOD-005",
    nodeType: "module",
    title: "规则引擎与编译",
    content:
      "负责什么：规则的元数据、去重、冲突检查，以及按项目编译出 AGENTS.md 等产物。\n" +
      "对应需求：REQ-006。",
    implements: ["REQ-006"],
    docs: ["工程地图"],
  },
  {
    code: "MOD-006",
    nodeType: "module",
    title: "图谱与影响分析",
    content:
      "负责什么：节点编号校验、树的组装、关系与两层影响分析。\n" +
      "对应需求：REQ-008。",
    implements: ["REQ-008"],
    docs: ["工程地图"],
  },
  {
    code: "MOD-007",
    nodeType: "module",
    title: "本机 MCP 服务",
    content:
      "负责什么：把查询和写入能力以工具形式开放给 AI，只在本机跑，数据不出本机。\n" +
      "对应需求：REQ-013。",
    implements: ["REQ-013"],
    docs: ["本机 MCP 服务"],
  },
  {
    code: "MOD-008",
    nodeType: "module",
    title: "备份、恢复与数据迁移",
    content:
      "负责什么：备份文件的生成与导入、版本兼容、迁移与回滚的运维口径。\n" +
      "对应需求：REQ-005、REQ-012。",
    implements: ["REQ-005", "REQ-012"],
    docs: ["备份与恢复", "发布与回滚"],
  },
];

const archivedBatchPrefix = "engineering-import-";

function importProjectGraph(projectId: string) {
  console.log("6. 项目图谱 ← 需求与模块节点，并归档代码扫描节点");

  const nodeIdByCode = new Map<string, string>();

  for (const seed of graphSeed) {
    const id = `graph-node-${seed.code.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const existing = findAssetById(id);

    if (existing) {
      nodeIdByCode.set(seed.code, id);
      totals.跳过 += 1;
      continue;
    }

    const relations: AssetRelation[] = [];

    for (const requirementCode of seed.implements ?? []) {
      const targetId = assetIdByCode(nodeIdByCode, requirementCode);

      if (targetId) {
        relations.push({
          targetAssetId: targetId,
          relationType: "implements",
          note: "这个模块实现这条需求",
        });
      }
    }

    for (const documentTitle of seed.docs ?? []) {
      const targetId = assetIdByTitle(projectId, documentTitle);

      if (!targetId) {
        console.log(`  ! 找不到文档「${documentTitle}」，这条关系先不建`);
        continue;
      }

      relations.push({
        targetAssetId: targetId,
        relationType: "reference",
        note: "节点说明依据这份文档",
      });
    }

    const parentCode = seed.parent;
    const asset: GraphNodeAssetData = {
      id,
      projectId,
      assetType: "graph_node",
      title: seed.title,
      summary: `${seed.nodeType === "requirement" ? "需求" : "模块"}节点 · ${seed.code}`,
      content: seed.content,
      metadata: {
        nodeType: seed.nodeType,
        code: seed.code,
        parentId: parentCode
          ? assetIdByCode(nodeIdByCode, parentCode)
          : null,
        note: "来自 2026-09-24 的项目复盘，正文取自项目文档",
        relations,
      },
      source: {
        sourceType: "manual",
        sourceAssetId: null,
        importBatchId: null,
        originalFilename: null,
      },
      currentVersionId: createInitialAssetVersionId(id),
      status: "active",
      archivedAt: null,
      deletedAt: null,
      deletedReason: null,
      createdAt: now,
      updatedAt: now,
    };

    writeAsset(asset, "建项目图谱节点", "图谱节点");
    nodeIdByCode.set(seed.code, id);
  }

  // 代码扫描出来的模块／接口节点：从图谱里撤下来（归档，不删；状态改回活跃即可恢复）
  for (const asset of listAssets()) {
    if (
      asset.projectId !== projectId ||
      asset.assetType !== "graph_node" ||
      asset.status !== "active" ||
      !asset.source.importBatchId?.startsWith(archivedBatchPrefix)
    ) {
      continue;
    }

    if (dryRun) {
      console.log(`  [空跑] 归档：${asset.metadata.code} ${asset.title}`);
      totals.归档 += 1;
      continue;
    }

    const versionId = `${asset.id}-archive-${Date.now()}`;
    const updated = {
      ...asset,
      status: "archived",
      archivedAt: now,
      currentVersionId: versionId,
      updatedAt: now,
    } as AssetData;

    database.updateAsset({
      asset: updated,
      versionId,
      changeReason: "代码扫描节点归档：图谱改成文档型节点（状态改回活跃即可恢复）",
    });
    totals.归档 += 1;
  }
}

function assetIdByCode(nodeIdByCode: Map<string, string>, code: string) {
  return (
    nodeIdByCode.get(code) ??
    listAssets().find(
      (asset) =>
        asset.assetType === "graph_node" &&
        asset.metadata.code.toLocaleUpperCase() === code.toLocaleUpperCase(),
    )?.id ??
    null
  );
}

// 验收覆盖：清单自己指向需求节点（和界面上「批量挂文档」、MCP 建验收记录的方向一致）。
// 已经有这条关系的跳过，只补缺的，不覆盖别的字段。
function linkAcceptanceCoverage() {
  console.log("7. 验收覆盖 ← 验收清单挂到它覆盖的需求节点");

  for (const entry of acceptanceCoverage) {
    const requirementId = assetIdByCode(new Map(), entry.requirement);

    if (!requirementId) {
      console.log(`  ! 找不到需求节点「${entry.requirement}」，这组关系先不建`);
      continue;
    }

    for (const version of entry.versions) {
      const record = findAssetById(acceptanceDocumentId(version));
      const plannedThisRun = acceptanceVersions.includes(version);

      // 空跑时清单还没写进库，按「本次会装」算；真写时找不到就是真出问题
      if (!record && (!dryRun || !plannedThisRun)) {
        console.log(`  ! 找不到验收清单「${version}」，这条关系先不建`);
        continue;
      }

      if (record && record.assetType !== "document") {
        console.log(`  ! 资产「${version}」不是文档，这条关系先不建`);
        continue;
      }

      const relations = record ? readAssetRelations(record.metadata) : [];

      if (relations.some((relation) => relation.targetAssetId === requirementId)) {
        totals.跳过 += 1;
        continue;
      }

      if (dryRun) {
        console.log(
          `  [空跑] 挂需求：${record?.title ?? `${version} 验收清单`} → ${entry.requirement}`,
        );
        totals.关系 += 1;
        continue;
      }

      if (!record) {
        console.log(`  ! 找不到验收清单「${version}」，这条关系先不建`);
        continue;
      }

      const versionId = `${record.id}-coverage-${Date.now()}`;
      const updated: DocumentAssetData = {
        ...record,
        metadata: {
          ...record.metadata,
          relations: [
            ...relations,
            {
              targetAssetId: requirementId,
              relationType: "reference",
              note: "这份清单覆盖这条需求",
            },
          ],
        },
        currentVersionId: versionId,
        updatedAt: now,
      };

      database.updateAsset({
        asset: updated,
        versionId,
        changeReason: "验收清单关联到它覆盖的需求节点",
      });
      totals.关系 += 1;
    }
  }
}

// 复核用的是产品自己那份口径（`src/lib/acceptance-evidence.ts`，工程基线「验收覆盖」同源），
// 不另写一套判断；这里只数数量，结论是不是「通过」仍然只能人在界面上点。
function printAcceptanceCoverage(projectId: string) {
  console.log("\n8. 复核：每条需求有几条验收记录（和工程基线同一口径）");

  const assets = listAssets();
  const summary = summarizeNodeEvidence(assets, projectId);
  const requirements = listProjectGraphNodes(assets, projectId)
    .filter((node) => node.metadata.nodeType === "requirement")
    .sort((left, right) =>
      left.metadata.code.localeCompare(right.metadata.code, "en"),
    );
  const withoutRecord = requirements.filter(
    (node) => (summary.get(node.id)?.total ?? 0) === 0,
  );

  for (const node of requirements) {
    const item = summary.get(node.id);

    console.log(
      `  ${node.metadata.code}：验收记录 ${item?.total ?? 0} 条` +
        `（通过 ${item?.passed ?? 0}，待确认 ${item?.pending ?? 0}）｜${node.title}`,
    );
  }

  console.log(
    withoutRecord.length === 0
      ? "  每条需求都有验收记录了。"
      : `  ! 还没有验收记录的需求：${withoutRecord
          .map((node) => node.metadata.code)
          .join("、")}`,
  );
}

// ---------- 跑 ----------

const projectId = resolveProjectId();

console.log(
  `${dryRun ? "空跑（不写库）" : "写入本机库"}：公共资产库 = 默认项目，项目 = ${projectNameArg}`,
);

importSeedPacks();
importEngineeringTemplates();
importPrompts();
renameProjectDocuments(projectId);
importProjectDocuments(projectId);
importProjectGraph(projectId);
linkAcceptanceCoverage();
printAcceptanceCoverage(projectId);

console.log("\n完成：");
for (const [label, count] of Object.entries(totals)) {
  console.log(`  ${label}：${count}`);
}

if (!dryRun) {
  database.close();
}
