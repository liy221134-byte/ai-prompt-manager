import type { SupabaseClient } from "@supabase/supabase-js";

import type { PromptCardData } from "../data/prompts.ts";
import {
  createPromptOnServer,
  deletePromptOnServer,
  fetchPromptLibrary,
  mergePromptsOnServer,
  updatePromptOnServer,
  type PromptLibraryResponse,
  type PromptMergeResponse,
} from "./prompt-api";
import {
  createPromptImportPlan,
  PROMPT_BACKUP_TYPE,
  PROMPT_BACKUP_VERSION,
} from "./prompt-backup";

export type PromptDataSource = {
  fetchLibrary: () => Promise<PromptLibraryResponse>;
  createPrompt: (prompt: PromptCardData) => Promise<PromptLibraryResponse>;
  updatePrompt: (prompt: PromptCardData) => Promise<PromptLibraryResponse>;
  deletePrompt: (promptId: string) => Promise<PromptLibraryResponse>;
  mergePrompts: (
    prompts: PromptCardData[],
  ) => Promise<PromptMergeResponse>;
};

export const localPromptDataSource: PromptDataSource = {
  fetchLibrary: fetchPromptLibrary,
  createPrompt: createPromptOnServer,
  updatePrompt: updatePromptOnServer,
  deletePrompt: deletePromptOnServer,
  mergePrompts: mergePromptsOnServer,
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
    deletedAt: null,
    deletedReason: null,
    mergedIntoPromptId: null,
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
  async function fetchLibrary() {
    const { data, error } = await client
      .from("prompts")
      .select(
        "id, user_id, title, category, tags, content, use_case, created_at, updated_at",
      )
      .order("updated_at", { ascending: false });

    if (error) {
      throw new Error("读取云端提示词失败。");
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
        .delete()
        .eq("id", promptId)
        .eq("user_id", user.id);

      if (error) {
        throw new Error("删除云端提示词失败。");
      }

      return fetchLibrary();
    },
    async mergePrompts(importedPrompts) {
      const user = await getCurrentUser(client);
      const currentLibrary = await fetchLibrary();
      const plan = createPromptImportPlan(currentLibrary.prompts, {
        type: PROMPT_BACKUP_TYPE,
        version: PROMPT_BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        prompts: importedPrompts,
      });

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
