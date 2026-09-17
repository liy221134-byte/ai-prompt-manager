import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { promptCards, type PromptCardData } from "../../data/prompts.ts";
import {
  createPromptImportPlan,
  PROMPT_BACKUP_TYPE,
  PROMPT_BACKUP_VERSION,
} from "../prompt-backup.ts";

type PromptRow = {
  id: string;
  title: string;
  category: string;
  tags_json: string;
  content: string;
  use_case: string;
  created_at: string;
  updated_at: string;
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

    this.seedInitialPrompts();
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
            updated_at
          FROM prompts
          ORDER BY updated_at DESC, id ASC
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
    const result = this.transaction(() => {
      const deleteResult = this.database
        .prepare("DELETE FROM prompts WHERE id = ?")
        .run(promptId);

      if (deleteResult.changes > 0) {
        this.bumpVersion();
      }

      return deleteResult;
    });

    return result.changes > 0;
  }

  mergePrompts(importedPrompts: PromptCardData[]): PromptMergeResult {
    const currentPrompts = this.listPrompts();
    const plan = createPromptImportPlan(currentPrompts, {
      type: PROMPT_BACKUP_TYPE,
      version: PROMPT_BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      prompts: importedPrompts,
    });

    if (plan.addCount + plan.updateCount > 0) {
      this.transaction(() => {
        this.database.prepare("DELETE FROM prompts").run();

        for (const prompt of plan.mergedPrompts) {
          this.insertPrompt(prompt);
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
