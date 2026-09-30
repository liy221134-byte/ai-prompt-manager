// 线索 3 M2.2 T15：采集产出件的直读解析（落库命令 `npm run collect:land` 的输入层）

import assert from "node:assert/strict";
import { test } from "node:test";

import { parseCollectionOutputFiles } from "../src/lib/collection-output.ts";

test("产出件解析：标题取第一个井号行，正文整段保留，摘要取首条正文", () => {
  const items = parseCollectionOutputFiles([
    {
      filename: "no-heredoc.md",
      content: [
        "# 不要用 heredoc 写文件",
        "",
        "写多行文件用写入工具，不要用 shell 的 heredoc——转义会把内容改坏。",
        "",
        "- 反例：cat <<EOF",
      ].join("\n"),
    },
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0].title, "不要用 heredoc 写文件");
  assert.equal(items[0].summary, "写多行文件用写入工具，不要用 shell 的 heredoc——转义会把内容改坏。");
  assert.match(items[0].content, /# 不要用 heredoc 写文件/);
  assert.match(items[0].content, /- 反例：cat <<EOF/);
  assert.equal(items[0].sourceFilename, "no-heredoc.md");
});

test("产出件解析：没有井号标题就退回文件名；frontmatter 不进正文；空文件跳过", () => {
  const items = parseCollectionOutputFiles([
    {
      filename: "degrade-silently.md",
      content: "做不到的能力要明说降级，不能伪造结果。",
    },
    {
      filename: "with-frontmatter.md",
      content: [
        "---",
        'status: "candidate"',
        'confidence: "hypothesis"',
        "---",
        "",
        "# 带 frontmatter 的规则",
        "",
        "正面内容。",
      ].join("\n"),
    },
    { filename: "empty.md", content: "   \n\n" },
  ]);

  assert.equal(items.length, 2);
  assert.equal(items[0].title, "degrade-silently");
  assert.equal(items[0].summary, "做不到的能力要明说降级，不能伪造结果。");
  // frontmatter 被剥掉，正文从标题开始
  assert.equal(items[1].title, "带 frontmatter 的规则");
  assert.doesNotMatch(items[1].content, /confidence/);
  assert.match(items[1].content, /正面内容。/);
});

test("产出件解析：多文件按传入顺序输出，来源文件名各归各", () => {
  const items = parseCollectionOutputFiles([
    { filename: "a.md", content: "# 规则 A\n\n正文 A。" },
    { filename: "b.md", content: "# 规则 B\n\n正文 B。" },
  ]);

  assert.deepEqual(
    items.map((item) => item.title),
    ["规则 A", "规则 B"],
  );
  assert.deepEqual(
    items.map((item) => item.sourceFilename),
    ["a.md", "b.md"],
  );
});
