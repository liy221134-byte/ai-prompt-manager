// M4 诊断：组卷与层级推断。
//
// 这组测试守的核心不是「算得对」，而是**三种停下原因不许混**：
// 答错（wrong）= 这层没过；这层没题（no-question）= 没测；没作答（unanswered）= 没测。
// 后两种若被当成「不会」，等于把题库的缺口算在人的头上——这是这一版最容易犯的错，
// 所以下面专门有两条用例钉住它。

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDiagnosticPaper,
  collectWrongAnswers,
  inferLevels,
  isScorableType,
} from "../src/lib/learning/diagnostic.ts";
import {
  buildDiagnosticMessages,
  normalizeDiagnosticAdvice,
  normalizeLevelDefinition,
  validateDiagnosticRequest,
} from "../src/lib/learning/diagnostic-prompt.ts";

const MODULES = [
  { id: "S1", name: "项目管理框架", order_index: 1 },
  { id: "S2", name: "五大过程组", order_index: 2 },
];

const LEVEL_DEF = [
  { level: 1, name: "认得", criteria: "给选项能挑对" },
  { level: 2, name: "说得出", criteria: "能讲清要素" },
  { level: 3, name: "算得出", criteria: "套公式一次做对" },
  { level: 4, name: "判得准", criteria: "给场景能判断" },
  { level: 5, name: "迁得动", criteria: "能归因、能讲自己的项目" },
];

/**
 * 造一份「每模块每层各一道单选」的题干池。
 * 默认包含 L5——需要测「L5 没题」的场景时手动传 levelPlan。
 */
function makeQuestions(options = {}) {
  const levels = options.levels ?? [1, 2, 3, 4, 5];
  const modules = options.modules ?? MODULES.map((module) => module.id);
  const practical = new Set((options.practicalAt ?? []).map(([m, l]) => `${m}::${l}`));
  const result = [];

  for (const moduleId of modules) {
    for (const level of levels) {
      const isPractical = practical.has(`${moduleId}::${level}`);
      result.push({
        id: `${moduleId}-L${level}-A`,
        module_id: moduleId,
        level,
        type: isPractical ? "实操" : "单选",
        knowledge_point: `KP-${moduleId}-${level}`,
      });
    }
  }

  return result;
}

/** 把一张卷子全答成指定的对错，逐题给 */
function answerAll(paper, correctByModuleLevel) {
  const answers = {};
  for (const item of paper.items) {
    const key = `${item.moduleId}::${item.level}`;
    answers[item.questionId] = correctByModuleLevel[key] ?? true;
  }
  return answers;
}

// ---------------------------------------------------------------- 题型可判分性

test("实操题不可判分：它没有标准答案，进了诊断卷等于永远判对", () => {
  assert.equal(isScorableType("单选"), true);
  assert.equal(isScorableType("多选"), true);
  assert.equal(isScorableType("判断"), true);
  assert.equal(isScorableType("实操"), false);
  assert.equal(isScorableType(null), false);
});

test("组卷把实操题排除在外，哪怕它在那个格子里是唯一的题", () => {
  const questions = makeQuestions({ levels: [1], practicalAt: [["S1", 1]] });
  const paper = buildDiagnosticPaper(MODULES, questions);

  const s1l1 = paper.slots.find((slot) => slot.moduleId === "S1" && slot.level === 1);
  assert.equal(s1l1?.questionId, null, "S1 第 1 层只有实操题，抽不出可判分的题");
  assert.ok(
    paper.gaps.some((gap) => gap.moduleId === "S1" && gap.level === 1),
    "抽不出题要记成缺口，让界面能说「这层没测」",
  );

  // 另一层没被影响
  const s2l1 = paper.slots.find((slot) => slot.moduleId === "S2" && slot.level === 1);
  assert.equal(s2l1?.questionId, "S2-L1-A");
});

// ---------------------------------------------------------------- 组卷

test("组卷：每个模块每层各抽一道，按模块顺序、层数升序", () => {
  const paper = buildDiagnosticPaper(MODULES, makeQuestions());

  assert.equal(paper.items.length, 10, "两个模块 × 五层 = 十道");
  assert.deepEqual(
    paper.items.map((item) => `${item.moduleId}L${item.level}`),
    ["S1L1", "S1L2", "S1L3", "S1L4", "S1L5", "S2L1", "S2L2", "S2L3", "S2L4", "S2L5"],
    "顺序要稳定，否则同一个人的卷子每次顺序都不一样",
  );
  assert.equal(paper.gaps.length, 0);
});

test("组卷优先抽没做过的题：做过的可能记得答案", () => {
  const questions = [
    ...makeQuestions({ levels: [1], modules: ["S1"] }),
    { id: "S1-L1-B", module_id: "S1", level: 1, type: "单选" },
  ];

  const freshPaper = buildDiagnosticPaper([MODULES[0]], questions, ["S1-L1-A"]);
  const picked = freshPaper.items.find((item) => item.level === 1);
  assert.equal(picked?.questionId, "S1-L1-B", "A 做过了，应该抽没做过的 B");
  assert.equal(picked?.repeated, false);

  // 全做过时退回按 id 排序取第一，保证可复现
  const allDone = buildDiagnosticPaper([MODULES[0]], questions, ["S1-L1-A", "S1-L1-B"]);
  const fallback = allDone.items.find((item) => item.level === 1);
  assert.equal(fallback?.questionId, "S1-L1-A");
  assert.equal(fallback?.repeated, true, "抽到做过的题要标出来，结果里会提示有水分");
});

test("组卷：同一份题库两次组出的卷子完全一致", () => {
  const questions = makeQuestions();
  const first = buildDiagnosticPaper(MODULES, questions, ["S1-L1-A"]);
  const second = buildDiagnosticPaper(MODULES, [...questions].reverse(), ["S1-L1-A"]);
  assert.deepEqual(
    first.items.map((item) => item.questionId),
    second.items.map((item) => item.questionId),
    "题目输入顺序不该影响组卷结果",
  );
});

// ---------------------------------------------------------------- 层级推断

test("第一层就答错：reached 为 0，且不继续往上判", () => {
  const paper = buildDiagnosticPaper(MODULES, makeQuestions());
  const inference = inferLevels(
    MODULES,
    paper,
    answerAll(paper, { "S1::1": false, "S1::2": true, "S1::3": true }),
  );

  const s1 = inference.modules.find((module) => module.moduleId === "S1");
  assert.equal(s1.reached, 0);
  assert.deepEqual(s1.passedLevels, []);
  assert.deepEqual(s1.wrongLevels, [1]);
  assert.deepEqual(s1.stoppedAt, { level: 1, reason: "wrong" });
  assert.deepEqual(s1.testedLevels, [1], "错了就停，上面几层不该算作测过");
});

test("中间层答错：reached 停在前一层，上一层不判", () => {
  const paper = buildDiagnosticPaper(MODULES, makeQuestions());
  const inference = inferLevels(
    MODULES,
    paper,
    answerAll(paper, { "S1::1": true, "S1::2": true, "S1::3": false }),
  );

  const s1 = inference.modules.find((module) => module.moduleId === "S1");
  assert.equal(s1.reached, 2);
  assert.deepEqual(s1.passedLevels, [1, 2]);
  assert.deepEqual(s1.stoppedAt, { level: 3, reason: "wrong" });
});

test("连续全对：reached 到最后一层，stoppedAt 为 null", () => {
  const paper = buildDiagnosticPaper(MODULES, makeQuestions());
  const inference = inferLevels(MODULES, paper, answerAll(paper, {}));

  for (const verdict of inference.modules) {
    assert.equal(verdict.reached, 5);
    assert.equal(verdict.stoppedAt, null);
  }
});

test("某层没题时判「没测」而不是「不会」——这是最容易犯的错", () => {
  // 真实情况：中项题库单选只到 L4，L5 全是实操题
  const paper = buildDiagnosticPaper(MODULES, makeQuestions({ levels: [1, 2, 3, 4] }));
  const inference = inferLevels(MODULES, paper, answerAll(paper, {}));

  const s1 = inference.modules.find((module) => module.moduleId === "S1");
  assert.equal(s1.reached, 4, "只能说到第 4 层，不能宣称第 5 层");
  assert.deepEqual(
    s1.stoppedAt,
    { level: 5, reason: "no-question" },
    "停下原因必须是 no-question，不能是 wrong",
  );
  assert.deepEqual(s1.wrongLevels, [], "没题不等于答错");
});

test("没作答的层与答错的层分开：中断的卷子不能算成不会", () => {
  const paper = buildDiagnosticPaper(MODULES, makeQuestions());
  const answers = {
    [paper.items[0].questionId]: true,
    // 后面几题都不答
  };
  const inference = inferLevels(MODULES, paper, answers);

  const s1 = inference.modules.find((module) => module.moduleId === "S1");
  assert.deepEqual(s1.stoppedAt, { level: 2, reason: "unanswered" });
  assert.deepEqual(s1.wrongLevels, [], "没作答不能记成答错");
  assert.ok(inference.headline.includes("只答了"), "没做完要在结论里说清");
});

test("整卷都没可判分的题：结论要说「补题」，不是「你不行」", () => {
  const emptyPaper = buildDiagnosticPaper(MODULES, []);
  const inference = inferLevels(MODULES, emptyPaper, {});

  assert.equal(inference.total, 0);
  assert.equal(inference.gapCount, 10);
  for (const verdict of inference.modules) {
    assert.equal(verdict.measurable, false);
    assert.deepEqual(verdict.stoppedAt, { level: 1, reason: "no-question" });
  }
  assert.ok(inference.headline.includes("补题目"), "结论要指向题库缺口，不是人的能力");
});

test("结论措辞：最薄的一块要指名", () => {
  const paper = buildDiagnosticPaper(MODULES, makeQuestions());
  const inference = inferLevels(
    MODULES,
    paper,
    answerAll(paper, { "S1::1": true, "S1::2": true, "S1::3": true, "S1::4": true, "S1::5": true,
      "S2::1": true, "S2::2": true, "S2::3": false }),
  );
  assert.ok(inference.headline.includes("五大过程组"), inference.headline);
  assert.ok(inference.headline.includes("2 层"), inference.headline);
});

test("重复题数量会统计出来，用来提示结论有水分", () => {
  const paper = buildDiagnosticPaper(MODULES, makeQuestions(), [
    "S1-L1-A",
    "S1-L2-A",
    "S2-L1-A",
  ]);
  const inference = inferLevels(MODULES, paper, answerAll(paper, {}));
  assert.equal(inference.repeatedCount, 3);
});

// ---------------------------------------------------------------- 归因材料

test("归因只收答错的题，并带上知识点名", () => {
  const paper = buildDiagnosticPaper(MODULES, makeQuestions());
  const answers = answerAll(paper, { "S1::3": false, "S2::2": false });
  const inference = inferLevels(MODULES, paper, answers);

  const byId = new Map(makeQuestions().map((question) => [question.id, question]));
  const details = new Map([
    [
      "S1-L3-A",
      {
        title: "某题题干",
        type: "单选",
        selected: "A 选项",
        correct: "C 选项",
        knowledgePointName: "挣值分析",
      },
    ],
    ["S2-L2-A", { title: "另一题", type: "单选" }],
  ]);

  const wrong = collectWrongAnswers(inference, paper, byId, details);
  assert.deepEqual(
    wrong.map((item) => `${item.moduleId}L${item.level}`),
    ["S1L3", "S2L2"],
  );
  assert.equal(wrong[0].knowledgePointName, "挣值分析");
  assert.equal(wrong[0].selected, "A 选项");
  assert.equal(wrong[0].correct, "C 选项");
});

test("提示词里写清「没题」与「答错」的区别，避免模型把没测当成不会", () => {
  const messages = buildDiagnosticMessages({
    topicName: "中项",
    levelDefinition: LEVEL_DEF,
    modules: [
      {
        moduleId: "S1",
        moduleName: "项目管理框架",
        reached: 4,
        stoppedAt: { level: 5, reason: "no-question" },
        wrongAnswers: [],
        knowledgePointNames: ["项目与运营"],
      },
    ],
  });

  const userContent = messages.find((message) => message.role === "user").content;
  assert.ok(userContent.includes("未测"), "要把「未测」写进材料，模型才有依据不瞎判");
  assert.ok(userContent.includes("第5层 迁得动"), "五层定义要带上，否则模型不知道层名");
  assert.ok(userContent.includes("项目与运营"), "候选知识点要带上，约束模型别自己编");
});

// ---------------------------------------------------------------- 请求校验

test("请求校验：层数越界、停点原因不明都要拒绝", () => {
  const okBody = {
    topicName: "中项",
    modules: [
      {
        moduleId: "S1",
        reached: 2,
        stoppedAt: { level: 3, reason: "wrong" },
        wrongAnswers: [],
        knowledgePointNames: [],
      },
    ],
  };
  assert.equal(validateDiagnosticRequest(okBody).ok, true);

  const badReached = { ...okBody, modules: [{ ...okBody.modules[0], reached: 9 }] };
  assert.equal(validateDiagnosticRequest(badReached).ok, false);

  const badReason = {
    ...okBody,
    modules: [{ ...okBody.modules[0], stoppedAt: { level: 3, reason: "感觉很弱" } }],
  };
  assert.equal(validateDiagnosticRequest(badReason).ok, false);

  assert.equal(validateDiagnosticRequest({ modules: [] }).ok, false, "没有主题名要拒绝");
  assert.equal(validateDiagnosticRequest(null).ok, false);
});

// ---------------------------------------------------------------- 模型返回规整

test("模型把 JSON 包在围栏里也能剥出来", () => {
  const raw = '```json\n{"summary":"最薄的是五大过程组","modules":[{"moduleId":"S1","stuck":"把输入当输出","missing":["挣值分析"],"next":["重算三道挣值题"]}]}\n```';
  const advice = normalizeDiagnosticAdvice(raw, ["S1", "S2"]);
  assert.equal(advice.summary, "最薄的是五大过程组");
  assert.equal(advice.modules[0].stuck, "把输入当输出");
  assert.deepEqual(advice.modules[0].next, ["重算三道挣值题"]);
});

test("模型幻觉出来的模块 id 被丢弃，不污染结果", () => {
  const raw = JSON.stringify({
    summary: "x",
    modules: [
      { moduleId: "S1", stuck: "a", missing: [], next: [] },
      { moduleId: "S9-编的", stuck: "b", missing: [], next: [] },
    ],
  });
  const advice = normalizeDiagnosticAdvice(raw, ["S1", "S2"]);
  assert.deepEqual(
    advice.modules.map((module) => module.moduleId),
    ["S1"],
  );
});

test("模型话太多时截断，不因为啰嗦就把整次诊断作废", () => {
  const longText = "很".repeat(200);
  const raw = JSON.stringify({
    summary: longText,
    modules: [
      {
        moduleId: "S1",
        stuck: longText,
        missing: ["a", "b", "c", "d", "e", "f"],
        next: ["1", "2", "3", "4", "5"],
      },
    ],
  });
  const advice = normalizeDiagnosticAdvice(raw, ["S1"]);

  assert.ok([...advice.summary].length <= 120);
  assert.ok([...advice.modules[0].stuck].length <= 60);
  assert.equal(advice.modules[0].missing.length, 4, "missing 最多留 4 条");
  assert.equal(advice.modules[0].next.length, 3, "next 最多留 3 条");
});

test("模型返回根本不是 JSON：抛错，让上层降级成规则结论", () => {
  assert.throws(() => normalizeDiagnosticAdvice("我觉得他基础还行", ["S1"]));
});

test("阶梯定义读不到时退化成 L1—L5，不假装知道层名", () => {
  const levels = normalizeLevelDefinition(undefined);
  assert.deepEqual(
    levels.map((item) => item.name),
    ["L1", "L2", "L3", "L4", "L5"],
  );

  const fromDb = normalizeLevelDefinition(LEVEL_DEF);
  assert.equal(fromDb[2].name, "算得出");
  assert.equal(fromDb[2].criteria, "套公式一次做对");
});

test("阶梯定义残缺（少于 5 条）也退化，不用半份定义去渲染", () => {
  const levels = normalizeLevelDefinition([{ level: 1, name: "认得" }]);
  assert.equal(levels[0].name, "L1");
});
