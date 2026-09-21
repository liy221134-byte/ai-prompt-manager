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
