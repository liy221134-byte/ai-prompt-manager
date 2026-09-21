export const ACTIVE_PROJECT_STORAGE_KEY =
  "ai-prompt-manager:active-project";

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
