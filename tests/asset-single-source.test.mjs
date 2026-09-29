// 收口回归：方法的定义句只许出现在规则／方法资产里，模板和提示词只能引用，不能重写定义。
//
// 这是 v2.25.0 文档与资产口径收口（外部评审 P0 第 4 条）的复发检查：
// 一旦有人把定义句子又抄回模板或提示词，这条测试变红。
//
// 跑法（项目约定）：node --test "tests/*.test.mjs"

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(import.meta.dirname, "..");
const assetsDir = join(projectRoot, "seed-packs", "engineering-foundations", "assets");

// 这些定义句当前只应出现在 assets/ 下的正本（045 / 046）。
// 它们曾经被抄进 templates/methods/ 和 prompt-packs/product-methods.md，造成多份载体。
const definitionPhrases = [
  "我自己看得见、有依据", // RULE-PREMORTEM-001：真问题的定义
  "别人担心、但我不信", // RULE-PREMORTEM-001：纸老虎的定义
  "没人说出口、也没人去验证", // RULE-PREMORTEM-001：房间里的大象的定义
  "假了方案就死", // RULE-REDTEAM-001：承重假设的定义
  "打稻草人的攻击没有价值", // RULE-REDTEAM-001：先钢人再攻击的定义（只许在正本）
];

// 只允许这些载体引用，不允许重写定义。
const carrierFiles = [
  join(projectRoot, "templates", "methods", "premortem.md"),
  join(projectRoot, "templates", "methods", "redteam.md"),
  join(projectRoot, "templates", "methods", "design-plan.md"),
  join(projectRoot, "templates", "methods", "user-story.md"),
  join(projectRoot, "templates", "methods", "job-story.md"),
  join(projectRoot, "templates", "methods", "wwa.md"),
  join(projectRoot, "prompt-packs", "product-methods.md"),
];

function readSafe(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

test("方法定义句只许出现在规则／方法资产里", () => {
  const carriers = carrierFiles.map((file) => ({ file, content: readSafe(file) }));

  for (const phrase of definitionPhrases) {
    const leaks = carriers
      .filter(({ content }) => content.includes(phrase))
      .map(({ file }) => file.replace(projectRoot + "\\", "").replace(projectRoot + "/", ""));

    assert.equal(
      leaks.length,
      0,
      `定义句「${phrase}」不应出现在模板／提示词里，但出现在：${leaks.join("、")}`,
    );
  }
});

test("定义句确实在正本里（防止测试因短语被彻底删掉而虚绿）", () => {
  // assets 目录逐文件拼接，确认每个短语至少在一个正本里存在。
  const files = readdirSync(assetsDir).filter((f) => f.endsWith(".md"));
  const allAssets = files
    .map((f) => readFileSync(join(assetsDir, f), "utf8"))
    .join("\n");

  for (const phrase of definitionPhrases) {
    assert.ok(
      allAssets.includes(phrase),
      `定义句「${phrase}」必须能在 assets/ 正本里找到，否则这条检查失去意义`,
    );
  }
});
