import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

// 工程文档模板的内容门禁：文件不能少、结构不能散，免得改着改着变成空模板。
const templateDir = new URL("../templates/engineering/", import.meta.url);

const expectedTemplates = {
  "architecture.md": "架构与请求链路",
  "data-flow.md": "数据流",
  "environment-variables.md": "环境变量清单",
  "release-rollback.md": "发布与回滚",
  "backup-restore.md": "备份与恢复",
  "security-checklist.md": "安全检查",
  "incident-runbook.md": "故障处理手册",
  "cost-performance-baseline.md": "成本与性能基线",
  "drill-record.md": "故障演练记录",
  "implementation-spec.md": "实现规格（Spec）",
};

function readTemplate(name) {
  return readFileSync(new URL(name, templateDir), "utf8");
}

test("十份工程文档模板都在", () => {
  const files = readdirSync(templateDir).filter((name) => name.endsWith(".md"));

  assert.deepEqual(
    [...files].sort(),
    Object.keys(expectedTemplates).sort(),
    "模板文件多了或少了，都要先想清楚为什么要动",
  );
});

test("每份模板只有一个一级标题，标题和文件对得上", () => {
  for (const [name, title] of Object.entries(expectedTemplates)) {
    const content = readTemplate(name);
    const headings = content
      .split("\n")
      .filter((line) => line.startsWith("# "));

    assert.equal(headings.length, 1, `${name} 应该只有一个一级标题`);
    assert.equal(headings[0], `# ${title}`);
  }
});

test("每份模板都带项目名占位符、维护约定和足够正文", () => {
  for (const name of Object.keys(expectedTemplates)) {
    const content = readTemplate(name);

    assert.match(content, /\{\{项目名称\}\}/, `${name} 要用 {{项目名称}} 占位`);
    assert.match(
      content,
      /^##\s*(?:[一二三四五六七八九十]+、)?维护约定$/m,
      `${name} 结尾要有「维护约定」`,
    );
    assert.ok(
      content.replace(/\s/g, "").length > 400,
      `${name} 的正文太短，模板要有能照着填的骨架`,
    );
    assert.ok(!/TODO/.test(content), `${name} 里不能留 TODO`);
  }
});
