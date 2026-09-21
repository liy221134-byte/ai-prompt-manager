import {
  DEFAULT_PROJECT_ID,
  createDefaultProject,
  type ProjectData,
} from "../data/projects.ts";

export type ProjectSource = {
  fetchProjects: () => Promise<ProjectData[]>;
  createProject: (project: ProjectData) => Promise<ProjectData[]>;
};

// 默认项目必须始终存在：老数据迁移时会创建它，新账号首次使用时用它兜底。
export async function ensureDefaultProject(
  source: ProjectSource,
  now = new Date().toISOString(),
): Promise<ProjectData[]> {
  const projects = await source.fetchProjects();

  if (projects.some((project) => project.id === DEFAULT_PROJECT_ID)) {
    return projects;
  }

  try {
    return await source.createProject(createDefaultProject(now));
  } catch {
    // 另一个会话可能已经写入默认项目，重新读取即可。
    return source.fetchProjects();
  }
}
