import assert from "node:assert/strict";
import test from "node:test";

import {
  exportRulesToMarkdown,
  normalizeRuleExtraction,
} from "../src/lib/rule-ai.ts";

test("可以解析标准规则提取结果", () => {
  const result = normalizeRuleExtraction(
    JSON.stringify({
      title: "开发规范",
      category: "工程规范",
      rules: [
        {
          type: "must_not",
          priority: "P0",
          statement: "未经确认不得删除用户数据",
          rationale: "避免不可恢复的数据损失",
          sourceExcerpt: "未经确认不得删除用户数据",
        },
      ],
    }),
  );

  assert.equal(result.title, "开发规范");
  assert.equal(result.rules.length, 1);
  assert.equal(result.rules[0].type, "must_not");
  assert.equal(result.rules[0].status, "pending");
});

test("无效类型和优先级会使用安全默认值", () => {
  const result = normalizeRuleExtraction(
    JSON.stringify({
      rules: [
        {
          type: "unknown",
          priority: "P9",
          statement: "必须保存测试结果",
          sourceExcerpt: "必须保存测试结果",
        },
      ],
    }),
  );

  assert.equal(result.rules[0].type, "should");
  assert.equal(result.rules[0].priority, "P1");
});

test("导出时只包含已确认规则", () => {
  const markdown = exportRulesToMarkdown("规则集", [
    {
      id: "1",
      type: "must",
      priority: "P0",
      statement: "必须运行测试",
      rationale: "确保功能可用",
      sourceExcerpt: "",
      status: "approved",
    },
    {
      id: "2",
      type: "should",
      priority: "P2",
      statement: "建议统一格式",
      rationale: "",
      sourceExcerpt: "",
      status: "pending",
    },
  ]);

  assert.match(markdown, /必须运行测试/);
  assert.doesNotMatch(markdown, /建议统一格式/);
});
