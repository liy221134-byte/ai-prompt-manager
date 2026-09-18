import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { RuleDatabase } from "../src/lib/server/rule-database.ts";

function createContext() {
  const directory = mkdtempSync(join(tmpdir(), "rule-database-"));
  const databasePath = join(directory, "rules.sqlite");

  return {
    database: new RuleDatabase(databasePath),
    cleanup() {
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test("规则资产可以保存、读取和删除", () => {
  const context = createContext();

  try {
    const asset = {
      id: "asset-1",
      title: "开发规范",
      sourceType: "markdown",
      content: "必须运行测试",
      category: "工程规范",
      rules: [
        {
          id: "rule-1",
          type: "must",
          priority: "P0",
          statement: "必须运行测试",
          rationale: "保证质量",
          sourceExcerpt: "必须运行测试",
          status: "approved",
        },
      ],
      createdAt: "2026-09-18T00:00:00.000Z",
      updatedAt: "2026-09-18T00:00:00.000Z",
    };

    context.database.saveRuleAsset(asset);

    const assets = context.database.listRuleAssets();

    assert.equal(assets.length, 1);
    assert.equal(assets[0].rules.length, 1);
    assert.equal(assets[0].rules[0].status, "approved");
    assert.equal(context.database.deleteRuleAsset("asset-1"), true);
    assert.equal(context.database.listRuleAssets().length, 0);
  } finally {
    context.database.close();
    context.cleanup();
  }
});
