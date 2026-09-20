import type {
  PromptCardData,
  PromptVersionData,
} from "../data/prompts.ts";

export type PromptLibraryResponse = {
  version: number;
  prompts: PromptCardData[];
};

export type PromptMergeResponse = PromptLibraryResponse & {
  addCount: number;
  updateCount: number;
  skipCount: number;
};

export type PromptRecoveryResponse = {
  records: PromptVersionData[];
};

export type CommitAiMergeInput = {
  prompt: PromptCardData;
  sourcePromptIds: string[];
  version: PromptVersionData;
};

export class PromptApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PromptApiError";
    this.status = status;
  }
}

async function requestJson<ResponseBody>(
  url: string,
  init?: RequestInit,
): Promise<ResponseBody> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const body = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;

  if (!response.ok) {
    throw new PromptApiError(
      body?.error ?? "本机数据服务请求失败。",
      response.status,
    );
  }

  return body as ResponseBody;
}

export function fetchPromptLibrary() {
  return requestJson<PromptLibraryResponse>("/api/prompts");
}

export function createPromptOnServer(prompt: PromptCardData) {
  return requestJson<PromptLibraryResponse>("/api/prompts", {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
}

export function updatePromptOnServer(prompt: PromptCardData) {
  return requestJson<PromptLibraryResponse>(
    `/api/prompts/${encodeURIComponent(prompt.id)}`,
    {
      method: "PUT",
      body: JSON.stringify({ prompt }),
    },
  );
}

export function deletePromptOnServer(promptId: string) {
  return requestJson<PromptLibraryResponse>(
    `/api/prompts/${encodeURIComponent(promptId)}`,
    {
      method: "DELETE",
    },
  );
}

export function mergePromptsOnServer(prompts: PromptCardData[]) {
  return requestJson<PromptMergeResponse>("/api/prompts/merge", {
    method: "POST",
    body: JSON.stringify({ prompts }),
  });
}

export function fetchTrashOnServer() {
  return requestJson<PromptLibraryResponse>("/api/prompts/trash");
}

export function restorePromptOnServer(promptId: string) {
  return requestJson<PromptLibraryResponse>(
    `/api/prompts/trash/${encodeURIComponent(promptId)}`,
    {
      method: "POST",
    },
  );
}

export function permanentlyDeletePromptOnServer(promptId: string) {
  return requestJson<PromptLibraryResponse>(
    `/api/prompts/trash/${encodeURIComponent(promptId)}`,
    {
      method: "DELETE",
    },
  );
}

export function emptyTrashOnServer() {
  return requestJson<PromptLibraryResponse>("/api/prompts/trash", {
    method: "DELETE",
  });
}

export function commitAiMergeOnServer(input: CommitAiMergeInput) {
  return requestJson<PromptLibraryResponse>("/api/prompts/ai-merge", {
    method: "POST",
    body: JSON.stringify({ input }),
  });
}

export function fetchMergeRecoveryRecordsOnServer() {
  return requestJson<PromptRecoveryResponse>("/api/prompts/recovery");
}

export function restoreMergeRecordOnServer(versionId: string) {
  return requestJson<PromptLibraryResponse>(
    `/api/prompts/recovery/${encodeURIComponent(versionId)}`,
    {
      method: "POST",
    },
  );
}

export function permanentlyDeleteMergeRecordOnServer(versionId: string) {
  return requestJson<PromptLibraryResponse>(
    `/api/prompts/recovery/${encodeURIComponent(versionId)}`,
    {
      method: "DELETE",
    },
  );
}
