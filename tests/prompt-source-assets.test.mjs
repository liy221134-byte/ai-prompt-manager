import assert from "node:assert/strict";
import test from "node:test";

import { createSupabasePromptDataSource } from "../src/lib/prompt-source.ts";

function createFakeClient({
  projectRows = [],
  assetRows = [],
  assetVersionRows = [],
  authError = null,
} = {}) {
  const calls = {
    rpc: [],
    mutations: [],
  };

  function createBuilder(tableName) {
    const filters = [];
    let mutation = null;

    const builder = {
      select() {
        return builder;
      },
      order() {
        return builder;
      },
      eq(column, value) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      insert(payload) {
        mutation = { kind: "insert", payload };
        calls.mutations.push({ tableName, ...mutation });
        return builder;
      },
      update(payload) {
        mutation = { kind: "update", payload };
        calls.mutations.push({ tableName, ...mutation });
        return builder;
      },
      then(resolve) {
        const rows =
          tableName === "projects"
            ? projectRows
            : tableName === "assets"
              ? assetRows
              : assetVersionRows;

        return Promise.resolve({
          data: mutation ? null : rows.filter((row) => filters.every((fn) => fn(row))),
          error: null,
        }).then(resolve);
      },
    };

    return builder;
  }

  return {
    calls,
    client: {
      auth: {
        async getUser() {
          if (authError) {
            return { data: { user: null }, error: authError };
          }

          return { data: { user: { id: "user-1" } }, error: null };
        },
      },
      from(tableName) {
        return createBuilder(tableName);
      },
      async rpc(name, params) {
        calls.rpc.push({ name, params });
        return { data: null, error: null };
      },
    },
  };
}

function createProjectRow() {
  return {
    user_id: "user-1",
    id: "project-1",
    name: "项目一",
    description: "项目描述",
    status: "active",
    stage: "development",
    created_at: "2026-09-21T00:00:00.000Z",
    updated_at: "2026-09-21T00:00:00.000Z",
    archived_at: null,
  };
}

function createAssetRow() {
  return {
    user_id: "user-1",
    id: "rule-1",
    project_id: "default-project",
    asset_type: "rule",
    title: "规则",
    summary: "规则摘要",
    content: "规则正文",
    metadata_json: { ruleType: "must", scope: "project" },
    source_type: "manual",
    source_asset_id: null,
    import_batch_id: null,
    original_filename: null,
    current_version_id: "rule-version-1",
    status: "active",
    archived_at: null,
    deleted_at: null,
    deleted_reason: null,
    created_at: "2026-09-21T00:00:00.000Z",
    updated_at: "2026-09-21T00:00:00.000Z",
  };
}

function createAssetVersionRow() {
  return {
    user_id: "user-1",
    version_id: "rule-version-1",
    asset_id: "rule-1",
    asset_type: "rule",
    version_number: 1,
    title: "规则",
    summary: "规则摘要",
    content: "规则正文",
    metadata_json: { ruleType: "must", scope: "project" },
    change_reason: "创建规则",
    version_reason: "initial",
    source_asset_ids: [],
    restored_at: null,
    expires_at: null,
    created_at: "2026-09-21T00:00:00.000Z",
  };
}

test("云端项目查询会映射为项目领域数据", async () => {
  const fake = createFakeClient({ projectRows: [createProjectRow()] });
  const dataSource = createSupabasePromptDataSource(fake.client);

  const projects = await dataSource.fetchProjects();

  assert.deepEqual(projects, [
    {
      id: "project-1",
      name: "项目一",
      description: "项目描述",
      status: "active",
      stage: "development",
      createdAt: "2026-09-21T00:00:00.000Z",
      updatedAt: "2026-09-21T00:00:00.000Z",
      archivedAt: null,
    },
  ]);
});

test("云端创建资产通过 save_asset 原子保存并返回资产列表", async () => {
  const fake = createFakeClient({ assetRows: [createAssetRow()] });
  const dataSource = createSupabasePromptDataSource(fake.client);
  const asset = {
    id: "rule-1",
    projectId: "default-project",
    assetType: "rule",
    title: "规则",
    summary: "规则摘要",
    content: "规则正文",
    metadata: { ruleType: "must", scope: "project" },
    source: {
      sourceType: "manual",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: "rule-version-1",
    status: "active",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: "2026-09-21T00:00:00.000Z",
    updatedAt: "2026-09-21T00:00:00.000Z",
  };

  const assets = await dataSource.createAsset({
    asset,
    versionId: "rule-version-1",
    changeReason: "创建规则",
  });

  assert.equal(fake.calls.rpc.length, 1);
  assert.equal(fake.calls.rpc[0].name, "save_asset");
  assert.equal(fake.calls.rpc[0].params.p_asset_id, "rule-1");
  assert.equal(fake.calls.rpc[0].params.p_version_id, "rule-version-1");
  assert.equal(fake.calls.rpc[0].params.p_version_reason, "initial");
  assert.equal(assets[0].id, "rule-1");
});

test("云端资产版本查询会映射版本字段", async () => {
  const fake = createFakeClient({
    assetVersionRows: [createAssetVersionRow()],
  });
  const dataSource = createSupabasePromptDataSource(fake.client);

  const versions = await dataSource.fetchAssetVersions("rule-1");

  assert.equal(versions.length, 1);
  assert.equal(versions[0].versionId, "rule-version-1");
  assert.equal(versions[0].versionReason, "initial");
  assert.deepEqual(versions[0].sourceAssetIds, []);
});
