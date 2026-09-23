import type {
  PromptCardData,
  PromptContentData,
} from "../data/prompts.ts";
import { isPromptCard } from "./prompt-storage.ts";

import type { AssetData } from "../data/assets.ts";
import { isAssetData } from "../data/assets.ts";
import type { ProjectData } from "../data/projects.ts";
import { normalizeProjectData } from "../data/projects.ts";

export const PROMPT_BACKUP_TYPE = "ai-prompt-manager-backup";
export const PROMPT_BACKUP_VERSION = 1;

// 2.1.2 起备份升级到 v2：项目、提示词、规则、文档、技术档案和关系一起备份。
// 来源包的二进制原文不进备份，换库后需要另行保留原始文件。
export const ASSET_BACKUP_VERSION = 2;

export const ASSET_BACKUP_NOTE =
  "备份包含项目、提示词、规则、文档、技术档案和资产之间的关"
  + "系；来源包的原始文件不在备份里，需要另行保留。";

export type AssetBackup = {
  type: typeof PROMPT_BACKUP_TYPE;
  version: typeof ASSET_BACKUP_VERSION;
  exportedAt: string;
  note: string;
  projects: ProjectData[];
  assets: AssetData[];
};

export function createAssetBackup(input: {
  projects: ProjectData[];
  assets: AssetData[];
  exportedAt?: string;
}): AssetBackup {
  return {
    type: PROMPT_BACKUP_TYPE,
    version: ASSET_BACKUP_VERSION,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    note: ASSET_BACKUP_NOTE,
    // 只备份没进垃圾箱的资产，垃圾箱里的内容按既有约定不进备份
    projects: input.projects.map((project) => ({ ...project })),
    assets: input.assets
      .filter((asset) => !asset.deletedAt)
      .map((asset) => ({ ...asset })),
  };
}

export type AssetBackupParseResult =
  | { kind: "prompt"; backup: PromptBackup }
  | { kind: "asset"; backup: AssetBackup };

// 统一入口：v1（只有提示词）和 v2（项目 + 资产）都能读
export function parseBackup(content: string): AssetBackupParseResult {
  const parsed: unknown = (() => {
    try {
      return JSON.parse(content);
    } catch {
      throw new Error("备份文件不是有效的 JSON。");
    }
  })();

  const version =
    parsed && typeof parsed === "object"
      ? (parsed as { version?: unknown }).version
      : undefined;

  if (version === ASSET_BACKUP_VERSION) {
    return { kind: "asset", backup: parseAssetBackup(parsed) };
  }

  return { kind: "prompt", backup: parsePromptBackup(content) };
}

function parseAssetBackup(value: unknown): AssetBackup {
  if (!value || typeof value !== "object") {
    throw new Error("备份文件结构不正确。");
  }

  const candidate = value as Partial<AssetBackup>;

  if (candidate.type !== PROMPT_BACKUP_TYPE) {
    throw new Error("这不是本工具导出的备份文件。");
  }

  if (
    typeof candidate.exportedAt !== "string" ||
    !isValidDate(candidate.exportedAt)
  ) {
    throw new Error("备份文件缺少导出时间。");
  }

  if (!Array.isArray(candidate.projects) || !Array.isArray(candidate.assets)) {
    throw new Error("备份文件缺少项目或资产列表。");
  }

  for (const asset of candidate.assets) {
    if (!isAssetData(asset)) {
      throw new Error("备份文件里有资产数据不完整，无法导入。");
    }
  }

  for (const project of candidate.projects) {
    // 老备份里没有质量等级，这里统一补齐成默认值，读回来就是完整的项目数据
    if (!normalizeProjectData(project)) {
      throw new Error("备份文件里有项目数据不完整，无法导入。");
    }
  }

  return {
    ...(candidate as AssetBackup),
    projects: candidate.projects.map(
      (project) => normalizeProjectData(project) as ProjectData,
    ),
  };
}

// 导入到已有库时，同名项目按名称合并到已有项目，不新建重复项目
export function planProjectMerge(
  existing: ProjectData[],
  incoming: ProjectData[],
) {
  const mapping = new Map<string, string>();

  for (const project of incoming) {
    const matched = existing.find(
      (item) => item.name.trim() === project.name.trim(),
    );

    mapping.set(project.id, matched ? matched.id : project.id);
  }

  return mapping;
}

export type AssetImportPlan = {
  // 需要新建的项目（没有同名项目可合并的）
  projectsToCreate: ProjectData[];
  // 备份里的项目 id → 落库后的项目 id
  projectIdMap: Map<string, string>;
  // 需要新建的资产（本地已有同 id 的会跳过，不覆盖本地版本）
  assetsToCreate: AssetData[];
  skippedAssetIds: string[];
};

// 导入 v2 备份的规划：只新增、不覆盖。
// 同名项目按名称合并；本地已有同 id 资产时跳过，避免把本地较新的版本盖掉。
export function planAssetImport(input: {
  existingProjects: ProjectData[];
  existingAssets: AssetData[];
  backup: AssetBackup;
}): AssetImportPlan {
  const projectIdMap = planProjectMerge(
    input.existingProjects,
    input.backup.projects,
  );
  const existingIds = new Set(input.existingAssets.map((asset) => asset.id));

  // 判断「要不要新建」不能只看 id 映射：同名项目的 id 恰好相同时（默认项目就是这样），
  // 映射结果等于自身，会被误判成需要新建。这里按 id 和名称各查一次。
  const projectsToCreate = input.backup.projects.filter((project) => {
    const sameId = input.existingProjects.some(
      (item) => item.id === project.id,
    );
    const sameName = input.existingProjects.some(
      (item) => item.name.trim() === project.name.trim(),
    );

    return !sameId && !sameName;
  });

  const assetsToCreate: AssetData[] = [];
  const skippedAssetIds: string[] = [];

  for (const asset of input.backup.assets) {
    if (existingIds.has(asset.id)) {
      skippedAssetIds.push(asset.id);
      continue;
    }

    assetsToCreate.push({
      ...asset,
      projectId: projectIdMap.get(asset.projectId) ?? asset.projectId,
    });
  }

  return { projectsToCreate, projectIdMap, assetsToCreate, skippedAssetIds };
}


export type PromptBackup = {
  type: typeof PROMPT_BACKUP_TYPE;
  version: number;
  exportedAt: string;
  prompts: PromptCardData[];
};

export type ImportAction = "add" | "update" | "skip";

export type ImportPreviewItem = {
  id: string;
  title: string;
  action: ImportAction;
  reason: string;
};

export type PromptImportPlan = {
  backup: PromptBackup;
  items: ImportPreviewItem[];
  mergedPrompts: PromptCardData[];
  addCount: number;
  updateCount: number;
  skipCount: number;
};

export function promptToContentData(
  prompt: PromptCardData,
): PromptContentData {
  return {
    id: prompt.id,
    title: prompt.title,
    category: prompt.category,
    tags: [...prompt.tags],
    content: prompt.content,
    useCase: prompt.useCase,
    createdAt: prompt.createdAt,
    updatedAt: prompt.updatedAt,
  };
}

function isValidDate(value: string) {
  return !Number.isNaN(new Date(value).getTime());
}

// 备份文件是独立的数据交换格式，必须同时校验类型、版本和每条提示词。
export function parsePromptBackup(content: string): PromptBackup {
  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(content);
  } catch {
    throw new Error("备份文件不是有效的 JSON 文件。");
  }

  if (!parsedValue || typeof parsedValue !== "object") {
    throw new Error("备份文件结构无法识别。");
  }

  const backup = parsedValue as Partial<PromptBackup>;

  if (backup.type !== PROMPT_BACKUP_TYPE) {
    throw new Error("这不是 AI 提示词资产库的备份文件。");
  }

  if (backup.version !== PROMPT_BACKUP_VERSION) {
    throw new Error("当前版本暂不支持这个备份文件。");
  }

  if (
    typeof backup.exportedAt !== "string" ||
    !isValidDate(backup.exportedAt)
  ) {
    throw new Error("备份文件缺少有效的导出时间。");
  }

  if (
    !Array.isArray(backup.prompts) ||
    !backup.prompts.every(isPromptCard)
  ) {
    throw new Error("备份文件中的提示词数据不完整。");
  }

  const promptIds = backup.prompts.map((prompt) => prompt.id);

  if (new Set(promptIds).size !== promptIds.length) {
    throw new Error("备份文件中存在重复的提示词标识。");
  }

  return {
    type: PROMPT_BACKUP_TYPE,
    version: PROMPT_BACKUP_VERSION,
    exportedAt: backup.exportedAt,
    prompts: backup.prompts.map((prompt) => ({
      ...prompt,
      deletedAt: null,
      deletedReason: null,
      mergedIntoPromptId: null,
      mergeVersionId: null,
    })),
  };
}

export function createPromptBackup(
  prompts: PromptCardData[],
  exportedAt = new Date().toISOString(),
) {
  const backupFile = {
    type: PROMPT_BACKUP_TYPE,
    version: PROMPT_BACKUP_VERSION,
    exportedAt,
    prompts: prompts.map(promptToContentData),
  } satisfies Omit<PromptBackup, "prompts"> & {
    prompts: PromptContentData[];
  };

  return JSON.stringify(
    backupFile,
    null,
    2,
  );
}

function promptsAreEqual(
  firstPrompt: PromptCardData,
  secondPrompt: PromptCardData,
) {
  return (
    firstPrompt.title === secondPrompt.title &&
    firstPrompt.category === secondPrompt.category &&
    firstPrompt.useCase === secondPrompt.useCase &&
    firstPrompt.content === secondPrompt.content &&
    firstPrompt.updatedAt === secondPrompt.updatedAt &&
    firstPrompt.createdAt === secondPrompt.createdAt &&
    firstPrompt.tags.length === secondPrompt.tags.length &&
    firstPrompt.tags.every((tag, index) => tag === secondPrompt.tags[index])
  );
}

// 导入只新增、更新或跳过，不删除本机已有提示词。
export function createPromptImportPlan(
  currentPrompts: PromptCardData[],
  backup: PromptBackup,
  trashedPromptIds: ReadonlySet<string> = new Set(),
): PromptImportPlan {
  const currentById = new Map(
    currentPrompts.map((prompt) => [prompt.id, prompt]),
  );
  const importedById = new Map(
    backup.prompts.map((prompt) => [prompt.id, prompt]),
  );
  const items: ImportPreviewItem[] = [];
  const addedPrompts: PromptCardData[] = [];
  let addCount = 0;
  let updateCount = 0;
  let skipCount = 0;

  for (const importedPrompt of backup.prompts) {
    if (trashedPromptIds.has(importedPrompt.id)) {
      skipCount += 1;
      items.push({
        id: importedPrompt.id,
        title: importedPrompt.title,
        action: "skip",
        reason: "这条提示词当前在垃圾箱中，导入时已跳过。",
      });
      continue;
    }

    const currentPrompt = currentById.get(importedPrompt.id);

    if (!currentPrompt) {
      addCount += 1;
      addedPrompts.push(importedPrompt);
      items.push({
        id: importedPrompt.id,
        title: importedPrompt.title,
        action: "add",
        reason: "本机不存在这条提示词。",
      });
      continue;
    }

    if (promptsAreEqual(currentPrompt, importedPrompt)) {
      skipCount += 1;
      items.push({
        id: importedPrompt.id,
        title: importedPrompt.title,
        action: "skip",
        reason: "内容与本机版本相同。",
      });
      continue;
    }

    const currentUpdatedAt = new Date(currentPrompt.updatedAt).getTime();
    const importedUpdatedAt = new Date(importedPrompt.updatedAt).getTime();

    if (importedUpdatedAt > currentUpdatedAt) {
      updateCount += 1;
      items.push({
        id: importedPrompt.id,
        title: importedPrompt.title,
        action: "update",
        reason: "备份版本更新时间较新。",
      });
      continue;
    }

    skipCount += 1;
    items.push({
      id: importedPrompt.id,
      title: importedPrompt.title,
      action: "skip",
      reason:
        importedUpdatedAt === currentUpdatedAt
          ? "更新时间相同，保留本机版本。"
          : "本机版本更新时间较新。",
    });
  }

  const updatedPrompts = currentPrompts.map(
    (currentPrompt) =>
      importedById.get(currentPrompt.id) &&
      items.some(
        (item) =>
          item.id === currentPrompt.id && item.action === "update",
      )
        ? importedById.get(currentPrompt.id)!
        : currentPrompt,
  );

  return {
    backup,
    items,
    mergedPrompts: [...updatedPrompts, ...addedPrompts],
    addCount,
    updateCount,
    skipCount,
  };
}
