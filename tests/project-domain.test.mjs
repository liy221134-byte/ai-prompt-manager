import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PROJECT_ID,
  createDefaultProject,
  isProjectData,
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
