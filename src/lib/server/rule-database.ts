import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  ExtractedRule,
  RuleAssetData,
  RulePriority,
  RuleSourceType,
  RuleStatus,
  RuleType,
} from "../../data/rule-assets.ts";

const localUserId = "local-user";

type AssetRow = {
  id: string;
  title: string;
  source_type: RuleSourceType;
  content: string;
  category: string;
  created_at: string;
  updated_at: string;
};

type RuleRow = {
  id: string;
  asset_id: string;
  type: RuleType;
  priority: RulePriority;
  statement: string;
  rationale: string;
  source_excerpt: string;
  status: RuleStatus;
};

function createDatabasePath() {
  return (
    process.env.PROMPT_DB_PATH ??
    join(process.cwd(), ".data", "prompts.sqlite")
  );
}

function rowToRule(row: RuleRow): ExtractedRule {
  return {
    id: row.id,
    type: row.type,
    priority: row.priority,
    statement: row.statement,
    rationale: row.rationale,
    sourceExcerpt: row.source_excerpt,
    status: row.status,
  };
}

export class RuleDatabase {
  private database: DatabaseSync;

  constructor(databasePath = createDatabasePath()) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.initialize();
  }

  private initialize() {
    this.database.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS rule_assets (
        user_id TEXT NOT NULL,
        id TEXT NOT NULL,
        title TEXT NOT NULL,
        source_type TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, id)
      );

      CREATE TABLE IF NOT EXISTS rules (
        user_id TEXT NOT NULL,
        id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        type TEXT NOT NULL,
        priority TEXT NOT NULL,
        statement TEXT NOT NULL,
        rationale TEXT NOT NULL,
        source_excerpt TEXT NOT NULL,
        status TEXT NOT NULL,
        PRIMARY KEY (user_id, id),
        FOREIGN KEY (user_id, asset_id)
          REFERENCES rule_assets(user_id, id)
          ON DELETE CASCADE
      );
    `);
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

  listRuleAssets() {
    const assetRows = this.database
      .prepare(
        `
          SELECT id, title, source_type, content, category, created_at, updated_at
          FROM rule_assets
          WHERE user_id = ?
          ORDER BY updated_at DESC
        `,
      )
      .all(localUserId) as AssetRow[];
    const ruleRows = this.database
      .prepare(
        `
          SELECT id, asset_id, type, priority, statement, rationale, source_excerpt, status
          FROM rules
          WHERE user_id = ?
          ORDER BY rowid ASC
        `,
      )
      .all(localUserId) as RuleRow[];

    return assetRows.map<RuleAssetData>((asset) => ({
      id: asset.id,
      title: asset.title,
      sourceType: asset.source_type,
      content: asset.content,
      category: asset.category,
      createdAt: asset.created_at,
      updatedAt: asset.updated_at,
      rules: ruleRows
        .filter((rule) => rule.asset_id === asset.id)
        .map(rowToRule),
    }));
  }

  saveRuleAsset(asset: RuleAssetData) {
    return this.transaction(() => {
      this.database
        .prepare(
          `
            INSERT INTO rule_assets (
              user_id, id, title, source_type, content, category, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, id) DO UPDATE SET
              title = excluded.title,
              source_type = excluded.source_type,
              content = excluded.content,
              category = excluded.category,
              updated_at = excluded.updated_at
          `,
        )
        .run(
          localUserId,
          asset.id,
          asset.title,
          asset.sourceType,
          asset.content,
          asset.category,
          asset.createdAt,
          asset.updatedAt,
        );

      this.database
        .prepare("DELETE FROM rules WHERE user_id = ? AND asset_id = ?")
        .run(localUserId, asset.id);

      const insertRule = this.database.prepare(
        `
          INSERT INTO rules (
            user_id, id, asset_id, type, priority, statement, rationale, source_excerpt, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      );

      for (const rule of asset.rules) {
        insertRule.run(
          localUserId,
          rule.id,
          asset.id,
          rule.type,
          rule.priority,
          rule.statement,
          rule.rationale,
          rule.sourceExcerpt,
          rule.status,
        );
      }
    });
  }

  deleteRuleAsset(assetId: string) {
    const result = this.transaction(() =>
      this.database
        .prepare("DELETE FROM rule_assets WHERE user_id = ? AND id = ?")
        .run(localUserId, assetId),
    );

    return result.changes > 0;
  }

  close() {
    this.database.close();
  }
}

const globalRuleDatabase = globalThis as typeof globalThis & {
  ruleDatabase?: RuleDatabase;
};

export function getRuleDatabase() {
  if (!globalRuleDatabase.ruleDatabase) {
    globalRuleDatabase.ruleDatabase = new RuleDatabase();
  }

  return globalRuleDatabase.ruleDatabase;
}
