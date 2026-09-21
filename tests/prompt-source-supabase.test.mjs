import assert from "node:assert/strict";
import test from "node:test";

import { createSupabasePromptDataSource } from "../src/lib/prompt-source.ts";

function createPrompt(overrides = {}) {
  return {
    id: "prompt-a",
    title: "提示词 A",
    category: "AI效能",
    tags: ["测试"],
    content: "请处理 {{内容}}",
    useCase: "测试合并。",
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
    deletedAt: null,
    deletedReason: null,
    mergedIntoPromptId: null,
    mergeVersionId: null,
    ...overrides,
  };
}

function toPromptRow(prompt) {
  return {
    id: prompt.id,
    user_id: "user-1",
    title: prompt.title,
    category: prompt.category,
    tags: prompt.tags,
    content: prompt.content,
    use_case: prompt.useCase,
    created_at: prompt.createdAt,
    updated_at: prompt.updatedAt,
    deleted_at: prompt.deletedAt,
    deleted_reason: prompt.deletedReason,
    merged_into_prompt_id: prompt.mergedIntoPromptId,
    merge_version_id: prompt.mergeVersionId,
  };
}

function createVersionRow(overrides = {}) {
  return {
    user_id: "user-1",
    version_id: "version-1",
    prompt_id: "prompt-a",
    title: "合并前标题",
    category: "AI效能",
    tags: ["恢复"],
    content: "合并前正文",
    use_case: "恢复测试。",
    created_at: "2026-09-20T01:00:00.000Z",
    version_reason: "merge_before",
    source_prompt_ids: ["prompt-a", "prompt-b"],
    restored_at: null,
    expires_at: "2026-10-20T01:00:00.000Z",
    ...overrides,
  };
}

function createQueryBuilder(tableName, rows, callbacks) {
  const filters = [];
  let isMutation = false;
  let mutationResult = { data: null, error: null };

  const builder = {
    select(fields) {
      callbacks.selects.push({ tableName, fields });
      return builder;
    },
    is(column, value) {
      callbacks.filters.push({ tableName, kind: "is", column, value });
      filters.push((row) => {
        if (value === null) {
          return row[column] === null;
        }

        return row[column] === value;
      });
      return builder;
    },
    not(column, operator, value) {
      callbacks.filters.push({ tableName, kind: "not", column, value });
      filters.push((row) => {
        if (value === null && operator === "is") {
          return row[column] !== null;
        }

        return row[column] !== value;
      });
      return builder;
    },
    order(column, options) {
      callbacks.orders.push({ tableName, column, options });
      return builder;
    },
    eq(column, value) {
      callbacks.filters.push({ tableName, kind: "eq", column, value });
      filters.push((row) => row[column] === value);
      return builder;
    },
    insert(payload) {
      isMutation = true;
      callbacks.mutations.push({ tableName, kind: "insert", payload });
      return builder;
    },
    update(payload) {
      isMutation = true;
      callbacks.mutations.push({ tableName, kind: "update", payload });
      return builder;
    },
    upsert(payload, options) {
      isMutation = true;
      callbacks.mutations.push({ tableName, kind: "upsert", payload, options });
      return builder;
    },
    delete() {
      isMutation = true;
      callbacks.mutations.push({ tableName, kind: "delete" });
      return builder;
    },
    then(resolve) {
      return Promise.resolve(builder.execute()).then(resolve);
    },
  };

  builder.execute = () => {
    if (callbacks.queryError) {
      return { data: null, error: callbacks.queryError };
    }

    if (isMutation) {
      return mutationResult.error
        ? mutationResult
        : callbacks.mutationResult ?? { data: null, error: null };
    }

    return {
      data: rows.filter((row) => filters.every((filter) => filter(row))),
      error: null,
    };
  };

  return builder;
}

function createFakeSupabase({
  promptRows = [],
  versionRows = [],
  authUser = { id: "user-1" },
  authError = null,
  queryError = null,
  rpcResult = { data: null, error: null },
  mutationResult = { data: null, error: null },
} = {}) {
  const callbacks = {
    selects: [],
    filters: [],
    orders: [],
    mutations: [],
    queryError,
    mutationResult,
  };
  const rpcCalls = [];
  const client = {
    auth: {
      async getUser() {
        if (authError) {
          return { data: { user: null }, error: authError };
        }

        return { data: { user: authUser }, error: null };
      },
    },
    from(tableName) {
      if (tableName === "prompt_versions") {
        return createQueryBuilder(tableName, versionRows, callbacks);
      }

      return createQueryBuilder(tableName, promptRows, callbacks);
    },
    async rpc(name, params) {
      rpcCalls.push({ name, params });
      return rpcResult;
    },
  };

  return { client, callbacks, rpcCalls };
}

test("云端合并 RPC 只传递目标草稿、来源和版本标识", async () => {
  const fake = createFakeSupabase({
    promptRows: [toPromptRow(createPrompt())],
  });
  const dataSource = createSupabasePromptDataSource(fake.client);

  await dataSource.commitAiMerge({
    prompt: createPrompt({ title: "合并后的标题" }),
    sourcePromptIds: ["prompt-a", "prompt-b"],
    versionId: "version-1",
  });

  assert.equal(fake.rpcCalls.length, 1);
  assert.equal(fake.rpcCalls[0].name, "commit_prompt_merge");
  assert.deepEqual(fake.rpcCalls[0].params, {
    p_prompt_id: "prompt-a",
    p_title: "合并后的标题",
    p_category: "AI效能",
    p_tags: ["测试"],
    p_content: "请处理 {{内容}}",
    p_use_case: "测试合并。",
    p_source_prompt_ids: ["prompt-a", "prompt-b"],
    p_version_id: "version-1",
  });
});

test("云端备份合并会跳过当前在垃圾箱中的提示词", async () => {
  const trashedPrompt = createPrompt({
    id: "prompt-trash",
    title: "已在垃圾箱",
    deletedAt: "2026-09-19T00:00:00.000Z",
    deletedReason: "manual",
  });
  const newPrompt = createPrompt({
    id: "prompt-new",
    title: "新增提示词",
  });
  const fake = createFakeSupabase({
    promptRows: [
      toPromptRow(createPrompt()),
      toPromptRow(trashedPrompt),
    ],
  });
  const dataSource = createSupabasePromptDataSource(fake.client);

  const result = await dataSource.mergePrompts([
    createPrompt({
      id: "prompt-trash",
      title: "不应复活",
    }),
    newPrompt,
  ]);

  const upsert = fake.callbacks.mutations.find(
    (mutation) => mutation.kind === "upsert",
  );
  const upsertIds = upsert.payload.map((row) => row.id);

  assert.equal(result.skipCount, 1);
  assert.ok(!upsertIds.includes("prompt-trash"));
  assert.ok(upsertIds.includes("prompt-new"));
});

test("云端恢复记录查询会过滤已恢复记录并映射快照字段", async () => {
  const fake = createFakeSupabase({
    versionRows: [createVersionRow()],
  });
  const dataSource = createSupabasePromptDataSource(fake.client);

  const response = await dataSource.fetchMergeRecoveryRecords();

  assert.equal(response.records.length, 1);
  assert.deepEqual(response.records[0], {
    versionId: "version-1",
    promptId: "prompt-a",
    title: "合并前标题",
    category: "AI效能",
    tags: ["恢复"],
    content: "合并前正文",
    useCase: "恢复测试。",
    createdAt: "2026-09-20T01:00:00.000Z",
    versionReason: "merge_before",
    sourcePromptIds: ["prompt-a", "prompt-b"],
    restoredAt: null,
    expiresAt: "2026-10-20T01:00:00.000Z",
  });
  assert.ok(
    fake.callbacks.filters.some(
      (filter) =>
        filter.tableName === "prompt_versions" &&
        filter.kind === "is" &&
        filter.column === "restored_at" &&
        filter.value === null,
    ),
  );
});

// v0.9 的 AI 优化快照同样存在 prompt_versions 里，云端查询必须按原因过滤。
test("云端恢复记录查询只取合并快照，排除优化快照", async () => {
  const fake = createFakeSupabase({
    versionRows: [
      createVersionRow(),
      createVersionRow({
        version_id: "version-optimize",
        version_reason: "optimize_before",
        source_prompt_ids: [],
      }),
    ],
  });
  const dataSource = createSupabasePromptDataSource(fake.client);

  const response = await dataSource.fetchMergeRecoveryRecords();

  assert.equal(response.records.length, 1);
  assert.equal(response.records[0].versionId, "version-1");
  assert.ok(
    fake.callbacks.filters.some(
      (filter) =>
        filter.tableName === "prompt_versions" &&
        filter.kind === "eq" &&
        filter.column === "version_reason" &&
        filter.value === "merge_before",
    ),
  );
});

test("云端回到优化前会带上新生成的快照编号", async () => {
  const fake = createFakeSupabase({
    promptRows: [toPromptRow(createPrompt())],
  });
  const dataSource = createSupabasePromptDataSource(fake.client);

  await dataSource.restoreAiOptimize("prompt-a");

  assert.equal(fake.rpcCalls.length, 1);
  const [call] = fake.rpcCalls;

  assert.equal(call.name, "restore_prompt_optimize");
  assert.equal(call.params.p_prompt_id, "prompt-a");
  assert.equal(typeof call.params.p_version_id, "string");
  assert.ok(call.params.p_version_id.startsWith("version-"));
});

test("云端清空垃圾箱只调用一个原子 RPC", async () => {
  const fake = createFakeSupabase({
    promptRows: [toPromptRow(createPrompt())],
  });
  const dataSource = createSupabasePromptDataSource(fake.client);

  await dataSource.emptyTrash();

  assert.deepEqual(fake.rpcCalls, [
    { name: "empty_prompt_trash", params: undefined },
  ]);
  assert.equal(
    fake.callbacks.mutations.filter((mutation) => mutation.kind === "delete")
      .length,
    0,
  );
});

test("云端数据源会把 RPC 和查询失败转换成中文错误", async () => {
  const rpcFailure = createFakeSupabase({
    promptRows: [toPromptRow(createPrompt())],
    rpcResult: { data: null, error: { message: "rpc failed" } },
  });
  const rpcDataSource = createSupabasePromptDataSource(rpcFailure.client);

  await assert.rejects(
    () =>
      rpcDataSource.commitAiMerge({
        prompt: createPrompt(),
        sourcePromptIds: ["prompt-a", "prompt-b"],
        versionId: "version-1",
      }),
    /云端提示词合并失败/,
  );

  const queryFailure = createFakeSupabase({
    queryError: { message: "query failed" },
  });
  const queryDataSource = createSupabasePromptDataSource(
    queryFailure.client,
  );

  await assert.rejects(
    () => queryDataSource.fetchMergeRecoveryRecords(),
    /读取云端恢复记录失败/,
  );

  const emptyFailure = createFakeSupabase({
    promptRows: [toPromptRow(createPrompt())],
    rpcResult: { data: null, error: { message: "empty failed" } },
  });
  const emptyDataSource = createSupabasePromptDataSource(
    emptyFailure.client,
  );

  await assert.rejects(
    () => emptyDataSource.emptyTrash(),
    /清空云端垃圾箱失败/,
  );
});

test("云端数据源会拒绝已失效的登录状态", async () => {
  const fake = createFakeSupabase({
    authError: { message: "expired" },
  });
  const dataSource = createSupabasePromptDataSource(fake.client);

  await assert.rejects(
    () =>
      dataSource.commitAiMerge({
        prompt: createPrompt(),
        sourcePromptIds: ["prompt-a", "prompt-b"],
        versionId: "version-1",
      }),
    /登录状态已失效/,
  );
});
