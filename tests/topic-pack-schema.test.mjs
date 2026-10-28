import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import yaml from "js-yaml";

import { validateTopicPack, toQuestionRow, resolveKind, resolveLevelDefinition, BUILTIN_LEVEL_TEMPLATES, VALID_KINDS } from "../scripts/import-topic-pack.mjs";

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

// ── 阶梯模板（2026-10-28 随 M2 多目标补）──────────────────
// 背景：目标不再只有一个考试，所以五层从「产品常量」改成「结构固定、名字与判据随主题」。
// 这一组守两件事：内置模板自己必须合规；包里写了就必须真的被校验器拦住。

test("四类内置模板都合规：五层齐全、不重名、判据可观察", () => {
  assert.deepEqual(Object.keys(BUILTIN_LEVEL_TEMPLATES).sort(), [...VALID_KINDS].sort());

  for (const [kind, template] of Object.entries(BUILTIN_LEVEL_TEMPLATES)) {
    assert.equal(template.length, 5, `${kind} 模板不是 5 层`);
    assert.deepEqual(
      template.map((item) => item.level).sort((a, b) => a - b),
      [1, 2, 3, 4, 5],
      `${kind} 模板层级不是 1—5`,
    );

    const names = template.map((item) => item.name);
    assert.equal(new Set(names).size, 5, `${kind} 模板里有重名的层：${names.join("/")}`);

    // 模板自己不能违反校验器——否则「没写走内置」这条路会绕过所有检查
    const asPack = clone();
    asPack.topic.kind = kind;
    asPack.level_definition = template;
    assert.deepEqual(
      validateTopicPack(asPack),
      [],
      `${kind} 内置模板没通过自己的校验：\n${validateTopicPack(asPack).join("\n")}`,
    );
  }
});

test("四类模板的同一层判据互不相同——否则分类没有意义", () => {
  for (let level = 1; level <= 5; level += 1) {
    const names = VALID_KINDS.map((kind) =>
      BUILTIN_LEVEL_TEMPLATES[kind].find((item) => item.level === level).name,
    );
    assert.equal(
      new Set(names).size,
      VALID_KINDS.length,
      `第 ${level} 层在四类模板里有重名，说明没按目标性质区分：${names.join("/")}`,
    );
  }
});

test("没写 level_definition 时按 kind 取内置模板", () => {
  const pack = clone();
  delete pack.level_definition;
  pack.topic.kind = "skill";
  assert.deepEqual(resolveLevelDefinition(pack), BUILTIN_LEVEL_TEMPLATES.skill);
});

test("kind 缺省按考试型——v1/v1.1 的旧包不用改就能导", () => {
  const pack = clone();
  delete pack.topic.kind;
  assert.equal(resolveKind(pack), "exam");
  assert.deepEqual(resolveLevelDefinition(pack), BUILTIN_LEVEL_TEMPLATES.exam);
});

test("中项主题包是考试型，五层与 v1 的定法一致", () => {
  assert.equal(resolveKind(realPack), "exam");
  const names = resolveLevelDefinition(realPack).map((item) => item.name);
  assert.deepEqual(names, ["认得", "说得出", "算得出", "判得准", "迁得动"]);
});

test("包里自定义的阶梯定义优先于内置模板", () => {
  const pack = clone();
  pack.topic.kind = "skill";
  pack.level_definition = BUILTIN_LEVEL_TEMPLATES.skill.map((item) =>
    item.level === 5 ? { ...item, name: "能带人" } : item,
  );
  assert.equal(resolveLevelDefinition(pack)[4].name, "能带人");
});

test("kind 填了不在四类里的值会被拦下", () => {
  const pack = clone();
  pack.topic.kind = "hobby";
  const errors = validateTopicPack(pack);
  assert.ok(errors.some((error) => error.includes("topic.kind")));
});

test("阶梯定义少一层会被拦下——缺一层矩阵就塌一格", () => {
  const pack = clone();
  pack.level_definition = BUILTIN_LEVEL_TEMPLATES.exam.slice(0, 4);
  const errors = validateTopicPack(pack);
  assert.ok(errors.some((error) => error.includes("必须是 5 条")));
  assert.ok(errors.some((error) => error.includes("缺第 5 层")));
});

test("两层重名会被拦下——重名说明这两层没想清区别", () => {
  const pack = clone();
  pack.level_definition = BUILTIN_LEVEL_TEMPLATES.exam.map((item) =>
    item.level === 3 ? { ...item, name: "说得出" } : item,
  );
  const errors = validateTopicPack(pack);
  assert.ok(errors.some((error) => error.includes("重名")));
});

test("判据写成「理解 / 掌握」会被拦下，并给出改写示例", () => {
  const pack = clone();
  pack.level_definition = BUILTIN_LEVEL_TEMPLATES.exam.map((item) =>
    item.level === 2 ? { ...item, criteria: "深入理解这个知识点" } : item,
  );
  const errors = validateTopicPack(pack);
  const hit = errors.find((error) => error.includes("不可判词"));
  assert.ok(hit, "应当拦下含糊判据");
  assert.match(hit, /例如/, "报错要给出可照抄的改法");
});

test("阶梯定义里 level 重复或越界会被拦下", () => {
  const pack = clone();
  pack.level_definition = BUILTIN_LEVEL_TEMPLATES.exam.map((item) =>
    item.level === 4 ? { ...item, level: 3 } : item,
  );
  const errors = validateTopicPack(pack);
  assert.ok(errors.some((error) => error.includes("level 重复")));
  assert.ok(errors.some((error) => error.includes("缺第 4 层")));
});
