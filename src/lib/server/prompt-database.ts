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
  createPromptImportPlan,
  PROMPT_BACKUP_TYPE,
  PROMPT_BACKUP_VERSION,
} from "../prompt-backup.ts";
import { PROMPT_TRASH_RETENTION_DAYS } from "../prompt-lifecycle.ts";

type PromptRow = {
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

type PromptVersionRow = {
  version_id: string;
  prompt_id: string;
  title: string;
  category: string;
  tags_json: string;
  content: string;
  use_case: string;
  created_at: string;
  version_reason: PromptVersionReason;
  source_prompt_ids_json: string;
  restored_at: string | null;
  expires_at: string;
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

function createDefaultDatabasePath() {
  return (
    process.env.PROMPT_DB_PATH ??
    join(process.cwd(), ".data", "prompts.sqlite")
  );
}

function rowToPrompt(row: PromptRow): PromptCardData {
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

function rowToVersion(row: PromptVersionRow): PromptVersionData {
  return {
    versionId: row.version_id,
    promptId: row.prompt_id,
    title: row.title,
    category: row.category,
    tags: JSON.parse(row.tags_json) as string[],
    content: row.content,
    useCase: row.use_case,
    createdAt: row.created_at,
    versionReason: row.version_reason,
    sourcePromptIds: JSON.parse(row.source_prompt_ids_json) as string[],
    restoredAt: row.restored_at,
    expiresAt: row.expires_at,
  };
}

export class PromptDatabase {
  private database: DatabaseSync;

  constructor(databasePath = createDefaultDatabasePath()) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.initialize();
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
      .prepare("SELECT COUNT(*) AS count FROM prompts")
      .get() as { count: number };

    this.transaction(() => {
      if (countRow.count === 0) {
        for (const prompt of promptCards) {
          this.insertPrompt(prompt);
        }
      }

      this.database
        .prepare("UPDATE app_meta SET value = ? WHERE key = ?")
        .run("1", "seed_initialized");
      this.bumpVersion();
    });
  }

  private transaction<T>(operation: () => T) {
    this.database.exec("BEGIN IMMEDIATE");

    try {
      const result = operation();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  private insertPrompt(prompt: PromptCardData) {
    this.database
      .prepare(
        `
          INSERT INTO prompts (
            id,
            title,
            category,
            tags_json,
            content,
            use_case,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        prompt.id,
        prompt.title,
        prompt.category,
        JSON.stringify(prompt.tags),
        prompt.content,
        prompt.useCase,
        prompt.createdAt,
        prompt.updatedAt,
      );
  }

  private insertPromptVersion(version: PromptVersionData) {
    return this.database
      .prepare(
        `
          INSERT INTO prompt_versions (
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
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        version.versionId,
        version.promptId,
        version.title,
        version.category,
        JSON.stringify(version.tags),
        version.content,
        version.useCase,
        version.createdAt,
        version.versionReason,
        JSON.stringify(version.sourcePromptIds),
        version.restoredAt,
        version.expiresAt,
      );
  }

  private updatePromptRow(prompt: PromptCardData) {
    return this.database
      .prepare(
        `
          UPDATE prompts
          SET
            title = ?,
            category = ?,
            tags_json = ?,
            content = ?,
            use_case = ?,
            created_at = ?,
            updated_at = ?
          WHERE id = ?
        `,
      )
      .run(
        prompt.title,
        prompt.category,
        JSON.stringify(prompt.tags),
        prompt.content,
        prompt.useCase,
        prompt.createdAt,
        prompt.updatedAt,
        prompt.id,
      );
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
    const rows = this.database
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
          WHERE deleted_at IS NULL
          ORDER BY updated_at DESC, id ASC
        `,
      )
      .all() as PromptRow[];

    return rows.map(rowToPrompt);
  }

  listTrash() {
    const rows = this.database
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
          WHERE deleted_at IS NOT NULL
          ORDER BY deleted_at DESC, id ASC
        `,
      )
      .all() as PromptRow[];

    return rows.map(rowToPrompt);
  }

  getLibrarySnapshot(): PromptLibrarySnapshot {
    return {
      version: this.getLibraryVersion(),
      prompts: this.listPrompts(),
    };
  }

  createPrompt(prompt: PromptCardData) {
    const existingPrompt = this.database
      .prepare("SELECT id FROM prompts WHERE id = ?")
      .get(prompt.id);

    if (existingPrompt) {
      return false;
    }

    this.transaction(() => {
      this.insertPrompt(prompt);
      this.bumpVersion();
    });

    return true;
  }

  updatePrompt(prompt: PromptCardData) {
    const result = this.transaction(() => {
      const updateResult = this.updatePromptRow(prompt);

      if (updateResult.changes > 0) {
        this.bumpVersion();
      }

      return updateResult;
    });

    return result.changes > 0;
  }

  deletePrompt(promptId: string) {
    const deletedAt = new Date().toISOString();
    const result = this.transaction(() => {
      const updateResult = this.database
        .prepare(
          `
            UPDATE prompts
            SET
              deleted_at = ?,
              deleted_reason = ?,
              merged_into_prompt_id = NULL,
              merge_version_id = NULL
            WHERE id = ? AND deleted_at IS NULL
          `,
        )
        .run(deletedAt, "manual", promptId);

      if (updateResult.changes > 0) {
        this.bumpVersion();
      }

      return updateResult;
    });

    return result.changes > 0;
  }

  restorePrompt(promptId: string) {
    const result = this.transaction(() => {
      const updateResult = this.database
        .prepare(
          `
            UPDATE prompts
            SET
              deleted_at = NULL,
              deleted_reason = NULL,
              merged_into_prompt_id = NULL,
              merge_version_id = NULL
            WHERE id = ? AND deleted_at IS NOT NULL
          `,
        )
        .run(promptId);

      if (updateResult.changes > 0) {
        this.bumpVersion();
      }

      return updateResult;
    });

    return result.changes > 0;
  }

  permanentlyDeletePrompt(promptId: string) {
    const result = this.transaction(() => {
      const deleteResult = this.database
        .prepare("DELETE FROM prompts WHERE id = ? AND deleted_at IS NOT NULL")
        .run(promptId);

      if (deleteResult.changes > 0) {
        this.bumpVersion();
      }

      return deleteResult;
    });

    return result.changes > 0;
  }

  emptyTrash() {
    return this.transaction(() => {
      const deleteResult = this.database
        .prepare("DELETE FROM prompts WHERE deleted_at IS NOT NULL")
        .run();
      const versionResult = this.database
        .prepare("DELETE FROM prompt_versions")
        .run();

      if (Number(deleteResult.changes) + Number(versionResult.changes) > 0) {
        this.bumpVersion();
      }

      return Number(deleteResult.changes);
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
        .prepare("DELETE FROM prompt_versions WHERE expires_at <= ?")
        .run(nowIso);
      const promptResult = this.database
        .prepare(
          "DELETE FROM prompts WHERE deleted_at IS NOT NULL AND deleted_at <= ?",
        )
        .run(promptCutoff);

      if (Number(versionResult.changes) + Number(promptResult.changes) > 0) {
        this.bumpVersion();
      }

      return Number(versionResult.changes) + Number(promptResult.changes);
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
          const existing = this.database
            .prepare("SELECT id FROM prompts WHERE id = ?")
            .get(prompt.id);

          if (existing) {
            this.updatePromptRow(prompt);
          } else {
            this.insertPrompt(prompt);
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
      const targetRow = this.database
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
            WHERE id = ? AND deleted_at IS NULL
          `,
        )
        .get(targetId) as PromptRow | undefined;

      if (!targetRow) {
        throw new Error("目标提示词不存在或已删除。");
      }

      for (const promptId of sourceIds) {
        const source = this.database
          .prepare(
            "SELECT id FROM prompts WHERE id = ? AND deleted_at IS NULL",
          )
          .get(promptId);

        if (!source) {
          throw new Error("合并来源不存在或已删除。");
        }
      }

      const target = rowToPrompt(targetRow);
      const version: PromptVersionData = {
        versionId: input.versionId.trim(),
        promptId: target.id,
        title: target.title,
        category: target.category,
        tags: [...target.tags],
        content: target.content,
        useCase: target.useCase,
        createdAt: now,
        versionReason: "merge_before",
        sourcePromptIds: [...sourceIds],
        expiresAt,
        restoredAt: null,
      };
      const versionResult = this.insertPromptVersion(version);

      if (Number(versionResult.changes) !== 1) {
        throw new Error("恢复快照写入失败。");
      }

      const targetUpdate = this.database
        .prepare(
          `
            UPDATE prompts
            SET title = ?, category = ?, tags_json = ?, content = ?, use_case = ?, updated_at = ?
            WHERE id = ? AND deleted_at IS NULL
          `,
        )
        .run(
          input.prompt.title,
          input.prompt.category,
          JSON.stringify(input.prompt.tags),
          input.prompt.content,
          input.prompt.useCase,
          now,
          targetId,
        );

      if (Number(targetUpdate.changes) !== 1) {
        throw new Error("目标提示词更新失败。");
      }

      for (const promptId of sourceIds) {
        if (promptId === targetId) {
          continue;
        }

        const sourceUpdate = this.database
          .prepare(
            `
              UPDATE prompts
              SET
                deleted_at = ?,
                deleted_reason = ?,
                merged_into_prompt_id = ?,
                merge_version_id = ?
              WHERE id = ? AND deleted_at IS NULL
            `,
          );
        const result = sourceUpdate.run(
          now,
          "merge",
          targetId,
          input.versionId.trim(),
          promptId,
        );

        if (Number(result.changes) !== 1) {
          throw new Error("合并来源归档失败。");
        }
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
      const targetRow = this.database
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
            WHERE id = ? AND deleted_at IS NULL
          `,
        )
        .get(promptId) as PromptRow | undefined;

      if (!targetRow) {
        throw new Error("提示词不存在或已删除。");
      }

      const target = rowToPrompt(targetRow);
      const version: PromptVersionData = {
        versionId: input.versionId.trim(),
        promptId: target.id,
        title: target.title,
        category: target.category,
        tags: [...target.tags],
        content: target.content,
        useCase: target.useCase,
        createdAt: now,
        versionReason: "optimize_before",
        sourcePromptIds: [],
        expiresAt,
        restoredAt: null,
      };
      const versionResult = this.insertPromptVersion(version);

      if (Number(versionResult.changes) !== 1) {
        throw new Error("恢复快照写入失败。");
      }

      const targetUpdate = this.database
        .prepare(
          `
            UPDATE prompts
            SET title = ?, category = ?, tags_json = ?, content = ?, use_case = ?, updated_at = ?
            WHERE id = ? AND deleted_at IS NULL
          `,
        )
        .run(
          input.prompt.title,
          input.prompt.category,
          JSON.stringify(input.prompt.tags),
          input.prompt.content,
          input.prompt.useCase,
          now,
          promptId,
        );

      if (Number(targetUpdate.changes) !== 1) {
        throw new Error("提示词更新失败。");
      }

      this.bumpVersion();
      return this.getLibrarySnapshot();
    });
  }

  // 读取这条提示词最近一次未被消费的优化前快照，供界面判断能否回退。
  fetchLatestOptimizeVersion(promptId: string) {
    const row = this.database
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
            AND version_reason = 'optimize_before'
            AND restored_at IS NULL
            AND expires_at > ?
          ORDER BY created_at DESC, version_id ASC
          LIMIT 1
        `,
      )
      .get(promptId, new Date().toISOString()) as PromptVersionRow | undefined;

    return row ? rowToVersion(row) : null;
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
      const targetRow = this.database
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
            WHERE id = ? AND deleted_at IS NULL
          `,
        )
        .get(promptId) as PromptRow | undefined;

      if (!targetRow) {
        throw new Error("提示词不存在或已删除。");
      }

      const versionRow = this.database
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
              AND version_reason = 'optimize_before'
              AND restored_at IS NULL
              AND expires_at > ?
            ORDER BY created_at DESC, version_id ASC
            LIMIT 1
          `,
        )
        .get(promptId, now) as PromptVersionRow | undefined;

      if (!versionRow) {
        return null;
      }

      const target = rowToPrompt(targetRow);
      const version = rowToVersion(versionRow);
      const restoreVersion: PromptVersionData = {
        versionId,
        promptId: target.id,
        title: target.title,
        category: target.category,
        tags: [...target.tags],
        content: target.content,
        useCase: target.useCase,
        createdAt: now,
        versionReason: "restore_before",
        sourcePromptIds: [],
        expiresAt,
        restoredAt: null,
      };
      const insertResult = this.insertPromptVersion(restoreVersion);

      if (Number(insertResult.changes) !== 1) {
        throw new Error("回退快照写入失败。");
      }

      const updateResult = this.database
        .prepare(
          `
            UPDATE prompts
            SET title = ?, category = ?, tags_json = ?, content = ?, use_case = ?, updated_at = ?
            WHERE id = ? AND deleted_at IS NULL
          `,
        )
        .run(
          version.title,
          version.category,
          JSON.stringify(version.tags),
          version.content,
          version.useCase,
          now,
          promptId,
        );

      if (Number(updateResult.changes) !== 1) {
        throw new Error("提示词恢复失败。");
      }

      this.database
        .prepare(
          "UPDATE prompt_versions SET restored_at = ? WHERE version_id = ? AND restored_at IS NULL",
        )
        .run(now, version.versionId);

      this.bumpVersion();
      return this.getLibrarySnapshot();
    });
  }

  listMergeRecoveryRecords() {
    const rows = this.database
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
          WHERE restored_at IS NULL AND version_reason = 'merge_before'
          ORDER BY created_at DESC, version_id ASC
        `,
      )
      .all() as PromptVersionRow[];

    return rows.map(rowToVersion);
  }

  restoreMergeRecord(versionId: string) {
    const now = new Date().toISOString();

    return this.transaction(() => {
      const row = this.database
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
            WHERE version_id = ?
              AND restored_at IS NULL
              AND expires_at > ?
              AND version_reason = 'merge_before'
          `,
        )
        .get(versionId, now) as PromptVersionRow | undefined;

      if (!row) {
        return null;
      }

      const version = rowToVersion(row);
      const target = this.database
        .prepare("SELECT id FROM prompts WHERE id = ? AND deleted_at IS NULL")
        .get(version.promptId);

      if (!target) {
        return null;
      }

      const restorableSourceIds = new Set<string>();

      for (const promptId of version.sourcePromptIds) {
        if (promptId === version.promptId) {
          continue;
        }

        const source = this.database
          .prepare(
            `
              SELECT
                deleted_at,
                deleted_reason,
                merged_into_prompt_id,
                merge_version_id
              FROM prompts
              WHERE id = ?
            `,
          )
          .get(promptId) as
            | {
                deleted_at: string | null;
                deleted_reason: "manual" | "merge" | null;
                merged_into_prompt_id: string | null;
                merge_version_id: string | null;
              }
            | undefined;

        if (
          source &&
          source.deleted_at !== null &&
          source.deleted_reason === "merge" &&
          source.merged_into_prompt_id === version.promptId &&
          source.merge_version_id === version.versionId
        ) {
          restorableSourceIds.add(promptId);
        }
      }

      const targetUpdate = this.database
        .prepare(
          `
            UPDATE prompts
            SET title = ?, category = ?, tags_json = ?, content = ?, use_case = ?, updated_at = ?
            WHERE id = ? AND deleted_at IS NULL
          `,
        )
        .run(
          version.title,
          version.category,
          JSON.stringify(version.tags),
          version.content,
          version.useCase,
          now,
          version.promptId,
        );

      if (Number(targetUpdate.changes) !== 1) {
        throw new Error("目标提示词恢复失败。");
      }

      for (const promptId of restorableSourceIds) {
        const sourceUpdate = this.database
          .prepare(
            `
              UPDATE prompts
              SET
                deleted_at = NULL,
                deleted_reason = NULL,
                merged_into_prompt_id = NULL,
                merge_version_id = NULL
              WHERE id = ? AND deleted_at IS NOT NULL
                AND deleted_reason = 'merge'
                AND merged_into_prompt_id = ?
                AND merge_version_id = ?
            `,
          )
          .run(promptId, version.promptId, version.versionId);

        if (Number(sourceUpdate.changes) !== 1) {
          throw new Error("合并来源恢复失败。");
        }
      }

      const versionUpdate = this.database
        .prepare(
          `
            UPDATE prompt_versions
            SET restored_at = ?
            WHERE version_id = ?
              AND restored_at IS NULL
              AND expires_at > ?
          `,
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
          "DELETE FROM prompt_versions WHERE version_id = ? AND version_reason = 'merge_before'",
        )
        .run(versionId);

      if (Number(deleteResult.changes) > 0) {
        this.bumpVersion();
      }

      return Number(deleteResult.changes) > 0;
    });
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
