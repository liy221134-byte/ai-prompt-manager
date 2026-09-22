import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import {
  promptCards,
  type PromptCardData,
  type PromptVersionData,
  type PromptVersionReason,
} from "../../data/prompts.ts";
import {
  assetToPrompt,
  createAssetVersion,
  createInitialAssetVersionId,
  promptToAsset,
  type AssetData,
  type AssetVersionReason,
  type AssetVersionData,
  type PromptAssetData,
  type PromptAssetMetadata,
} from "../../data/assets.ts";
import type { ProjectData } from "../../data/projects.ts";
import {
  createPromptImportPlan,
  PROMPT_BACKUP_TYPE,
  PROMPT_BACKUP_VERSION,
} from "../prompt-backup.ts";
import { PROMPT_TRASH_RETENTION_DAYS } from "../prompt-lifecycle.ts";
import type { SourcePackageCreationPlan } from "../source-package-confirm.ts";
import {
  backfillAssetsFromLegacyPrompts,
  ensureAssetSchema,
  getAssetById as readAssetById,
  getDefaultProject as readDefaultProject,
  listAssetVersions as readAssetVersions,
  listAssets as readAssets,
  listProjects as readProjects,
  saveAsset as saveAssetRecord,
  saveAssetVersion as saveAssetVersionRecord,
  saveProject as saveProjectRecord,
} from "./asset-database.ts";

// 快照版本的中文说明，写进资产版本的变更原因里。
const PROMPT_SNAPSHOT_REASON_LABELS: Record<PromptVersionReason, string> = {
  merge_before: "合并前快照",
  optimize_before: "优化前快照",
  restore_before: "回退前快照",
};

type MetaRow = {
  value: string;
};

export type PromptLibrarySnapshot = {
  version: number;
  prompts: PromptCardData[];
};

export type PromptMergeResult = PromptLibrarySnapshot & {
  addCount: number;
  updateCount: number;
  skipCount: number;
};

// 本地模式的快照编号在这里生成，格式与客户端保持一致。
function createPromptVersionId() {
  return `version-${randomUUID()}`;
}

export type AssetSaveInput = {
  asset: AssetData;
  versionId: string;
  changeReason: string;
  versionReason?: AssetVersionReason;
  sourceAssetIds?: string[];
  restoredAt?: string | null;
  expiresAt?: string | null;
};

function createDefaultDatabasePath() {
  return (
    process.env.PROMPT_DB_PATH ??
    join(process.cwd(), ".data", "prompts.sqlite")
  );
}

export class PromptDatabase {
  private database: DatabaseSync;
  // 事务嵌套深度：内层直接复用外层事务，避免出现嵌套 BEGIN
  private transactionDepth = 0;

  constructor(databasePath = createDefaultDatabasePath()) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);

    try {
      this.initialize();
    } catch (error) {
      // 初始化失败时关掉连接，否则文件句柄会一直占着数据库，也不利于恢复。
      this.database.close();
      throw error;
    }
  }

  private initialize() {
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS prompts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        content TEXT NOT NULL,
        use_case TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    this.ensurePromptLifecycleColumns();

    this.database.exec(`
      CREATE TABLE IF NOT EXISTS prompt_versions (
        version_id TEXT PRIMARY KEY,
        prompt_id TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        content TEXT NOT NULL,
        use_case TEXT NOT NULL,
        created_at TEXT NOT NULL,
        version_reason TEXT NOT NULL,
        source_prompt_ids_json TEXT NOT NULL,
        restored_at TEXT,
        expires_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS prompt_versions_prompt_idx
      ON prompt_versions (prompt_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS prompt_versions_expires_idx
      ON prompt_versions (expires_at);

      CREATE INDEX IF NOT EXISTS prompts_deleted_idx
      ON prompts (deleted_at);
    `);

    ensureAssetSchema(this.database);

    this.database
      .prepare(
        "INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, ?)",
      )
      .run("library_version", "0");
    this.database
      .prepare(
        "INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, ?)",
      )
      .run("seed_initialized", "0");

    // 启动时先清理超过 30 天的垃圾箱和恢复快照，避免过期数据重新进入列表。
    this.purgeExpiredTrash();

    this.transaction(() => {
      const migratedCount = backfillAssetsFromLegacyPrompts(this.database);

      if (migratedCount > 0) {
        this.bumpVersion();
      }
    });

    this.seedInitialPrompts();
  }

  private hasColumn(tableName: string, columnName: string) {
    const rows = this.database
      .prepare(`PRAGMA table_info(${tableName})`)
      .all() as Array<{ name: string }>;

    return rows.some((row) => row.name === columnName);
  }

  private ensurePromptLifecycleColumns() {
    if (!this.hasColumn("prompts", "deleted_at")) {
      this.database.exec("ALTER TABLE prompts ADD COLUMN deleted_at TEXT");
    }

    if (!this.hasColumn("prompts", "deleted_reason")) {
      this.database.exec("ALTER TABLE prompts ADD COLUMN deleted_reason TEXT");
    }

    if (!this.hasColumn("prompts", "merged_into_prompt_id")) {
      this.database.exec(
        "ALTER TABLE prompts ADD COLUMN merged_into_prompt_id TEXT",
      );
    }

    if (!this.hasColumn("prompts", "merge_version_id")) {
      this.database.exec(
        "ALTER TABLE prompts ADD COLUMN merge_version_id TEXT",
      );
    }
  }

  private seedInitialPrompts() {
    const seedState = this.database
      .prepare("SELECT value FROM app_meta WHERE key = ?")
      .get("seed_initialized") as MetaRow;

    if (seedState.value === "1") {
      return;
    }

    const countRow = this.database
      .prepare(
        "SELECT COUNT(*) AS count FROM assets WHERE asset_type = 'prompt'",
      )
      .get() as { count: number };

    this.transaction(() => {
      if (countRow.count === 0) {
        for (const prompt of promptCards) {
          this.writePromptAsset(prompt, {
            versionId: createInitialAssetVersionId(prompt.id),
            changeReason: "创建示例提示词",
            versionReason: "initial",
            createdAt: prompt.createdAt,
          });
        }
      }

      this.database
        .prepare("UPDATE app_meta SET value = ? WHERE key = ?")
        .run("1", "seed_initialized");
      this.bumpVersion();
    });
  }

  private transaction<T>(operation: () => T) {
    if (this.transactionDepth > 0) {
      return operation();
    }

    this.database.exec("BEGIN IMMEDIATE");
    this.transactionDepth += 1;

    try {
      const result = operation();
      this.transactionDepth -= 1;
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.transactionDepth -= 1;
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  // 统一资产是提示词的唯一写入源：内容写资产主行，每次写入留下一条不可变版本。
  private listPromptAssets() {
    return readAssets(this.database).filter(
      (asset): asset is PromptAssetData => asset.assetType === "prompt",
    );
  }

  private readPromptAsset(assetId: string) {
    const asset = readAssetById(this.database, assetId);

    return asset && asset.assetType === "prompt" ? asset : null;
  }

  private nextPromptVersionNumber(assetId: string) {
    return (
      readAssetVersions(this.database, assetId).reduce(
        (latest, version) => Math.max(latest, version.versionNumber),
        0,
      ) + 1
    );
  }

  private buildPromptAsset(
    prompt: PromptCardData,
    currentVersionId: string,
    existing: PromptAssetData | null,
  ): AssetData {
    const projectId =
      existing?.projectId ?? readDefaultProject(this.database).id;
    // 调用方可能只提供内容字段，这里统一补齐生命周期字段，
    // 避免把 undefined 写进资产主行或元数据。
    const base = promptToAsset(
      {
        ...prompt,
        tags: [...prompt.tags],
        deletedAt: prompt.deletedAt ?? null,
        deletedReason: prompt.deletedReason ?? null,
        mergedIntoPromptId: prompt.mergedIntoPromptId ?? null,
        mergeVersionId: prompt.mergeVersionId ?? null,
      },
      projectId,
    );

    return {
      ...base,
      source:
        existing?.source ?? {
          sourceType: "manual",
          sourceAssetId: null,
          importBatchId: null,
          originalFilename: null,
        },
      createdAt: existing?.createdAt ?? prompt.createdAt,
      currentVersionId,
    };
  }

  private writePromptAsset(
    prompt: PromptCardData,
    options: {
      versionId: string;
      changeReason: string;
      versionReason: AssetVersionReason;
      createdAt: string;
      sourceAssetIds?: string[];
      expiresAt?: string | null;
      restoredAt?: string | null;
    },
  ) {
    const existing = this.readPromptAsset(prompt.id);
    const asset = this.buildPromptAsset(prompt, options.versionId, existing);

    saveAssetRecord(this.database, asset);
    saveAssetVersionRecord(
      this.database,
      createAssetVersion(asset, {
        versionId: options.versionId,
        versionNumber: this.nextPromptVersionNumber(prompt.id),
        changeReason: options.changeReason,
        versionReason: options.versionReason,
        sourceAssetIds: options.sourceAssetIds,
        restoredAt: options.restoredAt ?? null,
        expiresAt: options.expiresAt ?? null,
        createdAt: options.createdAt,
      }),
    );

    return asset;
  }

  // 只改资产主行，不产生新版本：删除、恢复和合并来源标记属于生命周期变化。
  private writePromptRecord(prompt: PromptCardData) {
    const existing = this.readPromptAsset(prompt.id);

    if (!existing) {
      throw new Error("提示词不存在。");
    }

    const asset = this.buildPromptAsset(
      prompt,
      existing.currentVersionId,
      existing,
    );

    saveAssetRecord(this.database, asset);
    return asset;
  }

  // 快照只追加版本行，不改内容，也不移动当前版本指针。
  private writePromptSnapshot(
    prompt: PromptCardData,
    options: {
      versionId: string;
      versionReason: PromptVersionReason;
      createdAt: string;
      expiresAt: string;
      sourcePromptIds?: string[];
    },
  ) {
    const existing = this.readPromptAsset(prompt.id);
    const asset = this.buildPromptAsset(
      prompt,
      existing?.currentVersionId ?? createInitialAssetVersionId(prompt.id),
      existing,
    );

    saveAssetVersionRecord(
      this.database,
      createAssetVersion(asset, {
        versionId: options.versionId,
        versionNumber: this.nextPromptVersionNumber(prompt.id),
        changeReason: PROMPT_SNAPSHOT_REASON_LABELS[options.versionReason],
        versionReason: options.versionReason,
        sourceAssetIds: options.sourcePromptIds ?? [],
        restoredAt: null,
        expiresAt: options.expiresAt,
        createdAt: options.createdAt,
      }),
    );
  }

  private readPromptSnapshot(version: AssetVersionData): PromptVersionData {
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

  private listPromptSnapshots(
    promptId: string,
    reason: PromptVersionReason,
  ) {
    return readAssetVersions(this.database, promptId).filter(
      (version) =>
        version.versionReason === reason && version.restoredAt === null,
    );
  }

  private deletePromptAsset(assetId: string) {
    this.database
      .prepare("DELETE FROM asset_versions WHERE asset_id = ?")
      .run(assetId);
    this.database.prepare("DELETE FROM assets WHERE id = ?").run(assetId);
  }

  private bumpVersion() {
    this.database
      .prepare(
        `
          UPDATE app_meta
          SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)
          WHERE key = ?
        `,
      )
      .run("library_version");
  }

  getLibraryVersion() {
    const versionRow = this.database
      .prepare("SELECT value FROM app_meta WHERE key = ?")
      .get("library_version") as MetaRow;

    return Number(versionRow.value);
  }

  listPrompts() {
    return this.listPromptAssets()
      .filter((asset) => asset.deletedAt === null)
      .map((asset) => assetToPrompt(asset));
  }

  listTrash() {
    return this.listPromptAssets()
      .filter((asset) => asset.deletedAt !== null)
      .sort(
        (left, right) =>
          (right.deletedAt ?? "").localeCompare(left.deletedAt ?? "") ||
          left.id.localeCompare(right.id),
      )
      .map((asset) => assetToPrompt(asset));
  }

  getLibrarySnapshot(): PromptLibrarySnapshot {
    return {
      version: this.getLibraryVersion(),
      prompts: this.listPrompts(),
    };
  }

  createPrompt(prompt: PromptCardData) {
    if (this.readPromptAsset(prompt.id)) {
      return false;
    }

    this.transaction(() => {
      this.writePromptAsset(prompt, {
        versionId: createInitialAssetVersionId(prompt.id),
        changeReason: "创建提示词",
        versionReason: "initial",
        createdAt: prompt.createdAt,
      });
      this.bumpVersion();
    });

    return true;
  }

  updatePrompt(prompt: PromptCardData) {
    if (!this.readPromptAsset(prompt.id)) {
      return false;
    }

    this.transaction(() => {
      this.writePromptAsset(prompt, {
        versionId: createPromptVersionId(),
        changeReason: "保存提示词",
        versionReason: "save",
        createdAt: prompt.updatedAt,
      });
      this.bumpVersion();
    });

    return true;
  }

  deletePrompt(promptId: string) {
    const asset = this.readPromptAsset(promptId);

    if (!asset || asset.deletedAt !== null) {
      return false;
    }

    const prompt = assetToPrompt(asset);

    this.transaction(() => {
      this.writePromptRecord({
        ...prompt,
        deletedAt: new Date().toISOString(),
        deletedReason: "manual",
        mergedIntoPromptId: null,
        mergeVersionId: null,
      });
      this.bumpVersion();
    });

    return true;
  }

  restorePrompt(promptId: string) {
    const asset = this.readPromptAsset(promptId);

    if (!asset || asset.deletedAt === null) {
      return false;
    }

    const prompt = assetToPrompt(asset);

    this.transaction(() => {
      this.writePromptRecord({
        ...prompt,
        deletedAt: null,
        deletedReason: null,
        mergedIntoPromptId: null,
        mergeVersionId: null,
      });
      this.bumpVersion();
    });

    return true;
  }

  permanentlyDeletePrompt(promptId: string) {
    const asset = this.readPromptAsset(promptId);

    if (!asset || asset.deletedAt === null) {
      return false;
    }

    this.transaction(() => {
      this.deletePromptAsset(promptId);
      this.bumpVersion();
    });

    return true;
  }

  emptyTrash() {
    return this.transaction(() => {
      const trashedAssets = this.listPromptAssets().filter(
        (asset) => asset.deletedAt !== null,
      );

      for (const asset of trashedAssets) {
        this.deletePromptAsset(asset.id);
      }

      // 恢复记录属于垃圾箱范畴，清空时一并清掉；
      // 内容版本保留，避免存活提示词的当前版本指针指向不存在的记录。
      const snapshotResult = this.database
        .prepare(
          `
            DELETE FROM asset_versions
            WHERE asset_id IN (
              SELECT id FROM assets WHERE asset_type = 'prompt'
            )
              AND version_reason IN (
                'merge_before', 'optimize_before', 'restore_before'
              )
          `,
        )
        .run();

      if (
        trashedAssets.length + Number(snapshotResult.changes) >
        0
      ) {
        this.bumpVersion();
      }

      return trashedAssets.length;
    });
  }

  purgeExpiredTrash(now = new Date()) {
    const nowIso = now.toISOString();
    const promptCutoff = new Date(
      now.getTime() -
        PROMPT_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    return this.transaction(() => {
      const versionResult = this.database
        .prepare(
          "DELETE FROM asset_versions WHERE expires_at IS NOT NULL AND expires_at <= ?",
        )
        .run(nowIso);
      const expiredAssets = this.listPromptAssets().filter(
        (asset) => asset.deletedAt !== null && asset.deletedAt <= promptCutoff,
      );

      for (const asset of expiredAssets) {
        this.deletePromptAsset(asset.id);
      }

      const expiredCount =
        Number(versionResult.changes) + expiredAssets.length;

      if (expiredCount > 0) {
        this.bumpVersion();
      }

      return expiredCount;
    });
  }

  mergePrompts(importedPrompts: PromptCardData[]): PromptMergeResult {
    const importedPromptIds = importedPrompts.map((prompt) => prompt.id);

    if (new Set(importedPromptIds).size !== importedPromptIds.length) {
      throw new Error("待合并数据中存在重复的提示词标识。");
    }

    const trashedPromptIds = new Set(
      this.listTrash().map((prompt) => prompt.id),
    );
    const plan = createPromptImportPlan(
      this.listPrompts(),
      {
        type: PROMPT_BACKUP_TYPE,
        version: PROMPT_BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        prompts: importedPrompts,
      },
      trashedPromptIds,
    );

    if (plan.addCount + plan.updateCount > 0) {
      this.transaction(() => {
        for (const prompt of plan.mergedPrompts) {
          if (this.readPromptAsset(prompt.id)) {
            this.writePromptAsset(prompt, {
              versionId: createPromptVersionId(),
              changeReason: "备份导入更新",
              versionReason: "save",
              createdAt: prompt.updatedAt,
            });
          } else {
            this.writePromptAsset(prompt, {
              versionId: createInitialAssetVersionId(prompt.id),
              changeReason: "备份导入",
              versionReason: "initial",
              createdAt: prompt.createdAt,
            });
          }
        }

        this.bumpVersion();
      });
    }

    return {
      ...this.getLibrarySnapshot(),
      addCount: plan.addCount,
      updateCount: plan.updateCount,
      skipCount: plan.skipCount,
    };
  }

  commitPromptMerge(input: {
    prompt: PromptCardData;
    sourcePromptIds: string[];
    versionId: string;
  }) {
    const targetId = input.prompt.id;
    const sourceIds = input.sourcePromptIds;

    if (sourceIds.length < 2 || sourceIds.length > 5) {
      throw new Error("合并来源数量必须是 2 至 5 条。");
    }

    if (new Set(sourceIds).size !== sourceIds.length) {
      throw new Error("合并来源存在重复提示词。");
    }

    if (!sourceIds.includes(targetId)) {
      throw new Error("目标提示词必须包含在合并来源中。");
    }

    if (!input.versionId.trim()) {
      throw new Error("恢复快照标识无效。");
    }

    const now = new Date().toISOString();
    const expiresAt = new Date(
      Date.now() + PROMPT_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    return this.transaction(() => {
      const targetAsset = this.readPromptAsset(targetId);

      if (!targetAsset || targetAsset.deletedAt !== null) {
        throw new Error("目标提示词不存在或已删除。");
      }

      for (const promptId of sourceIds) {
        const source = this.readPromptAsset(promptId);

        if (!source || source.deletedAt !== null) {
          throw new Error("合并来源不存在或已删除。");
        }
      }

      const target = assetToPrompt(targetAsset);

      // 合并前快照保留原内容，之后可以通过恢复记录回到合并前。
      this.writePromptSnapshot(target, {
        versionId: input.versionId.trim(),
        versionReason: "merge_before",
        sourcePromptIds: [...sourceIds],
        expiresAt,
        createdAt: now,
      });

      // 合并结果写进目标资产，并留下一条内容版本。
      this.writePromptAsset(
        {
          ...target,
          title: input.prompt.title,
          category: input.prompt.category,
          tags: [...input.prompt.tags],
          content: input.prompt.content,
          useCase: input.prompt.useCase,
          updatedAt: now,
        },
        {
          versionId: createPromptVersionId(),
          changeReason: "合并结果",
          versionReason: "save",
          createdAt: now,
        },
      );

      for (const promptId of sourceIds) {
        if (promptId === targetId) {
          continue;
        }

        const sourceAsset = this.readPromptAsset(promptId);

        if (!sourceAsset) {
          throw new Error("合并来源归档失败。");
        }

        this.writePromptRecord({
          ...assetToPrompt(sourceAsset),
          deletedAt: now,
          deletedReason: "merge",
          mergedIntoPromptId: targetId,
          mergeVersionId: input.versionId.trim(),
        });
      }

      this.bumpVersion();
      return this.getLibrarySnapshot();
    });
  }

  // AI 优化的原子提交：先按锁定后的当前行写优化前快照，再更新提示词。
  commitPromptOptimize(input: { prompt: PromptCardData; versionId: string }) {
    const promptId = input.prompt.id;

    if (!promptId.trim()) {
      throw new Error("提示词标识无效。");
    }

    if (!input.versionId.trim()) {
      throw new Error("恢复快照标识无效。");
    }

    const now = new Date().toISOString();
    const expiresAt = new Date(
      Date.now() + PROMPT_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    return this.transaction(() => {
      const targetAsset = this.readPromptAsset(promptId);

      if (!targetAsset || targetAsset.deletedAt !== null) {
        throw new Error("提示词不存在或已删除。");
      }

      const target = assetToPrompt(targetAsset);

      // 优化前快照保留原内容，供界面判断能否「回到优化前」。
      this.writePromptSnapshot(target, {
        versionId: input.versionId.trim(),
        versionReason: "optimize_before",
        expiresAt,
        createdAt: now,
      });

      // 优化结果写进资产，并留下一条内容版本。
      this.writePromptAsset(
        {
          ...target,
          title: input.prompt.title,
          category: input.prompt.category,
          tags: [...input.prompt.tags],
          content: input.prompt.content,
          useCase: input.prompt.useCase,
          updatedAt: now,
        },
        {
          versionId: createPromptVersionId(),
          changeReason: "优化结果",
          versionReason: "save",
          createdAt: now,
        },
      );

      this.bumpVersion();
      return this.getLibrarySnapshot();
    });
  }

  // 读取这条提示词最近一次未被消费的优化前快照，供界面判断能否回退。
  fetchLatestOptimizeVersion(promptId: string) {
    const now = new Date().toISOString();
    const snapshot = this.listPromptSnapshots(promptId, "optimize_before")
      .filter((version) => (version.expiresAt ?? "") > now)
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) ||
          left.versionId.localeCompare(right.versionId),
      )[0];

    return snapshot ? this.readPromptSnapshot(snapshot) : null;
  }

  // 回到优化前：回退本身也会覆盖内容，所以先把当前内容存成 restore_before 快照。
  // 快照编号在这里生成，不接受调用方传入：复用被消费的那条编号会撞主键，让回退整笔失败。
  restorePromptOptimize(promptId: string) {
    const versionId = createPromptVersionId();

    const now = new Date().toISOString();
    const expiresAt = new Date(
      Date.now() + PROMPT_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    return this.transaction(() => {
      const targetAsset = this.readPromptAsset(promptId);

      if (!targetAsset || targetAsset.deletedAt !== null) {
        throw new Error("提示词不存在或已删除。");
      }

      const snapshot = this.listPromptSnapshots(promptId, "optimize_before")
        .filter((version) => (version.expiresAt ?? "") > now)
        .sort(
          (left, right) =>
            right.createdAt.localeCompare(left.createdAt) ||
            left.versionId.localeCompare(right.versionId),
        )[0];

      if (!snapshot) {
        return null;
      }

      const target = assetToPrompt(targetAsset);
      const version = this.readPromptSnapshot(snapshot);

      // 回退前快照保留当前内容，回退本身也可以再退回来。
      this.writePromptSnapshot(target, {
        versionId,
        versionReason: "restore_before",
        expiresAt,
        createdAt: now,
      });

      // 恢复内容并留下一条内容版本。
      this.writePromptAsset(
        {
          ...target,
          title: version.title,
          category: version.category,
          tags: [...version.tags],
          content: version.content,
          useCase: version.useCase,
          updatedAt: now,
        },
        {
          versionId: createPromptVersionId(),
          changeReason: "回到优化前",
          versionReason: "restore",
          createdAt: now,
        },
      );

      const versionUpdate = this.database
        .prepare(
          "UPDATE asset_versions SET restored_at = ? WHERE version_id = ? AND restored_at IS NULL AND expires_at > ?",
        )
        .run(now, version.versionId, now);

      if (Number(versionUpdate.changes) !== 1) {
        throw new Error("恢复记录更新失败。");
      }

      this.bumpVersion();
      return this.getLibrarySnapshot();
    });
  }

  listMergeRecoveryRecords() {
    return readAssetVersions(this.database)
      .filter(
        (version) =>
          version.assetType === "prompt" &&
          version.versionReason === "merge_before" &&
          version.restoredAt === null,
      )
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) ||
          left.versionId.localeCompare(right.versionId),
      )
      .map((version) => this.readPromptSnapshot(version));
  }

  restoreMergeRecord(versionId: string) {
    const now = new Date().toISOString();

    return this.transaction(() => {
      const snapshot = readAssetVersions(this.database).find(
        (version) =>
          version.versionId === versionId &&
          version.versionReason === "merge_before" &&
          version.restoredAt === null &&
          (version.expiresAt ?? "") > now,
      );

      if (!snapshot) {
        return null;
      }

      const version = this.readPromptSnapshot(snapshot);
      const targetAsset = this.readPromptAsset(version.promptId);

      if (!targetAsset || targetAsset.deletedAt !== null) {
        return null;
      }

      const restorableSourceIds = new Set<string>();

      for (const promptId of version.sourcePromptIds) {
        if (promptId === version.promptId) {
          continue;
        }

        const sourceAsset = this.readPromptAsset(promptId);
        const source = sourceAsset ? assetToPrompt(sourceAsset) : undefined;

        if (
          source &&
          source.deletedAt !== null &&
          source.deletedReason === "merge" &&
          source.mergedIntoPromptId === version.promptId &&
          source.mergeVersionId === version.versionId
        ) {
          restorableSourceIds.add(promptId);
        }
      }

      // 目标提示词恢复成合并前的内容，并留下一条内容版本。
      this.writePromptAsset(
        {
          ...assetToPrompt(targetAsset),
          title: version.title,
          category: version.category,
          tags: [...version.tags],
          content: version.content,
          useCase: version.useCase,
          updatedAt: now,
        },
        {
          versionId: createPromptVersionId(),
          changeReason: "恢复合并前内容",
          versionReason: "restore",
          createdAt: now,
        },
      );

      for (const promptId of restorableSourceIds) {
        const sourceAsset = this.readPromptAsset(promptId);

        if (!sourceAsset) {
          throw new Error("合并来源恢复失败。");
        }

        this.writePromptRecord({
          ...assetToPrompt(sourceAsset),
          deletedAt: null,
          deletedReason: null,
          mergedIntoPromptId: null,
          mergeVersionId: null,
        });
      }

      const versionUpdate = this.database
        .prepare(
          "UPDATE asset_versions SET restored_at = ? WHERE version_id = ? AND restored_at IS NULL AND expires_at > ?",
        )
        .run(now, versionId, now);

      if (Number(versionUpdate.changes) !== 1) {
        throw new Error("恢复记录更新失败。");
      }

      this.bumpVersion();
      return this.getLibrarySnapshot();
    });
  }

  permanentlyDeleteMergeRecord(versionId: string) {
    return this.transaction(() => {
      const deleteResult = this.database
        .prepare(
          "DELETE FROM asset_versions WHERE version_id = ? AND version_reason = 'merge_before'",
        )
        .run(versionId);

      if (Number(deleteResult.changes) > 0) {
        this.bumpVersion();
      }

      return Number(deleteResult.changes) > 0;
    });
  }

  createProject(project: ProjectData) {
    const exists = this.listProjects().some(
      (item) => item.id === project.id,
    );

    if (exists) {
      return false;
    }

    this.transaction(() => {
      saveProjectRecord(this.database, project);
      this.bumpVersion();
    });

    return true;
  }

  // 文档包导入确认：项目、来源包、资产和它们的第 1 版一次性写完。
  // 中途失败会整体回滚，不会留下「项目建了一半、资产没进来」的状态。
  createSourcePackageImport(plan: SourcePackageCreationPlan) {
    const created = { project: false, sourcePackages: 0, assets: 0 };

    this.transaction(() => {
      if (plan.project) {
        if (!this.createProject(plan.project)) {
          throw new Error("这个项目已经存在。");
        }

        created.project = true;
      }

      for (const asset of plan.sourcePackages) {
        if (
          !this.createAsset({
            asset,
            versionId: asset.currentVersionId,
            changeReason: "导入文档包",
            versionReason: "initial",
          })
        ) {
          throw new Error(`来源包「${asset.title}」已经存在。`);
        }

        created.sourcePackages += 1;
      }

      for (const entry of plan.assets) {
        if (
          !this.createAsset({
            asset: entry.asset,
            versionId: entry.version.versionId,
            changeReason: entry.version.changeReason,
            versionReason: "initial",
            sourceAssetIds: entry.version.sourceAssetIds,
          })
        ) {
          throw new Error(`资产「${entry.asset.title}」已经存在。`);
        }

        created.assets += 1;
      }
    });

    return created;
  }

  updateProject(project: ProjectData) {
    const exists = this.listProjects().some(
      (item) => item.id === project.id,
    );

    if (!exists) {
      return false;
    }

    this.transaction(() => {
      saveProjectRecord(this.database, project);
      this.bumpVersion();
    });

    return true;
  }

  createAsset(input: AssetSaveInput) {
    if (input.asset.currentVersionId !== input.versionId) {
      throw new Error("资产当前版本与保存版本不一致。");
    }

    if (readAssetById(this.database, input.asset.id)) {
      return false;
    }

    this.transaction(() => {
      const version = createAssetVersion(input.asset, {
        versionId: input.versionId,
        versionNumber: 1,
        changeReason: input.changeReason,
        versionReason: input.versionReason ?? "initial",
        sourceAssetIds: input.sourceAssetIds,
        restoredAt: input.restoredAt,
        expiresAt: input.expiresAt,
        createdAt: input.asset.createdAt,
      });

      saveAssetRecord(this.database, input.asset);
      saveAssetVersionRecord(this.database, version);
      this.bumpVersion();
    });

    return true;
  }

  updateAsset(input: AssetSaveInput) {
    if (input.asset.currentVersionId !== input.versionId) {
      throw new Error("资产当前版本与保存版本不一致。");
    }

    if (!readAssetById(this.database, input.asset.id)) {
      return false;
    }

    this.transaction(() => {
      const versions = readAssetVersions(this.database, input.asset.id);
      const versionNumber =
        Math.max(0, ...versions.map((version) => version.versionNumber)) + 1;
      const version = createAssetVersion(input.asset, {
        versionId: input.versionId,
        versionNumber,
        changeReason: input.changeReason,
        versionReason: input.versionReason ?? "save",
        sourceAssetIds: input.sourceAssetIds,
        restoredAt: input.restoredAt,
        expiresAt: input.expiresAt,
        createdAt: input.asset.updatedAt,
      });

      saveAssetRecord(this.database, input.asset);
      saveAssetVersionRecord(this.database, version);
      this.bumpVersion();
    });

    return true;
  }

  getAsset(assetId: string) {
    return readAssetById(this.database, assetId);
  }

  listProjects() {
    return readProjects(this.database);
  }

  getDefaultProject() {
    return readDefaultProject(this.database);
  }

  listAssets(projectId?: string) {
    return readAssets(this.database, projectId);
  }

  listAssetVersions(assetId?: string) {
    return readAssetVersions(this.database, assetId);
  }

  close() {
    this.database.close();
  }
}

const globalDatabase = globalThis as typeof globalThis & {
  promptDatabase?: PromptDatabase;
};

export function getPromptDatabase() {
  if (!globalDatabase.promptDatabase) {
    globalDatabase.promptDatabase = new PromptDatabase();
  }

  return globalDatabase.promptDatabase;
}

// 本机数据目录：数据库文件和来源包原文都放在这里，保证两者同生共死
export function resolveDataRootDir() {
  return dirname(createDefaultDatabasePath());
}
