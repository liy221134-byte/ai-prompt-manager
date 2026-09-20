import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  PromptCardData,
  PromptVersionData,
} from "../data/prompts.ts";
import {
  commitAiMergeOnServer,
  createPromptOnServer,
  deletePromptOnServer,
  emptyTrashOnServer,
  fetchMergeRecoveryRecordsOnServer,
  fetchPromptLibrary,
  fetchTrashOnServer,
  mergePromptsOnServer,
  permanentlyDeleteMergeRecordOnServer,
  permanentlyDeletePromptOnServer,
  restoreMergeRecordOnServer,
  restorePromptOnServer,
  updatePromptOnServer,
  type CommitAiMergeInput,
  type PromptLibraryResponse,
  type PromptMergeResponse,
  type PromptRecoveryResponse,
} from "./prompt-api.ts";
import {
  createPromptImportPlan,
  PROMPT_BACKUP_TYPE,
  PROMPT_BACKUP_VERSION,
} from "./prompt-backup.ts";

export type PromptDataSource = {
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
};

export const localPromptDataSource: PromptDataSource = {
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
};

type SupabasePromptRow = {
  id: string;
  user_id: string;
  title: string;
  category: string;
  tags: string[] | null;
  content: string;
  use_case: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_reason: "manual" | "merge" | null;
  merged_into_prompt_id: string | null;
  merge_version_id: string | null;
};

type SupabasePromptVersionRow = {
  user_id: string;
  version_id: string;
  prompt_id: string;
  title: string;
  category: string;
  tags: string[] | null;
  content: string;
  use_case: string;
  created_at: string;
  version_reason: "merge_before";
  source_prompt_ids: string[];
  restored_at: string | null;
  expires_at: string;
};

function rowToPrompt(row: SupabasePromptRow): PromptCardData {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    tags: row.tags ?? [],
    content: row.content,
    useCase: row.use_case,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    deletedReason: row.deleted_reason,
    mergedIntoPromptId: row.merged_into_prompt_id,
    mergeVersionId: row.merge_version_id,
  };
}

function rowToVersion(
  row: SupabasePromptVersionRow,
): PromptVersionData {
  return {
    versionId: row.version_id,
    promptId: row.prompt_id,
    title: row.title,
    category: row.category,
    tags: row.tags ?? [],
    content: row.content,
    useCase: row.use_case,
    createdAt: row.created_at,
    versionReason: row.version_reason,
    sourcePromptIds: row.source_prompt_ids,
    restoredAt: row.restored_at,
    expiresAt: row.expires_at,
  };
}

function promptToRow(prompt: PromptCardData, userId: string) {
  return {
    id: prompt.id,
    user_id: userId,
    title: prompt.title,
    category: prompt.category,
    tags: prompt.tags,
    content: prompt.content,
    use_case: prompt.useCase,
    created_at: prompt.createdAt,
    updated_at: prompt.updatedAt,
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
  const promptSelect =
    "id, user_id, title, category, tags, content, use_case, created_at, updated_at, deleted_at, deleted_reason, merged_into_prompt_id, merge_version_id";

  async function fetchLibrary() {
    const { data, error } = await client
      .from("prompts")
      .select(promptSelect)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (error) {
      throw new Error("读取云端提示词失败。");
    }

    return createLibraryResponse(
      (data as SupabasePromptRow[]).map(rowToPrompt),
    );
  }

  async function fetchTrash() {
    const { data, error } = await client
      .from("prompts")
      .select(promptSelect)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });

    if (error) {
      throw new Error("读取云端垃圾箱失败。");
    }

    return createLibraryResponse(
      (data as SupabasePromptRow[]).map(rowToPrompt),
    );
  }

  return {
    fetchLibrary,
    async createPrompt(prompt) {
      const user = await getCurrentUser(client);
      const { error } = await client
        .from("prompts")
        .insert(promptToRow(prompt, user.id));

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
      const user = await getCurrentUser(client);
      const { error } = await client
        .from("prompts")
        .update(promptToRow(prompt, user.id))
        .eq("id", prompt.id)
        .eq("user_id", user.id);

      if (error) {
        throw new Error("更新云端提示词失败。");
      }

      return fetchLibrary();
    },
    async deletePrompt(promptId) {
      const user = await getCurrentUser(client);
      const { error } = await client
        .from("prompts")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_reason: "manual",
          merged_into_prompt_id: null,
          merge_version_id: null,
        })
        .eq("id", promptId)
        .eq("user_id", user.id)
        .is("deleted_at", null);

      if (error) {
        throw new Error("删除云端提示词失败。");
      }

      return fetchLibrary();
    },
    fetchTrash,
    async restorePrompt(promptId) {
      const user = await getCurrentUser(client);
      const { error } = await client
        .from("prompts")
        .update({
          deleted_at: null,
          deleted_reason: null,
          merged_into_prompt_id: null,
          merge_version_id: null,
        })
        .eq("id", promptId)
        .eq("user_id", user.id)
        .not("deleted_at", "is", null);

      if (error) {
        throw new Error("恢复云端提示词失败。");
      }

      return fetchLibrary();
    },
    async permanentlyDeletePrompt(promptId) {
      const user = await getCurrentUser(client);
      const { error } = await client
        .from("prompts")
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
      const { error } = await client.rpc("empty_prompt_trash");

      if (error) {
        throw new Error("清空云端垃圾箱失败。");
      }

      return fetchLibrary();
    },
    async commitAiMerge(input) {
      await getCurrentUser(client);
      const { error } = await client.rpc("commit_prompt_merge", {
        p_prompt_id: input.prompt.id,
        p_title: input.prompt.title,
        p_category: input.prompt.category,
        p_tags: input.prompt.tags,
        p_content: input.prompt.content,
        p_use_case: input.prompt.useCase,
        p_source_prompt_ids: input.sourcePromptIds,
        p_version_id: input.versionId,
      });

      if (error) {
        throw new Error("云端提示词合并失败。");
      }

      return fetchLibrary();
    },
    async fetchMergeRecoveryRecords() {
      const { data, error } = await client
        .from("prompt_versions")
        .select(
          "user_id, version_id, prompt_id, title, category, tags, content, use_case, created_at, version_reason, source_prompt_ids, restored_at, expires_at",
        )
        .is("restored_at", null)
        .order("created_at", { ascending: false });

      if (error) {
        throw new Error("读取云端恢复记录失败。");
      }

      return {
        records: (data as SupabasePromptVersionRow[]).map(rowToVersion),
      };
    },
    async restoreMergeRecord(versionId) {
      const { error } = await client.rpc("restore_prompt_merge", {
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
        .from("prompt_versions")
        .delete()
        .eq("version_id", versionId)
        .eq("user_id", user.id);

      if (error) {
        throw new Error("彻底删除云端恢复记录失败。");
      }

      return fetchLibrary();
    },
    async mergePrompts(importedPrompts) {
      const user = await getCurrentUser(client);
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
        const rows = plan.mergedPrompts.map((prompt) =>
          promptToRow(prompt, user.id),
        );
        const { error } = await client
          .from("prompts")
          .upsert(rows, { onConflict: "user_id,id" });

        if (error) {
          throw new Error("合并云端提示词失败。");
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
