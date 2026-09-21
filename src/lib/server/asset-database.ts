import type { DatabaseSync } from "node:sqlite";

import {
  type AssetData,
  type AssetVersionData,
  createAssetVersion,
  createInitialAssetVersionId,
  isAssetData,
  isAssetVersionData,
  promptToAsset,
} from "../../data/assets.ts";
import {
  DEFAULT_PROJECT_ID,
  type ProjectData,
  createDefaultProject,
  isProjectData,
} from "../../data/projects.ts";
import type {
  PromptCardData,
} from "../../data/prompts.ts";

type LegacyPromptRow = {
  id: string;
  title: string;
  category: string;
  tags_json: string;
  content: string;
  use_case: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_reason: "manual" | "merge" | null;
  merged_into_prompt_id: string | null;
  merge_version_id: string | null;
};

type LegacyPromptVersionRow = {
  version_id: string;
  prompt_id: string;
  title: string;
  category: string;
  tags_json: string;
  content: string;
  use_case: string;
  created_at: string;
  version_reason:
    | "merge_before"
    | "optimize_before"
    | "restore_before";
  source_prompt_ids_json: string;
  restored_at: string | null;
  expires_at: string;
};

type ProjectRow = {
  id: string;
  name: string;
  description: string;
  status: string;
  stage: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type AssetRow = {
  id: string;
  project_id: string;
  asset_type: string;
  title: string;
  summary: string;
  content: string;
  metadata_json: string;
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

type AssetVersionRow = {
  version_id: string;
  asset_id: string;
  asset_type: string;
  version_number: number;
  title: string;
  summary: string;
  content: string;
  metadata_json: string;
  change_reason: string;
  version_reason: string;
  source_asset_ids_json: string;
  restored_at: string | null;
  expires_at: string | null;
  created_at: string;
};

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${label}不是有效的 JSON。`);
  }
}

function rowToPrompt(row: LegacyPromptRow): PromptCardData {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    tags: JSON.parse(row.tags_json) as string[],
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

function rowToProject(row: ProjectRow): ProjectData {
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
    throw new Error(`项目数据无法识别：${row.id}。`);
  }

  return value;
}

function rowToAsset(row: AssetRow): AssetData {
  const value = {
    id: row.id,
    projectId: row.project_id,
    assetType: row.asset_type,
    title: row.title,
    summary: row.summary,
    content: row.content,
    metadata: parseJson(row.metadata_json, "资产元数据"),
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
    throw new Error(`资产数据无法识别：${row.id}。`);
  }

  return value;
}

function rowToAssetVersion(row: AssetVersionRow): AssetVersionData {
  const value = {
    versionId: row.version_id,
    assetId: row.asset_id,
    assetType: row.asset_type,
    versionNumber: row.version_number,
    title: row.title,
    summary: row.summary,
    content: row.content,
    metadata: parseJson(row.metadata_json, "资产版本元数据"),
    changeReason: row.change_reason,
    versionReason: row.version_reason,
    sourceAssetIds: parseJson(row.source_asset_ids_json, "资产版本来源"),
    restoredAt: row.restored_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };

  if (!isAssetVersionData(value)) {
    throw new Error(`资产版本数据无法识别：${row.version_id}。`);
  }

  return value;
}

export function ensureAssetSchema(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      stage TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      asset_type TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_asset_id TEXT,
      import_batch_id TEXT,
      original_filename TEXT,
      current_version_id TEXT NOT NULL,
      status TEXT NOT NULL,
      archived_at TEXT,
      deleted_at TEXT,
      deleted_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS asset_versions (
      version_id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES assets(id),
      asset_type TEXT NOT NULL,
      version_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      change_reason TEXT NOT NULL,
      version_reason TEXT NOT NULL,
      source_asset_ids_json TEXT NOT NULL,
      restored_at TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS assets_project_updated_idx
    ON assets (project_id, updated_at DESC);

    CREATE INDEX IF NOT EXISTS assets_project_type_idx
    ON assets (project_id, asset_type, updated_at DESC);

    CREATE INDEX IF NOT EXISTS assets_deleted_idx
    ON assets (deleted_at);

    CREATE UNIQUE INDEX IF NOT EXISTS asset_versions_asset_number_idx
    ON asset_versions (asset_id, version_number);

    CREATE INDEX IF NOT EXISTS asset_versions_asset_created_idx
    ON asset_versions (asset_id, created_at DESC);
  `);
}

function insertProject(database: DatabaseSync, project: ProjectData) {
  return database
    .prepare(
      `
        INSERT OR IGNORE INTO projects (
          id, name, description, status, stage, created_at, updated_at, archived_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      project.id,
      project.name,
      project.description,
      project.status,
      project.stage,
      project.createdAt,
      project.updatedAt,
      project.archivedAt,
    );
}

export function saveProject(
  database: DatabaseSync,
  project: ProjectData,
) {
  return database
    .prepare(
      `
        INSERT INTO projects (
          id, name, description, status, stage, created_at, updated_at, archived_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          status = excluded.status,
          stage = excluded.stage,
          updated_at = excluded.updated_at,
          archived_at = excluded.archived_at
      `,
    )
    .run(
      project.id,
      project.name,
      project.description,
      project.status,
      project.stage,
      project.createdAt,
      project.updatedAt,
      project.archivedAt,
    );
}

function upsertAsset(database: DatabaseSync, asset: AssetData) {
  return database
    .prepare(
      `
        INSERT INTO assets (
          id,
          project_id,
          asset_type,
          title,
          summary,
          content,
          metadata_json,
          source_type,
          source_asset_id,
          import_batch_id,
          original_filename,
          current_version_id,
          status,
          archived_at,
          deleted_at,
          deleted_reason,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          project_id = excluded.project_id,
          title = excluded.title,
          summary = excluded.summary,
          content = excluded.content,
          metadata_json = excluded.metadata_json,
          source_type = excluded.source_type,
          source_asset_id = excluded.source_asset_id,
          import_batch_id = excluded.import_batch_id,
          original_filename = excluded.original_filename,
          current_version_id = excluded.current_version_id,
          status = excluded.status,
          archived_at = excluded.archived_at,
          deleted_at = excluded.deleted_at,
          deleted_reason = excluded.deleted_reason,
          updated_at = excluded.updated_at
      `,
    )
    .run(
      asset.id,
      asset.projectId,
      asset.assetType,
      asset.title,
      asset.summary,
      asset.content,
      JSON.stringify(asset.metadata),
      asset.source.sourceType,
      asset.source.sourceAssetId,
      asset.source.importBatchId,
      asset.source.originalFilename,
      asset.currentVersionId,
      asset.status,
      asset.archivedAt,
      asset.deletedAt,
      asset.deletedReason,
      asset.createdAt,
      asset.updatedAt,
    );
}

export function saveAsset(database: DatabaseSync, asset: AssetData) {
  return upsertAsset(database, asset);
}

function insertAssetVersion(
  database: DatabaseSync,
  version: AssetVersionData,
) {
  return database
    .prepare(
      `
        INSERT OR IGNORE INTO asset_versions (
          version_id,
          asset_id,
          asset_type,
          version_number,
          title,
          summary,
          content,
          metadata_json,
          change_reason,
          version_reason,
          source_asset_ids_json,
          restored_at,
          expires_at,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      version.versionId,
      version.assetId,
      version.assetType,
      version.versionNumber,
      version.title,
      version.summary,
      version.content,
      JSON.stringify(version.metadata),
      version.changeReason,
      version.versionReason,
      JSON.stringify(version.sourceAssetIds),
      version.restoredAt,
      version.expiresAt,
      version.createdAt,
    );
}

export function saveAssetVersion(
  database: DatabaseSync,
  version: AssetVersionData,
) {
  return insertAssetVersion(database, version);
}

function getMaxAssetVersionNumber(
  database: DatabaseSync,
  assetId: string,
) {
  const row = database
    .prepare(
      `
        SELECT COALESCE(MAX(version_number), 0) AS version_number
        FROM asset_versions
        WHERE asset_id = ?
      `,
    )
    .get(assetId) as { version_number: number };

  return Number(row.version_number);
}

function promptVersionToAssetVersion(
  row: LegacyPromptVersionRow,
  versionNumber: number,
): AssetVersionData {
  return {
    versionId: row.version_id,
    assetId: row.prompt_id,
    assetType: "prompt",
    versionNumber,
    title: row.title,
    summary: row.use_case,
    content: row.content,
    metadata: {
      category: row.category,
      tags: JSON.parse(row.tags_json) as string[],
      useCase: row.use_case,
      mergedIntoAssetId: null,
      mergeVersionId: null,
    },
    changeReason: row.version_reason,
    versionReason: row.version_reason,
    sourceAssetIds: JSON.parse(row.source_prompt_ids_json) as string[],
    restoredAt: row.restored_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function versionMatchesAsset(
  version: AssetVersionData,
  asset: AssetData,
) {
  return (
    version.assetType === asset.assetType &&
    version.title === asset.title &&
    version.summary === asset.summary &&
    version.content === asset.content &&
    JSON.stringify(version.metadata) === JSON.stringify(asset.metadata)
  );
}

function findMatchingVersion(
  versions: AssetVersionData[],
  asset: AssetData,
) {
  return versions.find((version) => versionMatchesAsset(version, asset));
}

function migratePromptVersions(
  database: DatabaseSync,
  asset: AssetData,
) {
  const rows = database
    .prepare(
      `
        SELECT
          version_id,
          prompt_id,
          title,
          category,
          tags_json,
          content,
          use_case,
          created_at,
          version_reason,
          source_prompt_ids_json,
          restored_at,
          expires_at
        FROM prompt_versions
        WHERE prompt_id = ?
        ORDER BY created_at ASC, version_id ASC
      `,
    )
    .all(asset.id) as LegacyPromptVersionRow[];

  let versionNumber = getMaxAssetVersionNumber(database, asset.id);

  for (const row of rows) {
    const existing = database
      .prepare("SELECT version_id FROM asset_versions WHERE version_id = ?")
      .get(row.version_id);

    if (existing) {
      continue;
    }

    versionNumber += 1;
    insertAssetVersion(
      database,
      promptVersionToAssetVersion(row, versionNumber),
    );
  }
}

function syncPromptToAsset(database: DatabaseSync, prompt: PromptCardData) {
  const migratedAsset = promptToAsset(prompt, DEFAULT_PROJECT_ID);
  const legacyVersionsBefore = database
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM asset_versions
        WHERE asset_id = ?
      `,
    )
    .get(prompt.id) as { count: number };

  // 先写入资产主行，再迁移版本，满足 asset_versions 的外键约束。
  upsertAsset(database, migratedAsset);
  migratePromptVersions(database, migratedAsset);

  const versions = listAssetVersions(database, prompt.id);
  const matchingVersion = findMatchingVersion(versions, migratedAsset);
  let currentVersionId = matchingVersion?.versionId;

  if (!currentVersionId) {
    const storedCurrent = database
      .prepare("SELECT current_version_id FROM assets WHERE id = ?")
      .get(prompt.id) as { current_version_id: string } | undefined;
    const storedCurrentVersion = storedCurrent
      ? versions.find(
          (version) => version.versionId === storedCurrent.current_version_id,
        )
      : undefined;

    if (
      storedCurrentVersion &&
      versionMatchesAsset(storedCurrentVersion, migratedAsset)
    ) {
      currentVersionId = storedCurrentVersion.versionId;
    } else {
      const versionNumber = getMaxAssetVersionNumber(database, prompt.id) + 1;
      const versionId =
        versions.length === 0
          ? createInitialAssetVersionId(prompt.id)
          : `sync-${prompt.id}-${versionNumber}`;
      const currentVersion = createAssetVersion(migratedAsset, {
        versionId,
        versionNumber,
        changeReason:
          versions.length === 0
            ? "迁移旧提示词当前内容"
            : "同步旧数据结构中的最新内容",
        versionReason: "migration",
        createdAt: prompt.updatedAt,
      });
      insertAssetVersion(database, currentVersion);
      currentVersionId = currentVersion.versionId;
    }
  }

  const asset = {
    ...migratedAsset,
    currentVersionId,
  };
  upsertAsset(database, asset);

  const versionCountAfter = database
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM asset_versions
        WHERE asset_id = ?
      `,
    )
    .get(prompt.id) as { count: number };

  return (
    Number(versionCountAfter.count) !== Number(legacyVersionsBefore.count)
  );
}

export function syncLegacyPromptsToAssets(database: DatabaseSync) {
  const project = createDefaultProject();
  const projectResult = insertProject(database, project);
  const rows = database
    .prepare(
      `
        SELECT
          id,
          title,
          category,
          tags_json,
          content,
          use_case,
          created_at,
          updated_at,
          deleted_at,
          deleted_reason,
          merged_into_prompt_id,
          merge_version_id
        FROM prompts
        ORDER BY id ASC
      `,
    )
    .all() as LegacyPromptRow[];
  const promptIds = new Set(rows.map((row) => row.id));
  let changedCount = Number(projectResult.changes);

  for (const row of rows) {
    if (syncPromptToAsset(database, rowToPrompt(row))) {
      changedCount += 1;
    }
  }

  const staleAssets = database
    .prepare("SELECT id FROM assets WHERE asset_type = 'prompt'")
    .all() as Array<{ id: string }>;

  for (const asset of staleAssets) {
    if (promptIds.has(asset.id)) {
      continue;
    }

    database
      .prepare("DELETE FROM asset_versions WHERE asset_id = ?")
      .run(asset.id);
    database.prepare("DELETE FROM assets WHERE id = ?").run(asset.id);
    changedCount += 1;
  }

  return changedCount;
}

export function listProjects(database: DatabaseSync) {
  const rows = database
    .prepare(
      `
        SELECT
          id, name, description, status, stage, created_at, updated_at, archived_at
        FROM projects
        ORDER BY created_at ASC, id ASC
      `,
    )
    .all() as ProjectRow[];

  return rows.map(rowToProject);
}

export function getAssetById(database: DatabaseSync, assetId: string) {
  const row = database
    .prepare("SELECT * FROM assets WHERE id = ?")
    .get(assetId) as AssetRow | undefined;

  return row ? rowToAsset(row) : null;
}

export function getDefaultProject(database: DatabaseSync) {
  const row = database
    .prepare(
      `
        SELECT
          id, name, description, status, stage, created_at, updated_at, archived_at
        FROM projects
        WHERE id = ?
      `,
    )
    .get(DEFAULT_PROJECT_ID) as ProjectRow | undefined;

  if (!row) {
    throw new Error("默认项目不存在。");
  }

  return rowToProject(row);
}

export function listAssets(
  database: DatabaseSync,
  projectId?: string,
) {
  const rows = projectId
    ? (database
        .prepare(
          `
            SELECT *
            FROM assets
            WHERE project_id = ?
            ORDER BY updated_at DESC, id ASC
          `,
        )
        .all(projectId) as AssetRow[])
    : (database
        .prepare(
          `
            SELECT *
            FROM assets
            ORDER BY updated_at DESC, id ASC
          `,
        )
        .all() as AssetRow[]);

  return rows.map(rowToAsset);
}

export function listAssetVersions(
  database: DatabaseSync,
  assetId?: string,
) {
  const rows = assetId
    ? (database
        .prepare(
          `
            SELECT *
            FROM asset_versions
            WHERE asset_id = ?
            ORDER BY version_number ASC, version_id ASC
          `,
        )
        .all(assetId) as AssetVersionRow[])
    : (database
        .prepare(
          `
            SELECT *
            FROM asset_versions
            ORDER BY created_at ASC, version_id ASC
          `,
        )
        .all() as AssetVersionRow[]);

  return rows.map(rowToAssetVersion);
}
