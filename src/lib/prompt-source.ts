import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  PromptCardData,
  PromptVersionData,
  PromptVersionReason,
} from "../data/prompts.ts";
import type {
  AssetData,
  AssetVersionData,
  AssetVersionReason,
  PromptAssetMetadata,
} from "../data/assets.ts";
import {
  assetToPrompt,
  createInitialAssetVersionId,
  isAssetData,
  isAssetVersionData,
  promptToAsset,
} from "../data/assets.ts";
import type { ProjectData } from "../data/projects.ts";
import { DEFAULT_PROJECT_ID, isProjectData } from "../data/projects.ts";
import {
  createAssetOnServer,
  createProjectOnServer,
  commitAiOptimizeOnServer,
  commitAiMergeOnServer,
  createPromptOnServer,
  deletePromptOnServer,
  emptyTrashOnServer,
  fetchMergeRecoveryRecordsOnServer,
  fetchOptimizeVersionOnServer,
  fetchAssetsOnServer,
  fetchAssetVersionsOnServer,
  fetchPromptLibrary,
  fetchProjectsOnServer,
  fetchTrashOnServer,
  mergePromptsOnServer,
  permanentlyDeleteMergeRecordOnServer,
  permanentlyDeletePromptOnServer,
  restoreAiOptimizeOnServer,
  restoreMergeRecordOnServer,
  restorePromptOnServer,
  updatePromptOnServer,
  updateAssetOnServer,
  updateProjectOnServer,
  type AssetSaveInput,
  type CommitAiMergeInput,
  type CommitAiOptimizeInput,
  type PromptLibraryResponse,
  type PromptMergeResponse,
  type PromptOptimizeVersionResponse,
  type PromptRecoveryResponse,
} from "./prompt-api.ts";
import {
  createPromptImportPlan,
  PROMPT_BACKUP_TYPE,
  PROMPT_BACKUP_VERSION,
} from "./prompt-backup.ts";

export type PromptDataSource = {
  fetchProjects: () => Promise<ProjectData[]>;
  createProject: (project: ProjectData) => Promise<ProjectData[]>;
  updateProject: (project: ProjectData) => Promise<ProjectData[]>;
  fetchAssets: (projectId?: string) => Promise<AssetData[]>;
  createAsset: (input: AssetSaveInput) => Promise<AssetData[]>;
  updateAsset: (input: AssetSaveInput) => Promise<AssetData[]>;
  fetchAssetVersions: (assetId: string) => Promise<AssetVersionData[]>;
  fetchLibrary: () => Promise<PromptLibraryResponse>;
  createPrompt: (prompt: PromptCardData) => Promise<PromptLibraryResponse>;
  updatePrompt: (prompt: PromptCardData) => Promise<PromptLibraryResponse>;
  deletePrompt: (promptId: string) => Promise<PromptLibraryResponse>;
  mergePrompts: (
    prompts: PromptCardData[],
  ) => Promise<PromptMergeResponse>;
  fetchTrash: () => Promise<PromptLibraryResponse>;
  restorePrompt: (promptId: string) => Promise<PromptLibraryResponse>;
  permanentlyDeletePrompt: (
    promptId: string,
  ) => Promise<PromptLibraryResponse>;
  emptyTrash: () => Promise<PromptLibraryResponse>;
  commitAiMerge: (
    input: CommitAiMergeInput,
  ) => Promise<PromptLibraryResponse>;
  fetchMergeRecoveryRecords: () => Promise<PromptRecoveryResponse>;
  restoreMergeRecord: (
    versionId: string,
  ) => Promise<PromptLibraryResponse>;
  permanentlyDeleteMergeRecord: (
    versionId: string,
  ) => Promise<PromptLibraryResponse>;
  commitAiOptimize: (
    input: CommitAiOptimizeInput,
  ) => Promise<PromptLibraryResponse>;
  fetchOptimizeVersion: (
    promptId: string,
  ) => Promise<PromptOptimizeVersionResponse>;
  // 回退会新写一条「回退前快照」，快照标识由服务端生成，调用方只提供提示词标识。
  restoreAiOptimize: (promptId: string) => Promise<PromptLibraryResponse>;
};

export const localPromptDataSource: PromptDataSource = {
  async fetchProjects() {
    return (await fetchProjectsOnServer()).projects;
  },
  async createProject(project) {
    return (await createProjectOnServer(project)).projects;
  },
  async updateProject(project) {
    return (await updateProjectOnServer(project)).projects;
  },
  async fetchAssets(projectId) {
    return (await fetchAssetsOnServer(projectId)).assets;
  },
  async createAsset(input) {
    return (await createAssetOnServer(input)).assets;
  },
  async updateAsset(input) {
    return (await updateAssetOnServer(input)).assets;
  },
  async fetchAssetVersions(assetId) {
    return (await fetchAssetVersionsOnServer(assetId)).versions;
  },
  fetchLibrary: fetchPromptLibrary,
  createPrompt: createPromptOnServer,
  updatePrompt: updatePromptOnServer,
  deletePrompt: deletePromptOnServer,
  mergePrompts: mergePromptsOnServer,
  fetchTrash: fetchTrashOnServer,
  restorePrompt: restorePromptOnServer,
  permanentlyDeletePrompt: permanentlyDeletePromptOnServer,
  emptyTrash: emptyTrashOnServer,
  commitAiMerge: commitAiMergeOnServer,
  fetchMergeRecoveryRecords: fetchMergeRecoveryRecordsOnServer,
  restoreMergeRecord: restoreMergeRecordOnServer,
  permanentlyDeleteMergeRecord: permanentlyDeleteMergeRecordOnServer,
  commitAiOptimize: commitAiOptimizeOnServer,
  fetchOptimizeVersion: fetchOptimizeVersionOnServer,
  restoreAiOptimize: restoreAiOptimizeOnServer,
};

type SupabaseProjectRow = {
  user_id: string;
  id: string;
  name: string;
  description: string;
  status: string;
  stage: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type SupabaseAssetRow = {
  user_id: string;
  id: string;
  project_id: string;
  asset_type: string;
  title: string;
  summary: string;
  content: string;
  metadata_json: unknown;
  source_type: string;
  source_asset_id: string | null;
  import_batch_id: string | null;
  original_filename: string | null;
  current_version_id: string;
  status: string;
  archived_at: string | null;
  deleted_at: string | null;
  deleted_reason: string | null;
  created_at: string;
  updated_at: string;
};

type SupabaseAssetVersionRow = {
  user_id: string;
  version_id: string;
  asset_id: string;
  asset_type: string;
  version_number: number;
  title: string;
  summary: string;
  content: string;
  metadata_json: unknown;
  change_reason: string;
  version_reason: string;
  source_asset_ids: string[] | null;
  restored_at: string | null;
  expires_at: string | null;
  created_at: string;
};

// 2.1.0 起提示词也写在统一资产里：这两个助手负责把资产版本翻译回提示词版本，
// 以及把提示词组装成 save_asset 需要的参数。
function assetVersionToPromptVersion(
  version: AssetVersionData,
): PromptVersionData {
  const metadata = version.metadata as PromptAssetMetadata;

  return {
    versionId: version.versionId,
    promptId: version.assetId,
    title: version.title,
    category: metadata.category,
    tags: [...metadata.tags],
    content: version.content,
    useCase: metadata.useCase,
    createdAt: version.createdAt,
    versionReason: version.versionReason as PromptVersionReason,
    sourcePromptIds: [...version.sourceAssetIds],
    restoredAt: version.restoredAt,
    expiresAt: version.expiresAt ?? "",
  };
}

function createCloudVersionId() {
  return `version-${crypto.randomUUID()}`;
}

function promptSaveAssetParams(
  prompt: PromptCardData,
  options: {
    versionId: string;
    changeReason: string;
    versionReason: AssetVersionReason;
  },
) {
  const asset = promptToAsset(
    {
      ...prompt,
      tags: [...prompt.tags],
      deletedAt: prompt.deletedAt ?? null,
      deletedReason: prompt.deletedReason ?? null,
      mergedIntoPromptId: prompt.mergedIntoPromptId ?? null,
      mergeVersionId: prompt.mergeVersionId ?? null,
    },
    DEFAULT_PROJECT_ID,
  );

  return {
    p_asset_id: asset.id,
    p_project_id: asset.projectId,
    p_asset_type: asset.assetType,
    p_title: asset.title,
    p_summary: asset.summary,
    p_content: asset.content,
    p_metadata: asset.metadata,
    p_source_type: "manual",
    p_source_asset_id: null,
    p_import_batch_id: null,
    p_original_filename: null,
    p_status: asset.status,
    p_archived_at: asset.archivedAt,
    p_deleted_at: asset.deletedAt,
    p_deleted_reason: asset.deletedReason,
    p_version_id: options.versionId,
    p_change_reason: options.changeReason,
    p_version_reason: options.versionReason,
    p_source_asset_ids: [],
    p_restored_at: null,
    p_expires_at: null,
    p_asset_created_at: asset.createdAt,
    p_asset_updated_at: asset.updatedAt,
  };
}

function rowToProject(row: SupabaseProjectRow): ProjectData {
  const value = {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    stage: row.stage,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };

  if (!isProjectData(value)) {
    throw new Error("云端项目数据无法识别。");
  }

  return value;
}

function rowToAsset(row: SupabaseAssetRow): AssetData {
  const value = {
    id: row.id,
    projectId: row.project_id,
    assetType: row.asset_type,
    title: row.title,
    summary: row.summary,
    content: row.content,
    metadata: row.metadata_json,
    source: {
      sourceType: row.source_type,
      sourceAssetId: row.source_asset_id,
      importBatchId: row.import_batch_id,
      originalFilename: row.original_filename,
    },
    currentVersionId: row.current_version_id,
    status: row.status,
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
    deletedReason: row.deleted_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (!isAssetData(value)) {
    throw new Error("云端资产数据无法识别。");
  }

  return value;
}

function rowToAssetVersion(
  row: SupabaseAssetVersionRow,
): AssetVersionData {
  const value = {
    versionId: row.version_id,
    assetId: row.asset_id,
    assetType: row.asset_type,
    versionNumber: row.version_number,
    title: row.title,
    summary: row.summary,
    content: row.content,
    metadata: row.metadata_json,
    changeReason: row.change_reason,
    versionReason: row.version_reason,
    sourceAssetIds: row.source_asset_ids ?? [],
    restoredAt: row.restored_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };

  if (!isAssetVersionData(value)) {
    throw new Error("云端资产版本数据无法识别。");
  }

  return value;
}

function projectToRow(project: ProjectData, userId: string) {
  return {
    user_id: userId,
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    stage: project.stage,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
    archived_at: project.archivedAt,
  };
}

async function getCurrentUser(client: SupabaseClient) {
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) {
    throw new Error("登录状态已失效，请重新登录。");
  }

  return user;
}

function createLibraryResponse(prompts: PromptCardData[]) {
  const version = prompts.reduce((latest, prompt) => {
    const timestamp = new Date(prompt.updatedAt).getTime();
    return Number.isNaN(timestamp) ? latest : Math.max(latest, timestamp);
  }, 0);

  return { version, prompts };
}

export function createSupabasePromptDataSource(
  client: SupabaseClient,
): PromptDataSource {
  const projectSelect =
    "user_id, id, name, description, status, stage, created_at, updated_at, archived_at";
  const assetSelect =
    "user_id, id, project_id, asset_type, title, summary, content, metadata_json, source_type, source_asset_id, import_batch_id, original_filename, current_version_id, status, archived_at, deleted_at, deleted_reason, created_at, updated_at";
  const assetVersionSelect =
    "user_id, version_id, asset_id, asset_type, version_number, title, summary, content, metadata_json, change_reason, version_reason, source_asset_ids, restored_at, expires_at, created_at";

  async function fetchProjects() {
    const { data, error } = await client
      .from("projects")
      .select(projectSelect)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error("读取云端项目失败。");
    }

    return (data as SupabaseProjectRow[]).map(rowToProject);
  }

  async function fetchAssets(projectId?: string) {
    let query = client.from("assets").select(assetSelect);

    if (projectId) {
      query = query.eq("project_id", projectId);
    }

    const { data, error } = await query.order("updated_at", {
      ascending: false,
    });

    if (error) {
      throw new Error("读取云端资产失败。");
    }

    return (data as SupabaseAssetRow[]).map(rowToAsset);
  }

  // 提示词现在存在统一资产里，读取时按类型过滤再翻译回提示词结构。
  function assetRowToPrompt(row: SupabaseAssetRow): PromptCardData {
    const asset = rowToAsset(row);

    if (asset.assetType !== "prompt") {
      throw new Error("云端提示词数据类型不匹配。");
    }

    return assetToPrompt(asset);
  }

  async function fetchLibrary() {
    const { data, error } = await client
      .from("assets")
      .select(assetSelect)
      .eq("asset_type", "prompt")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (error) {
      throw new Error("读取云端提示词失败。");
    }

    return createLibraryResponse((data as SupabaseAssetRow[]).map(assetRowToPrompt));
  }

  async function fetchTrash() {
    const { data, error } = await client
      .from("assets")
      .select(assetSelect)
      .eq("asset_type", "prompt")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });

    if (error) {
      throw new Error("读取云端垃圾箱失败。");
    }

    return createLibraryResponse((data as SupabaseAssetRow[]).map(assetRowToPrompt));
  }

  return {
    fetchProjects,
    async createProject(project) {
      const user = await getCurrentUser(client);
      const { error } = await client
        .from("projects")
        .insert(projectToRow(project, user.id));

      if (error) {
        throw new Error(
          error.code === "23505"
            ? "这个项目已经存在。"
            : "创建云端项目失败。",
        );
      }

      return fetchProjects();
    },
    async updateProject(project) {
      const user = await getCurrentUser(client);
      const { error } = await client
        .from("projects")
        .update({
          name: project.name,
          description: project.description,
          status: project.status,
          stage: project.stage,
          updated_at: project.updatedAt,
          archived_at: project.archivedAt,
        })
        .eq("id", project.id)
        .eq("user_id", user.id);

      if (error) {
        throw new Error("更新云端项目失败。");
      }

      return fetchProjects();
    },
    fetchAssets,
    async createAsset(input) {
      await getCurrentUser(client);
      const { error } = await client.rpc("save_asset", {
        p_asset_id: input.asset.id,
        p_project_id: input.asset.projectId,
        p_asset_type: input.asset.assetType,
        p_title: input.asset.title,
        p_summary: input.asset.summary,
        p_content: input.asset.content,
        p_metadata: input.asset.metadata,
        p_source_type: input.asset.source.sourceType,
        p_source_asset_id: input.asset.source.sourceAssetId,
        p_import_batch_id: input.asset.source.importBatchId,
        p_original_filename: input.asset.source.originalFilename,
        p_status: input.asset.status,
        p_archived_at: input.asset.archivedAt,
        p_deleted_at: input.asset.deletedAt,
        p_deleted_reason: input.asset.deletedReason,
        p_version_id: input.versionId,
        p_change_reason: input.changeReason,
        p_version_reason: input.versionReason ?? "initial",
        p_source_asset_ids: input.sourceAssetIds ?? [],
        p_restored_at: input.restoredAt ?? null,
        p_expires_at: input.expiresAt ?? null,
        p_asset_created_at: input.asset.createdAt,
        p_asset_updated_at: input.asset.updatedAt,
      });

      if (error) {
        throw new Error("创建云端资产失败。");
      }

      return fetchAssets(input.asset.projectId);
    },
    async updateAsset(input) {
      await getCurrentUser(client);
      const { error } = await client.rpc("save_asset", {
        p_asset_id: input.asset.id,
        p_project_id: input.asset.projectId,
        p_asset_type: input.asset.assetType,
        p_title: input.asset.title,
        p_summary: input.asset.summary,
        p_content: input.asset.content,
        p_metadata: input.asset.metadata,
        p_source_type: input.asset.source.sourceType,
        p_source_asset_id: input.asset.source.sourceAssetId,
        p_import_batch_id: input.asset.source.importBatchId,
        p_original_filename: input.asset.source.originalFilename,
        p_status: input.asset.status,
        p_archived_at: input.asset.archivedAt,
        p_deleted_at: input.asset.deletedAt,
        p_deleted_reason: input.asset.deletedReason,
        p_version_id: input.versionId,
        p_change_reason: input.changeReason,
        p_version_reason: input.versionReason ?? "save",
        p_source_asset_ids: input.sourceAssetIds ?? [],
        p_restored_at: input.restoredAt ?? null,
        p_expires_at: input.expiresAt ?? null,
        p_asset_created_at: input.asset.createdAt,
        p_asset_updated_at: input.asset.updatedAt,
      });

      if (error) {
        throw new Error("更新云端资产失败。");
      }

      return fetchAssets(input.asset.projectId);
    },
    async fetchAssetVersions(assetId) {
      const { data, error } = await client
        .from("asset_versions")
        .select(assetVersionSelect)
        .eq("asset_id", assetId)
        .order("version_number", { ascending: true });

      if (error) {
        throw new Error("读取云端资产版本失败。");
      }

      return (data as SupabaseAssetVersionRow[]).map(rowToAssetVersion);
    },
    fetchLibrary,
    async createPrompt(prompt) {
      await getCurrentUser(client);
      const { error } = await client.rpc(
        "save_asset",
        promptSaveAssetParams(prompt, {
          versionId: createInitialAssetVersionId(prompt.id),
          changeReason: "创建提示词",
          versionReason: "initial",
        }),
      );

      if (error) {
        throw new Error(
          error.code === "23505"
            ? "这条提示词已经存在。"
            : "新增云端提示词失败。",
        );
      }

      return fetchLibrary();
    },
    async updatePrompt(prompt) {
      await getCurrentUser(client);
      const { error } = await client.rpc(
        "save_asset",
        promptSaveAssetParams(prompt, {
          versionId: createCloudVersionId(),
          changeReason: "保存提示词",
          versionReason: "save",
        }),
      );

      if (error) {
        throw new Error("更新云端提示词失败。");
      }

      return fetchLibrary();
    },
    async deletePrompt(promptId) {
      await getCurrentUser(client);
      const { error } = await client.rpc("set_asset_trash_state", {
        p_asset_id: promptId,
        p_deleted: true,
        p_reason: "manual",
      });

      if (error) {
        throw new Error("删除云端提示词失败。");
      }

      return fetchLibrary();
    },
    fetchTrash,
    async restorePrompt(promptId) {
      await getCurrentUser(client);
      const { error } = await client.rpc("set_asset_trash_state", {
        p_asset_id: promptId,
        p_deleted: false,
      });

      if (error) {
        throw new Error("恢复云端提示词失败。");
      }

      return fetchLibrary();
    },
    async permanentlyDeletePrompt(promptId) {
      const user = await getCurrentUser(client);
      const { error } = await client
        .from("assets")
        .delete()
        .eq("id", promptId)
        .eq("user_id", user.id)
        .not("deleted_at", "is", null);

      if (error) {
        throw new Error("彻底删除云端提示词失败。");
      }

      return fetchLibrary();
    },
    async emptyTrash() {
      const { error } = await client.rpc("empty_asset_trash");

      if (error) {
        throw new Error("清空云端垃圾箱失败。");
      }

      return fetchLibrary();
    },
    async commitAiMerge(input) {
      await getCurrentUser(client);
      const { error } = await client.rpc("commit_asset_merge", {
        p_asset_id: input.prompt.id,
        p_title: input.prompt.title,
        p_summary: input.prompt.useCase,
        p_content: input.prompt.content,
        p_metadata: {
          category: input.prompt.category,
          tags: input.prompt.tags,
          useCase: input.prompt.useCase,
          mergedIntoAssetId: input.prompt.mergedIntoPromptId ?? null,
          mergeVersionId: input.prompt.mergeVersionId ?? null,
        },
        p_source_asset_ids: input.sourcePromptIds,
        p_asset_updated_at: input.prompt.updatedAt,
      });

      if (error) {
        throw new Error("云端提示词合并失败。");
      }

      return fetchLibrary();
    },
    async fetchMergeRecoveryRecords() {
      const { data, error } = await client
        .from("asset_versions")
        .select(assetVersionSelect)
        .eq("asset_type", "prompt")
        .is("restored_at", null)
        .eq("version_reason", "merge_before")
        .order("created_at", { ascending: false });

      if (error) {
        throw new Error("读取云端恢复记录失败。");
      }

      return {
        records: (data as SupabaseAssetVersionRow[])
          .map(rowToAssetVersion)
          .map(assetVersionToPromptVersion),
      };
    },
    async restoreMergeRecord(versionId) {
      const { error } = await client.rpc("restore_asset_merge", {
        p_version_id: versionId,
      });

      if (error) {
        throw new Error("恢复云端合并结果失败。");
      }

      return fetchLibrary();
    },
    async permanentlyDeleteMergeRecord(versionId) {
      const user = await getCurrentUser(client);
      const { error } = await client
        .from("asset_versions")
        .delete()
        .eq("version_id", versionId)
        .eq("user_id", user.id);

      if (error) {
        throw new Error("彻底删除云端恢复记录失败。");
      }

      return fetchLibrary();
    },
    async commitAiOptimize(input) {
      await getCurrentUser(client);
      const { error } = await client.rpc("commit_asset_optimize", {
        p_asset_id: input.prompt.id,
        p_title: input.prompt.title,
        p_summary: input.prompt.useCase,
        p_content: input.prompt.content,
        p_metadata: {
          category: input.prompt.category,
          tags: input.prompt.tags,
          useCase: input.prompt.useCase,
          mergedIntoAssetId: input.prompt.mergedIntoPromptId ?? null,
          mergeVersionId: input.prompt.mergeVersionId ?? null,
        },
        p_asset_updated_at: input.prompt.updatedAt,
      });

      if (error) {
        throw new Error("保存云端优化结果失败。");
      }

      return fetchLibrary();
    },
    async fetchOptimizeVersion(promptId) {
      await getCurrentUser(client);
      const { data, error } = await client
        .from("asset_versions")
        .select(assetVersionSelect)
        .eq("asset_id", promptId)
        .eq("version_reason", "optimize_before")
        .is("restored_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) {
        throw new Error("读取云端优化记录失败。");
      }

      const rows = (data as SupabaseAssetVersionRow[]).map(rowToAssetVersion);

      return {
        version: rows.length > 0 ? assetVersionToPromptVersion(rows[0]) : null,
      };
    },
    async restoreAiOptimize(promptId) {
      await getCurrentUser(client);
      // 回退前快照的编号由资产函数内部生成，客户端不再传。
      const { error } = await client.rpc("restore_asset_optimize", {
        p_asset_id: promptId,
      });

      if (error) {
        throw new Error("回到云端优化前失败。");
      }

      return fetchLibrary();
    },
    async mergePrompts(importedPrompts) {
      await getCurrentUser(client);
      const [currentLibrary, trashLibrary] = await Promise.all([
        fetchLibrary(),
        fetchTrash(),
      ]);
      const trashedPromptIds = new Set(
        trashLibrary.prompts.map((prompt) => prompt.id),
      );
      const plan = createPromptImportPlan(
        currentLibrary.prompts,
        {
          type: PROMPT_BACKUP_TYPE,
          version: PROMPT_BACKUP_VERSION,
          exportedAt: new Date().toISOString(),
          prompts: importedPrompts,
        },
        trashedPromptIds,
      );

      if (plan.addCount + plan.updateCount > 0) {
        for (const prompt of plan.mergedPrompts) {
          const isExisting = currentLibrary.prompts.some(
            (item) => item.id === prompt.id,
          );
          const { error } = await client.rpc(
            "save_asset",
            promptSaveAssetParams(prompt, {
              versionId: isExisting
                ? createCloudVersionId()
                : createInitialAssetVersionId(prompt.id),
              changeReason: isExisting ? "备份导入更新" : "备份导入",
              versionReason: isExisting ? "save" : "initial",
            }),
          );

          if (error) {
            throw new Error("合并云端提示词失败。");
          }
        }
      }

      const nextLibrary = await fetchLibrary();

      return {
        ...nextLibrary,
        addCount: plan.addCount,
        updateCount: plan.updateCount,
        skipCount: plan.skipCount,
      };
    },
  };
}
