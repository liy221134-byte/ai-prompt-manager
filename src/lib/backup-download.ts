import type { PromptCardData } from "../data/prompts.ts";
import type { AssetData } from "../data/assets.ts";
import type { ProjectData } from "../data/projects.ts";
import { createAssetBackup, createPromptBackup } from "./prompt-backup.ts";
import type { RulePackFile } from "./seed-pack-import.ts";

function formatFileDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}-${hours}${minutes}`;
}

function downloadFile(fileName: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");

  downloadLink.href = url;
  downloadLink.download = fileName;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  URL.revokeObjectURL(url);
}

function downloadJsonFile(fileName: string, content: string) {
  downloadFile(fileName, content, "application/json;charset=utf-8");
}

export function downloadPromptBackup(prompts: PromptCardData[]) {
  const exportedAt = new Date().toISOString();
  const content = createPromptBackup(prompts, exportedAt);

  downloadJsonFile(
    `ai-prompt-backup-${formatFileDate(new Date(exportedAt))}.json`,
    content,
  );

  return exportedAt;
}

// 2.1.2 起导出的是 v2：项目、提示词、规则、文档、技术档案和关系一起走
export function downloadAssetBackup(input: {
  projects: ProjectData[];
  assets: AssetData[];
}) {
  const exportedAt = new Date().toISOString();
  const backup = createAssetBackup({ ...input, exportedAt });

  downloadJsonFile(
    `ai-prompt-backup-${formatFileDate(new Date(exportedAt))}.json`,
    JSON.stringify(backup, null, 2),
  );

  return exportedAt;
}

// 规则包单独导出：文件名带包标识，方便在多个环境之间搬运
export function downloadRulePack(file: RulePackFile) {
  const date = formatFileDate(new Date());
  const slug = file.pack.id.replace(/^rule-pack-/, "");

  downloadJsonFile(`rule-pack-${slug}-${date}.json`, JSON.stringify(file, null, 2));

  return file.exportedAt;
}

// 编译草稿按纯文本下载，文件名就是 AGENTS.md 这类产物名
export function downloadCompiledDraft(draft: {
  fileName: string;
  content: string;
}) {
  downloadFile(draft.fileName, draft.content, "text/markdown;charset=utf-8");
}
