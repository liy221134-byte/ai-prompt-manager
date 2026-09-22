import type { PromptCardData } from "../data/prompts.ts";
import type { AssetData } from "../data/assets.ts";
import type { ProjectData } from "../data/projects.ts";
import { createAssetBackup, createPromptBackup } from "./prompt-backup.ts";

function formatFileDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}-${hours}${minutes}`;
}

export function downloadPromptBackup(prompts: PromptCardData[]) {
  const exportedAt = new Date().toISOString();
  const content = createPromptBackup(prompts, exportedAt);
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");

  downloadLink.href = url;
  downloadLink.download = `ai-prompt-backup-${formatFileDate(new Date(exportedAt))}.json`;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  URL.revokeObjectURL(url);

  return exportedAt;
}

// 2.1.2 起导出的是 v2：项目、提示词、规则、文档、技术档案和关系一起走
export function downloadAssetBackup(input: {
  projects: ProjectData[];
  assets: AssetData[];
}) {
  const exportedAt = new Date().toISOString();
  const backup = createAssetBackup({ ...input, exportedAt });
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");

  downloadLink.href = url;
  downloadLink.download = `ai-prompt-backup-${formatFileDate(new Date(exportedAt))}.json`;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  URL.revokeObjectURL(url);

  return exportedAt;
}
