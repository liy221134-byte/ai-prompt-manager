export const projectStatuses = ["active", "archived"] as const;
export type ProjectStatus = (typeof projectStatuses)[number];

export const projectStages = [
  "prototype",
  "development",
  "release",
  "maintenance",
] as const;
export type ProjectStage = (typeof projectStages)[number];

export const DEFAULT_PROJECT_ID = "default-project";

export type ProjectData = {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  stage: ProjectStage;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export const projectStatusLabels: Record<ProjectStatus, string> = {
  active: "进行中",
  archived: "已归档",
};

export const projectStageLabels: Record<ProjectStage, string> = {
  prototype: "原型",
  development: "开发",
  release: "发布",
  maintenance: "维护",
};

export const projectStageOptions = projectStages.map((stage) => ({
  label: projectStageLabels[stage],
  value: stage,
}));

function isValidDateString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    !Number.isNaN(new Date(value).getTime())
  );
}

// 默认项目使用固定标识，保证本地与云端迁移结果一致。
export function createDefaultProject(
  now = new Date().toISOString(),
): ProjectData {
  return {
    id: DEFAULT_PROJECT_ID,
    name: "默认项目",
    description: "现有提示词迁移后的默认归属项目。",
    status: "active",
    stage: "development",
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
}

export function isProjectData(value: unknown): value is ProjectData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const project = value as Partial<ProjectData>;

  if (
    typeof project.id !== "string" ||
    !project.id.trim() ||
    typeof project.name !== "string" ||
    !project.name.trim() ||
    typeof project.description !== "string" ||
    !projectStatuses.includes(project.status as ProjectStatus) ||
    !projectStages.includes(project.stage as ProjectStage) ||
    !isValidDateString(project.createdAt) ||
    !isValidDateString(project.updatedAt)
  ) {
    return false;
  }

  if (project.status === "active") {
    return project.archivedAt === null;
  }

  return isValidDateString(project.archivedAt);
}

export function createProjectId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `project-${crypto.randomUUID()}`;
  }

  return `project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function isDefaultProject(project: ProjectData) {
  return project.id === DEFAULT_PROJECT_ID;
}

// 用户新建的项目从活跃状态开始，阶段默认是开发。
export function createProjectData(input: {
  id: string;
  name: string;
  description?: string;
  stage?: ProjectStage;
  now?: string;
}): ProjectData {
  const name = input.name.trim();

  if (!name) {
    throw new Error("项目名称不能为空。");
  }

  const now = input.now ?? new Date().toISOString();

  return {
    id: input.id,
    name,
    description: (input.description ?? "").trim(),
    status: "active",
    stage: input.stage ?? "development",
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
}

export function updateProjectDetails(
  project: ProjectData,
  input: { name: string; description: string; stage: ProjectStage },
  now = new Date().toISOString(),
): ProjectData {
  const name = input.name.trim();

  if (!name) {
    throw new Error("项目名称不能为空。");
  }

  return {
    ...project,
    name,
    description: input.description.trim(),
    stage: input.stage,
    updatedAt: now,
  };
}

// 归档只改状态，不删除项目和资产，重新激活后资产仍然可见。
export function archiveProject(
  project: ProjectData,
  now = new Date().toISOString(),
): ProjectData {
  if (project.status === "archived") {
    return project;
  }

  return {
    ...project,
    status: "archived",
    archivedAt: now,
    updatedAt: now,
  };
}

export function reactivateProject(
  project: ProjectData,
  now = new Date().toISOString(),
): ProjectData {
  if (project.status === "active") {
    return project;
  }

  return {
    ...project,
    status: "active",
    archivedAt: null,
    updatedAt: now,
  };
}

// 有记录就回到最近使用的项目，否则回到默认项目，再不行才用列表里的第一个。
export function resolveActiveProject(
  projects: ProjectData[],
  preferredProjectId?: string | null,
): ProjectData | null {
  if (projects.length === 0) {
    return null;
  }

  const preferredProject = preferredProjectId
    ? projects.find((project) => project.id === preferredProjectId)
    : undefined;

  if (preferredProject) {
    return preferredProject;
  }

  return (
    projects.find((project) => project.id === DEFAULT_PROJECT_ID) ??
    projects.find((project) => project.status === "active") ??
    projects[0]
  );
}
