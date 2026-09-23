export const projectStatuses = ["active", "archived"] as const;
export type ProjectStatus = (typeof projectStatuses)[number];

export const projectStages = [
  "prototype",
  "development",
  "release",
  "maintenance",
] as const;
export type ProjectStage = (typeof projectStages)[number];

// 项目质量等级：决定这个项目该有哪些工程文档、该关注哪些规则方向、发布前要做哪些检查。
// 它是项目的一级属性，和「阶段」正交——阶段说的是走到哪了，等级说的是出事的代价有多大。
export const projectRiskLevels = [
  "personal",
  "low_risk",
  "user_data",
  "high_sensitive",
] as const;
export type ProjectRiskLevel = (typeof projectRiskLevels)[number];

export const defaultProjectRiskLevel: ProjectRiskLevel = "personal";

export const DEFAULT_PROJECT_ID = "default-project";

export type ProjectData = {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  stage: ProjectStage;
  riskLevel: ProjectRiskLevel;
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

export const projectRiskLevelLabels: Record<ProjectRiskLevel, string> = {
  personal: "个人工具",
  low_risk: "低风险生产",
  user_data: "涉及用户数据",
  high_sensitive: "高敏感项目",
};

// 老数据和老备份里没有这个字段，一律按最低等级读，不做强制补齐
export function readProjectRiskLevel(value: unknown): ProjectRiskLevel {
  return projectRiskLevels.includes(value as ProjectRiskLevel)
    ? (value as ProjectRiskLevel)
    : defaultProjectRiskLevel;
}

export const projectStageOptions = projectStages.map((stage) => ({
  label: projectStageLabels[stage],
  value: stage,
}));

export const projectRiskLevelOptions = projectRiskLevels.map((level) => ({
  label: projectRiskLevelLabels[level],
  value: level,
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
    riskLevel: defaultProjectRiskLevel,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
}

// 补齐缺省字段后再校验：老备份、老行数据都能读进来
export function normalizeProjectData(value: unknown): ProjectData | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = {
    ...(value as Record<string, unknown>),
    riskLevel: readProjectRiskLevel((value as Record<string, unknown>).riskLevel),
  };

  return isProjectData(candidate) ? candidate : null;
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
    !projectRiskLevels.includes(project.riskLevel as ProjectRiskLevel) ||
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
  riskLevel?: ProjectRiskLevel;
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
    riskLevel: input.riskLevel ?? defaultProjectRiskLevel,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
}

export function updateProjectDetails(
  project: ProjectData,
  input: {
    name: string;
    description: string;
    stage: ProjectStage;
    riskLevel?: ProjectRiskLevel;
  },
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
    riskLevel: input.riskLevel ?? project.riskLevel,
    updatedAt: now,
  };
}

// 只改质量等级：项目设置里切换等级走这条，其他字段原样不动
export function updateProjectRiskLevel(
  project: ProjectData,
  riskLevel: ProjectRiskLevel,
  now = new Date().toISOString(),
): ProjectData {
  if (project.riskLevel === riskLevel) {
    return project;
  }

  return {
    ...project,
    riskLevel,
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
