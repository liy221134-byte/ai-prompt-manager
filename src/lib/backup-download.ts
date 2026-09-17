import type { PromptCardData } from "../data/prompts.ts";
import { createPromptBackup } from "./prompt-backup.ts";

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
