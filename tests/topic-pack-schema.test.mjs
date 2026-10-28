import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import yaml from "js-yaml";

import { validateTopicPack, toQuestionRow } from "../scripts/import-topic-pack.mjs";

// 主题包是这个产品的输入契约：AI 按它写、导入器按它校验。
// 这一组测试有两个作用：
//   1. 挡住「把真实主题包改坏」——它同时是一份持续生效的格式检查；
//   2. 确认每一条校验规则真的会拦人，而不是写在那里好看。

const PACK_PATH = new URL("../docs/learning/topics/rk-mid-integration.yaml", import.meta.url);
const realPack = yaml.load(readFileSync(PACK_PATH, "utf8"));

// 每个用例都在真实主题包的副本上改一处，避免用例之间互相污染
const clone = () => structuredClone(realPack);

test("真实的中项主题包能通过全部校验", () => {
  const errors = validateTopicPack(clone());
  assert.deepEqual(errors, [], `主题包有 ${errors.length} 处问题：\n${errors.join("\n")}`);
});

test("weight 合计不等于 1 会被拦下，并报出差值", () => {
  const pack = clone();
  pack.modules[0].weight = 0.4;
  const errors = validateTopicPack(pack);
  const hit = errors.find((error) => error.includes("weight 合计"));
  assert.ok(hit, "应当报 weight 合计不符");
  assert.match(hit, /差/);
});

test("planned_hours 合计与 total_hours 不一致会被拦下", () => {
  const pack = clone();
  pack.modules[2].planned_hours += 10;
  const errors = validateTopicPack(pack);
  assert.ok(errors.some((error) => error.includes("planned_hours 合计")));
});

test("level 越界会被拦下，并指出是哪道题", () => {
  const pack = clone();
  pack.questions[0].level = 7;
  const errors = validateTopicPack(pack);
  const hit = errors.find((error) => error.includes("level"));
  assert.ok(hit);
  assert.ok(hit.includes(pack.questions[0].id), "报错要带题目 id");
});

test("题目挂到不存在的知识点会被拦下", () => {
  const pack = clone();
  pack.questions[1].kp_id = "KP-9999";
  const errors = validateTopicPack(pack);
  assert.ok(errors.some((error) => error.includes("KP-9999")));
});

test("模块 id 重复、知识点 parent 悬空都会被拦下", () => {
  const pack = clone();
  pack.modules[1].id = pack.modules[0].id;
  pack.knowledge_points[0].parent = "KP-0000";
  const errors = validateTopicPack(pack);
  assert.ok(errors.some((error) => error.includes("id 重复")));
  assert.ok(errors.some((error) => error.includes("parent")));
});

test("entry_criteria 写成「S1 达标」会被拦下——那是模块依赖，不是能力标准", () => {
  const pack = clone();
  pack.modules[1].entry_criteria = "S1 达标";
  const errors = validateTopicPack(pack);
  assert.ok(errors.some((error) => error.includes("模块依赖")));
});

test("缺必填字段会指出具体路径", () => {
  const pack = clone();
  delete pack.modules[0].exit_criteria;
  const errors = validateTopicPack(pack);
  const hit = errors.find((error) => error.includes("modules[0].exit_criteria"));
  assert.ok(hit);
});

test("空文件或非对象直接拒绝，不抛异常", () => {
  assert.deepEqual(validateTopicPack(null).length, 1);
  assert.ok(validateTopicPack("随便一段文字").length > 0);
});

test("关键节点的日期写不成日期会被拦下——写错了倒计时会静默算错", () => {
  const pack = clone();
  pack.topic.exam_facts.milestones[0].date = "2027-03下旬";
  const errors = validateTopicPack(pack);
  assert.ok(errors.some((error) => error.includes("milestones[0].date")));
});

test("关键节点缺 name 会被拦下", () => {
  const pack = clone();
  delete pack.topic.exam_facts.milestones[1].name;
  const errors = validateTopicPack(pack);
  assert.ok(errors.some((error) => error.includes("milestones[1].name")));
});

// ── 行映射（2026-10-28 补）────────────────────────────────
// 背景：导入器往 practice_questions 写库时曾漏掉 type 字段，34 道实操题被列的默认值
// 悄悄写成「单选」。YAML 校验全过、导入日志也报成功，只有到页面上才会发现作答不了。
// 这一组测试守的是「YAML 里的字段真的被搬到数据库行里」这一段。

test("行映射保留题型，不被默认值吞掉", () => {
  const row = toQuestionRow(
    {
      id: "RK-X-001",
      module_id: "S1",
      kp_id: "KP-0101",
      category: "测试分类",
      type: "实操",
      difficulty: "hard",
      level: 5,
      title: "标题",
      body_md: "题干",
      options: [],
      answer: "参考要点",
      explanation_md: "解析",
      source: "manual",
    },
    "demo-topic",
  );

  assert.equal(row.type, "实操", "题型在映射中丢失，会退化成单选");
  assert.equal(row.knowledge_point, "KP-0101", "知识点列名是 knowledge_point，不是 kp_id");
  assert.equal(row.module_id, "S1");
  assert.equal(row.level, 5);
  assert.equal(row.topic_id, "demo-topic");
  assert.equal(row.source, "manual");
});

test("题型缺失时兜底为单选，而不是写 null", () => {
  const row = toQuestionRow({ id: "RK-X-002", answer: "A" }, "demo-topic");
  assert.equal(row.type, "单选");
  assert.deepEqual(row.options, [], "实操题没有选项时要有空数组，不能是 undefined");
});

test("真实主题包每道题映射后，题型、知识点、层级三项都与源一致", () => {
  for (const q of realPack.questions) {
    const row = toQuestionRow(q, realPack.topic.id);
    assert.equal(row.type, q.type, `${q.id} 的题型在映射中丢失`);
    assert.equal(row.knowledge_point, q.kp_id, `${q.id} 的知识点没有落到对应列`);
    assert.equal(row.level, q.level, `${q.id} 的能力层级在映射中丢失`);
    assert.equal(row.module_id, q.module_id, `${q.id} 的内容模块在映射中丢失`);
  }
});
