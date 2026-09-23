import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PROJECT_ID,
  archiveProject,
  createDefaultProject,
  createProjectData,
  createProjectId,
  isDefaultProject,
  reactivateProject,
  resolveActiveProject,
  updateProjectDetails,
} from "../src/data/projects.ts";
import {
  assetTypeFilterLabels,
  assetTypeFilterOptions,
  assetTypeLabels,
  buildAssetSearchText,
  filterProjectAssets,
  isActiveAsset,
  matchesAssetTypeFilter,
} from "../src/lib/asset-list.ts";
import {
  ACTIVE_PROJECT_STORAGE_KEY,
  loadActiveProjectId,
  saveActiveProjectId,
} from "../src/lib/project-storage.ts";
import { ensureDefaultProject } from "../src/lib/project-workspace.ts";

function createLocalStorageMock() {
  const values = new Map();

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

function createAsset(overrides = {}) {
  return {
    id: "asset-1",
    projectId: "project-1",
    assetType: "rule",
    title: "提交前必须通过检查",
    summary: "规则摘要",
    content: "运行 npm run check",
    metadata: { ruleType: "must", scope: "project" },
    source: {
      sourceType: "manual",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: "version-1",
    status: "active",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: "2026-09-21T00:00:00.000Z",
    updatedAt: "2026-09-21T00:00:00.000Z",
    ...overrides,
  };
}

test("新建项目会补齐标识、状态和阶段默认值", () => {
  const project = createProjectData({
    id: "project-alpha",
    name: "  资产底座  ",
    description: "  统一资产模型  ",
    now: "2026-09-21T00:00:00.000Z",
  });

  assert.equal(project.id, "project-alpha");
  assert.equal(project.name, "资产底座");
  assert.equal(project.description, "统一资产模型");
  assert.equal(project.status, "active");
  assert.equal(project.stage, "development");
  assert.equal(project.archivedAt, null);
  assert.equal(project.createdAt, "2026-09-21T00:00:00.000Z");
  assert.equal(project.updatedAt, "2026-09-21T00:00:00.000Z");
});

test("新建项目必须提供名称", () => {
  assert.throws(
    () => createProjectData({ id: "project-alpha", name: "   " }),
    /项目名称不能为空/,
  );
});

test("项目标识使用项目前缀，避免和提示词标识混淆", () => {
  assert.match(createProjectId(), /^project-/);
});

test("重命名项目只改动名称、描述、阶段和更新时间", () => {
  const project = createProjectData({
    id: "project-alpha",
    name: "旧名称",
    description: "旧描述",
    stage: "prototype",
    now: "2026-09-21T00:00:00.000Z",
  });
  const updated = updateProjectDetails(
    project,
    { name: " 新名称 ", description: " 新描述 ", stage: "release" },
    "2026-09-22T00:00:00.000Z",
  );

  assert.equal(updated.name, "新名称");
  assert.equal(updated.description, "新描述");
  assert.equal(updated.stage, "release");
  assert.equal(updated.createdAt, project.createdAt);
  assert.equal(updated.updatedAt, "2026-09-22T00:00:00.000Z");
  assert.equal(updated.status, "active");
});

test("归档项目保留资产归属字段，重新激活后恢复活跃状态", () => {
  const project = createProjectData({
    id: "project-alpha",
    name: "资产底座",
    now: "2026-09-21T00:00:00.000Z",
  });
  const archived = archiveProject(project, "2026-09-22T00:00:00.000Z");

  assert.equal(archived.status, "archived");
  assert.equal(archived.archivedAt, "2026-09-22T00:00:00.000Z");
  assert.equal(archived.createdAt, project.createdAt);

  const reactivated = reactivateProject(
    archived,
    "2026-09-23T00:00:00.000Z",
  );

  assert.equal(reactivated.status, "active");
  assert.equal(reactivated.archivedAt, null);
  assert.equal(reactivated.updatedAt, "2026-09-23T00:00:00.000Z");
});

test("默认项目归档后标识不变", () => {
  const project = archiveProject(
    createDefaultProject(),
    "2026-09-22T00:00:00.000Z",
  );

  assert.equal(project.id, DEFAULT_PROJECT_ID);
  assert.equal(isDefaultProject(project), true);
});

test("优先进入最近使用的项目，没有记录时回到默认项目", () => {
  const defaultProject = createDefaultProject();
  const archivedProject = archiveProject(
    createProjectData({ id: "project-beta", name: "已归档项目" }),
  );
  const projects = [defaultProject, archivedProject];

  assert.equal(
    resolveActiveProject(projects, "project-beta")?.id,
    "project-beta",
  );
  assert.equal(
    resolveActiveProject(projects, "project-missing")?.id,
    DEFAULT_PROJECT_ID,
  );
  assert.equal(resolveActiveProject(projects, null)?.id, DEFAULT_PROJECT_ID);
  assert.equal(resolveActiveProject([], null), null);
});

test("最近使用的项目可以写入并再次读取", () => {
  const localStorage = createLocalStorageMock();
  globalThis.window = { localStorage };

  assert.equal(loadActiveProjectId(), null);

  saveActiveProjectId("project-alpha");

  assert.equal(
    localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY),
    "project-alpha",
  );
  assert.equal(loadActiveProjectId(), "project-alpha");
});

test("默认项目缺失时会自动补建，已存在时不再写入", async () => {
  const created = [];
  const emptySource = {
    async fetchProjects() {
      return [];
    },
    async createProject(project) {
      created.push(project);
      return [project];
    },
  };

  const bootstrapped = await ensureDefaultProject(
    emptySource,
    "2026-09-21T00:00:00.000Z",
  );

  assert.equal(created.length, 1);
  assert.equal(bootstrapped[0].id, DEFAULT_PROJECT_ID);

  const existingSource = {
    async fetchProjects() {
      return [createDefaultProject()];
    },
    async createProject() {
      created.push("unexpected");
      return [];
    },
  };

  await ensureDefaultProject(existingSource);

  assert.equal(created.length, 1);
});

test("默认项目创建失败时重新读取现有项目", async () => {
  let attempts = 0;

  const projects = await ensureDefaultProject({
    async fetchProjects() {
      attempts += 1;
      return attempts === 1 ? [] : [createDefaultProject()];
    },
    async createProject() {
      throw new Error("这个项目已经存在。");
    },
  });

  assert.equal(projects.length, 1);
  assert.equal(projects[0].id, DEFAULT_PROJECT_ID);
});

test("资产列表只保留当前项目的活跃资产", () => {
  const assets = [
    createAsset(),
    createAsset({ id: "asset-2", projectId: "project-2" }),
    createAsset({ id: "asset-3", status: "archived" }),
    createAsset({ id: "asset-4", deletedAt: "2026-09-22T00:00:00.000Z" }),
    createAsset({ id: "asset-5", assetType: "document" }),
  ];
  const visible = filterProjectAssets(assets, { projectId: "project-1" });

  assert.deepEqual(
    visible.map((asset) => asset.id),
    ["asset-1", "asset-5"],
  );
  assert.equal(
    filterProjectAssets(assets, {
      projectId: "project-1",
      assetType: "document",
    }).length,
    1,
  );
});

test("资产活跃判定排除归档、草稿和垃圾箱内容", () => {
  assert.equal(isActiveAsset(createAsset()), true);
  assert.equal(isActiveAsset(createAsset({ status: "draft" })), false);
  assert.equal(
    isActiveAsset(createAsset({ archivedAt: "2026-09-22T00:00:00.000Z" })),
    false,
  );
  assert.equal(
    isActiveAsset(
      createAsset({
        deletedAt: "2026-09-22T00:00:00.000Z",
        deletedReason: "manual",
      }),
    ),
    false,
  );
});

test("类型筛选支持全部、提示词、规则、文档、技术档案、模板、规则包和图谱节点", () => {
  assert.deepEqual([...assetTypeFilterOptions], [
    "all",
    "prompt",
    "rule",
    "document",
    "tech_profile",
    "template",
    "rule_pack",
    "graph_node",
  ]);

  for (const filter of assetTypeFilterOptions) {
    assert.equal(typeof assetTypeFilterLabels[filter], "string");
  }

  assert.equal(matchesAssetTypeFilter(createAsset(), "all"), true);
  assert.equal(matchesAssetTypeFilter(createAsset(), "rule"), true);
  assert.equal(matchesAssetTypeFilter(createAsset(), "document"), false);
  assert.equal(assetTypeLabels.tech_profile, "技术档案");
  assert.equal(assetTypeLabels.template, "模板");
  assert.equal(assetTypeLabels.rule_pack, "规则包");
  assert.equal(assetTypeLabels.graph_node, "图谱节点");
});

test("资产搜索文本包含标题、摘要、正文和标签", () => {
  const promptAsset = createAsset({
    assetType: "prompt",
    title: "需求评审",
    summary: "评审摘要",
    content: "检查验收标准",
    metadata: {
      category: "产品设计",
      tags: ["评审"],
      useCase: "",
      mergedIntoAssetId: null,
      mergeVersionId: null,
    },
  });
  const searchText = buildAssetSearchText(promptAsset);

  assert.match(searchText, /需求评审/);
  assert.match(searchText, /评审摘要/);
  assert.match(searchText, /检查验收标准/);
  assert.match(searchText, /评审/);
});
