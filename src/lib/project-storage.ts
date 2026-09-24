import {
  workspaceViews,
  type WorkspaceView,
} from "./asset-list.ts";

export const ACTIVE_PROJECT_STORAGE_KEY =
  "ai-prompt-manager:active-project";

export const WORKSPACE_VIEW_STORAGE_KEY = "ai-prompt-manager:workspace-view";

// 记住最近使用的项目，刷新页面后回到同一个项目。
export function loadActiveProjectId(): string | null {
  const storedValue = window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);

  if (!storedValue || !storedValue.trim()) {
    return null;
  }

  return storedValue;
}

export function saveActiveProjectId(projectId: string) {
  window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, projectId);
}

// 记住上次待在哪个视图（公共资产 / 项目），刷新页面后回到同一个视图。
export function loadWorkspaceView(): WorkspaceView | null {
  const storedValue = window.localStorage.getItem(WORKSPACE_VIEW_STORAGE_KEY);

  if (!storedValue) {
    return null;
  }

  return (workspaceViews as readonly string[]).includes(storedValue)
    ? (storedValue as WorkspaceView)
    : null;
}

export function saveWorkspaceView(view: WorkspaceView) {
  window.localStorage.setItem(WORKSPACE_VIEW_STORAGE_KEY, view);
}
