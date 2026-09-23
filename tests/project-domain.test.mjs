import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PROJECT_ID,
  createDefaultProject,
  createProjectData,
  isProjectData,
  normalizeProjectData,
  readProjectRiskLevel,
  updateProjectRiskLevel,
} from "../src/data/projects.ts";

test("默认项目使用稳定标识并处于活跃状态", () => {
  const project = createDefaultProject("2026-09-21T00:00:00.000Z");

  assert.equal(project.id, DEFAULT_PROJECT_ID);
  assert.equal(project.status, "active");
  assert.equal(project.stage, "development");
  assert.equal(project.name, "默认项目");
  assert.equal(project.archivedAt, null);
});

test("项目数据可以校验合法结构", () => {
  assert.equal(
    isProjectData({
      id: "project-1",
      name: "提示词工具",
      description: "管理个人提示词资产",
      status: "active",
      stage: "development",
      riskLevel: "personal",
      createdAt: "2026-09-21T00:00:00.000Z",
      updatedAt: "2026-09-21T00:00:00.000Z",
      archivedAt: null,
    }),
    true,
  );
});

test("项目数据会拒绝未知状态、未知阶段和无效日期", () => {
  const baseProject = {
    id: "project-1",
    name: "提示词工具",
    description: "",
    status: "active",
    stage: "development",
    createdAt: "2026-09-21T00:00:00.000Z",
    updatedAt: "2026-09-21T00:00:00.000Z",
    archivedAt: null,
  };

  assert.equal(
    isProjectData({ ...baseProject, status: "deleted" }),
    false,
  );
  assert.equal(
    isProjectData({ ...baseProject, stage: "unknown" }),
    false,
  );
  assert.equal(
    isProjectData({ ...baseProject, updatedAt: "not-a-date" }),
    false,
  );
});

test("缺质量等级的老数据读成个人工具，未知等级也回落到个人工具", () => {
  const legacyProject = {
    id: "project-1",
    name: "提示词工具",
    description: "",
    status: "active",
    stage: "development",
    createdAt: "2026-09-21T00:00:00.000Z",
    updatedAt: "2026-09-21T00:00:00.000Z",
    archivedAt: null,
  };

  // 严格校验不认缺字段的写法，避免半截数据悄悄流进数据库
  assert.equal(isProjectData(legacyProject), false);
  assert.equal(normalizeProjectData(legacyProject).riskLevel, "personal");
  assert.equal(normalizeProjectData(null), null);
  assert.equal(readProjectRiskLevel(undefined), "personal");
  assert.equal(readProjectRiskLevel("乱写的等级"), "personal");
  assert.equal(readProjectRiskLevel("high_sensitive"), "high_sensitive");
});

test("新建项目可以带质量等级，默认是个人工具", () => {
  const project = createProjectData({
    id: "project-2",
    name: "客户数据看板",
    riskLevel: "user_data",
    now: "2026-09-23T00:00:00.000Z",
  });

  assert.equal(project.riskLevel, "user_data");
  assert.equal(
    createProjectData({ id: "project-3", name: "小工具" }).riskLevel,
    "personal",
  );
});

test("只改质量等级时其他字段不动，等级没变时原样返回", () => {
  const project = createProjectData({
    id: "project-2",
    name: "小工具",
    now: "2026-09-23T00:00:00.000Z",
  });
  const updated = updateProjectRiskLevel(
    project,
    "high_sensitive",
    "2026-09-23T01:00:00.000Z",
  );

  assert.equal(updated.riskLevel, "high_sensitive");
  assert.equal(updated.name, project.name);
  assert.equal(updated.updatedAt, "2026-09-23T01:00:00.000Z");
  assert.equal(updateProjectRiskLevel(updated, "high_sensitive"), updated);
});
