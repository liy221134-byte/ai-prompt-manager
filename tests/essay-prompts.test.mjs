// 论文真题常量：从主题包 essay_prompts 生成、给批改抽屉取用。
//
// 跟讲义同一套理由（见 tests/topic-notes.test.mjs 顶部）：题目是静态内容、不判分、有读无写，
// 所以不落库，编译成常量。这组测试守三件事：
//   1) 生成物与主题包一致，改了 yaml 忘了重新生成必须立刻被发现；
//   2) 每条题面都必须带来源——软考官方从不公布真题，不带来源就等于把回忆版当官方原文；
//   3) 生成器会拦「id 重复」「题面没抄全」，不会静默编译进去。

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import yaml from "js-yaml";

import {
  buildEssayPromptsSource,
  collectEssayPrompts,
  ESSAY_OUTPUT_FILE,
  TOPICS_DIR,
} from "../scripts/build-topic-notes.mjs";
import { TOPIC_ESSAY_PROMPTS } from "../src/lib/learning/essay-prompts.generated.ts";

const PACK = yaml.load(readFileSync(join(TOPICS_DIR, "rk-mid-integration.yaml"), "utf8"));
const TOPIC_ID = PACK.topic.id;

/** 造一个只含一道题的主题包，用来测错误分支 */
function withTempPack(lines, run) {
  const dir = mkdtempSync(join(tmpdir(), "essay-prompts-"));
  writeFileSync(join(dir, "bad.yaml"), lines.join("\n"), "utf8");
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** 一道合格题面的最小骨架，各错误用例只改其中一行 */
const GOOD_HEAD = [
  "topic:",
  "  id: bad-topic",
  "essay_prompts:",
  "  - id: RK-E-TEST",
  "    kp_id: KP-0701",
  "    year: 2026",
  "    session: 上半年",
  "    batch: 第一批次",
  "    title: 论某个题目",
];

const GOOD_PROMPT = [
  "    prompt_md: |",
  "      请以“论某个题目”进行论述。1.概要叙述你参与过的信息系统项目，并说明你承担的工作。",
  "      2.围绕以下要点论述：（1）说一说（2）写一写（3）算一算。",
];

const GOOD_SOURCE = ["    source_note: 学员回忆版；某某网，非官方原文"];

test("论文真题常量与主题包同步：改了 yaml 必须重新生成", () => {
  const { source } = buildEssayPromptsSource();
  const current = readFileSync(ESSAY_OUTPUT_FILE, "utf8");
  assert.equal(current, source, "essay-prompts.generated.ts 与主题包不一致，跑 npm run gen:topic-notes");
});

test("主题包里每道论文真题都进了常量，字段齐全", () => {
  const declared = Array.isArray(PACK.essay_prompts) ? PACK.essay_prompts : [];
  assert.ok(declared.length > 0, "主题包里一道论文真题都没有");

  const built = TOPIC_ESSAY_PROMPTS[TOPIC_ID] ?? [];
  assert.equal(built.length, declared.length, "常量里的题数与主题包不一致");

  for (const item of built) {
    assert.match(item.id, /^RK-E/, `${item.id} 的 id 前缀不是 RK-E`);
    assert.ok(item.title.trim().length > 0, `${item.id} 缺标题`);
    // 题面必须带子问题：批改判「答没答到第几问」全靠它，只有题目名的题面没法判
    assert.ok(item.prompt_md.length > 80, `${item.id} 的题面只有 ${item.prompt_md.length} 字，像是只抄了题目名`);
    assert.ok(item.source_note.length > 0, `${item.id} 缺来源，回忆版不能当官方原文用`);
    assert.ok(item.kp_id.length > 0, `${item.id} 没挂知识点`);
  }
});

test("题面里不含拆好的子问题列表：拆解是批改时的事，预拆等于替模型定判据", () => {
  const built = TOPIC_ESSAY_PROMPTS[TOPIC_ID] ?? [];
  for (const item of built) {
    // 主题包里允许出现「（1）（2）（3）」——那是题目原文自带的。
    // 但不允许出现结构化字段名，那说明有人把拆解结果写进去了。
    assert.equal("sub_questions" in item, false, `${item.id} 带了预拆的子问题`);
    assert.equal("subQuestions" in item, false, `${item.id} 带了预拆的子问题`);
  }
});

test("真题按年份倒序：最近一年的题面口径最接近下次考试", () => {
  const built = TOPIC_ESSAY_PROMPTS[TOPIC_ID] ?? [];
  const years = built.map((item) => item.year);
  const sorted = [...years].sort((a, b) => b - a);
  assert.deepEqual(years, sorted, "论文真题没有按年份倒序排");
});

test("缺 source_note 让生成器报错，不会静默编译进去", () => {
  withTempPack([...GOOD_HEAD, ...GOOD_PROMPT], (dir) => {
    assert.throws(() => buildEssayPromptsSource(dir), /source_note/);
  });
});

test("id 重复让生成器报错：批改记录要靠它反查是哪套真题", () => {
  withTempPack(
    [
      ...GOOD_HEAD,
      ...GOOD_PROMPT,
      ...GOOD_SOURCE,
      "  - id: RK-E-TEST",
      "    kp_id: KP-0701",
      "    title: 撞号的第二题",
      ...GOOD_PROMPT,
      ...GOOD_SOURCE,
    ],
    (dir) => {
      assert.throws(() => buildEssayPromptsSource(dir), /重复/);
    },
  );
});

test("题面太短让生成器报错：只写题目名等于没抄题", () => {
  withTempPack(
    [...GOOD_HEAD, "    prompt_md: |", "      论某个题目", ...GOOD_SOURCE],
    (dir) => {
      assert.throws(() => buildEssayPromptsSource(dir), /题面没抄全/);
    },
  );
});

test("extra_md 可缺省：没有考场口径就是 null，不编一段出来", () => {
  withTempPack([...GOOD_HEAD, ...GOOD_PROMPT, ...GOOD_SOURCE], (dir) => {
    const { prompts } = collectEssayPrompts(dir);
    assert.equal(prompts["bad-topic"][0].extra_md, null);
  });
});

test("没有论文真题的主题不进常量，不留空数组", () => {
  withTempPack(["topic:", "  id: empty-topic"], (dir) => {
    const { prompts, errors } = collectEssayPrompts(dir);
    assert.deepEqual(errors, []);
    assert.equal("empty-topic" in prompts, false);
  });
});
