"use client";

import { FolderKanban, Plus, Settings2 } from "lucide-react";

import {
  workspaceViewLabels,
  workspaceViews,
  type WorkspaceView,
} from "@/lib/asset-list";
import {
  projectStageLabels,
  projectStatusLabels,
  type ProjectData,
} from "@/data/projects";

type ProjectSwitcherProps = {
  projects: ProjectData[];
  activeProjectId: string | null;
  view: WorkspaceView;
  disabled?: boolean;
  onChangeView: (view: WorkspaceView) => void;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  onOpenProjectSettings: () => void;
};

export function ProjectSwitcher({
  projects,
  activeProjectId,
  view,
  disabled = false,
  onChangeView,
  onSelectProject,
  onCreateProject,
  onOpenProjectSettings,
}: ProjectSwitcherProps) {
  const activeProjects = projects.filter(
    (project) => project.status === "active",
  );
  const archivedProjects = projects.filter(
    (project) => project.status === "archived",
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[#dbe7f5] bg-white p-4 shadow-[0_10px_28px_rgba(30,64,175,0.05)] sm:flex-row sm:items-center">
      <div className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 p-1">
        {workspaceViews.map((option) => (
          <button
            aria-pressed={view === option}
            className={`inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-semibold transition-colors ${
              view === option
                ? "bg-white text-blue-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
            key={option}
            onClick={() => onChangeView(option)}
            type="button"
          >
            {workspaceViewLabels[option]}
          </button>
        ))}
      </div>

      {view === "public" ? (
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <FolderKanban aria-hidden="true" className="size-4" />
          </span>
          <p className="min-w-0 text-sm leading-6 text-slate-600">
            账号公共资产库：所有项目共用的方法库，新建项目时可以从这里挑资产。
          </p>
        </div>
      ) : (
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
          <FolderKanban aria-hidden="true" className="size-4" />
        </span>
        <label className="min-w-0 flex-1">
          <span className="sr-only">选择项目</span>
          <select
            className="h-11 w-full rounded-lg border border-[#dbe7f5] bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            disabled={disabled || projects.length === 0}
            onChange={(event) => onSelectProject(event.target.value)}
            value={activeProjectId ?? ""}
          >
            {projects.length === 0 && <option value="">没有项目</option>}

            {activeProjects.length > 0 && (
              <optgroup label="进行中">
                {activeProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}（{projectStageLabels[project.stage]}）
                  </option>
                ))}
              </optgroup>
            )}

            {archivedProjects.length > 0 && (
              <optgroup label={projectStatusLabels.archived}>
                {archivedProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}（{projectStatusLabels.archived}）
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
      </div>
      )}

      <div className="flex shrink-0 gap-3">
        {view !== "public" && (
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#dbe7f5] bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            disabled={disabled || !activeProjectId}
            onClick={onOpenProjectSettings}
            type="button"
          >
            <Settings2 aria-hidden="true" className="size-4" />
            项目设置
          </button>
        )}
        <button
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          onClick={onCreateProject}
          type="button"
        >
          <Plus aria-hidden="true" className="size-4" />
          新建项目
        </button>
      </div>
    </div>
  );
}
