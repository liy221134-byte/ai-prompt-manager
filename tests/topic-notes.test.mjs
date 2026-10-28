// 讲义常量：从主题包生成、给前端取用。
//
// 讲义不落库（线上库没有 summary / note_md 两列，也不打算加）——
// 它是随主题包分发的静态内容，有读无写。所以这组测试守两件事：
//   1) 生成物与主题包一致，改了 yaml 忘了重新生成必须立刻被发现；
//   2) 取用层「没讲义」与「有讲义」分得清，别把空壳混进去。

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import yaml from "js-yaml";

import {
  buildTopicNotesSource,
  OUTPUT_FILE,
  TOPICS_DIR,
} from "../scripts/build-topic-notes.mjs";
import {
  attachTopicNotes,
  getKnowledgeNote,
  getTopicNotes,
} from "../src/lib/learning/topic-notes.ts";

const PACK = yaml.load(readFileSync(join(TOPICS_DIR, "rk-mid-integration.yaml"), "utf8"));
const TOPIC_ID = PACK.topic.id;
const NOTE_SECTIONS = ["### 要素", "### 例题", "### 怎么考"];

test("讲义常量与主题包同步：改了 yaml 必须重新生成", () => {
  const { source } = buildTopicNotesSource();
  const onDisk = readFileSync(OUTPUT_FILE, "utf8");

  assert.equal(
    onDisk,
    source,
    "src/lib/learning/topic-notes.generated.ts 落后于主题包，跑一次 npm run gen:topic-notes",
  );
});

test("S1 五份讲义都进了常量，且三段齐全、一句话不超 60 字", () => {
  const s1 = PACK.knowledge_points.filter((kp) => kp.module_id === "S1");
  assert.equal(s1.length, 5, "S1 应当是五个知识点");

  const notes = getTopicNotes(TOPIC_ID);
  for (const kp of s1) {
    const note = notes[kp.id];
    assert.ok(note, `${kp.id} 的讲义没进常量`);
    assert.ok([...note.summary].length <= 60, `${kp.id} 的 summary 超过 60 字`);
    for (const section of NOTE_SECTIONS) {
      assert.ok(note.note_md.includes(section), `${kp.id} 的讲义缺「${section}」`);
    }
  }
});

test("没写讲义的知识点不进常量，不留空壳", () => {
  const notes = getTopicNotes(TOPIC_ID);
  const blank = PACK.knowledge_points.filter((kp) => !kp.note).map((kp) => kp.id);

  // 讲义是渐进补的。若哪天补齐了全部知识点，这条测试要跟着改，而不是被删。
  assert.ok(blank.length > 0, "主题包里应有还没写讲义的知识点");
  for (const id of blank) {
    assert.equal(notes[id], undefined, `${id} 没讲义，不该出现在常量里`);
  }
});

test("取不存在的主题或知识点不抛错，返回空值", () => {
  assert.deepEqual(getTopicNotes("no-such-topic"), {});
  // 空值形态而非 undefined：调用方照常渲染「这个知识点还没有讲义」
  assert.deepEqual(getKnowledgeNote(TOPIC_ID, "KP-NOPE"), { summary: "", note_md: "" });
});

test("attachTopicNotes 贴讲义，库里的字段原样保留，没讲义的给 null", () => {
  const rows = [
    { id: "KP-0101", module_id: "S1", name: "库里的名字", ref: "第9章" },
    { id: "KP-9999", module_id: "S1", name: "没讲义", ref: null },
  ];

  const merged = attachTopicNotes(TOPIC_ID, rows);

  assert.ok(merged[0].summary, "KP-0101 有讲义，summary 该有值");
  assert.ok(merged[0].note_md?.includes("### 要素"));
  assert.equal(merged[0].name, "库里的名字", "库里的字段必须原样保留");
  assert.equal(merged[0].module_id, "S1");

  assert.equal(merged[1].summary, null);
  assert.equal(merged[1].note_md, null);

  // 不改入参：调用方可能还拿着原数组做别的统计
  assert.equal("summary" in rows[0], false, "attachTopicNotes 不能就地改入参");
});

test("缺「怎么考」的讲义让生成器报错，不会静默编译进去", () => {
  const dir = mkdtempSync(join(tmpdir(), "topic-notes-"));
  writeFileSync(
    join(dir, "bad.yaml"),
    [
      "topic:",
      "  id: bad-topic",
      "knowledge_points:",
      "  - id: KP-1",
      "    module_id: S1",
      "    name: 坏讲义",
      "    note:",
      "      summary: 一句话定义",
      "      body: |",
      "        ### 要素",
      "        只有要素，没有例题和怎么考。",
      "",
    ].join("\n"),
    "utf8",
  );

  try {
    assert.throws(() => buildTopicNotesSource(dir), /怎么考/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
