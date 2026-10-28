import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SHEET_SECTIONS,
  describeProgress,
  emptySections,
  filledSectionCount,
  isBlankSheet,
  normalizeSections,
} from "../src/lib/learning/sheet.ts";
import {
  buildSheetReviewMessages,
  normalizeSheetReview,
  validateSheetReviewRequest,
} from "../src/lib/learning/sheet-prompt.ts";

// M5 一页素材表。这组测试守两件事：
//   一、六段结构固定但能容错（库里的 jsonb 缺键、多键、超长都不该让页面崩）；
//   二、AI 检查只出清单——编出来的概念、没引用原话的「你写错了」都要被挡掉。
//      这两条是「不代写」的底线，靠提示词约束不住，只能靠代码。

const WRITTEN = {
  definition: "把要做的事拆成可检查的活",
  concepts: "WBS 不是任务清单，是交付物分解",
  example: "上次气象大屏把数据接入拆成三个交付物",
  mistakes: "把 SV 的正负方向记反了",
  checklist: "能不能不看书画出流程图",
  selftest: "",
};

const INPUT = {
  moduleName: "项目管理框架",
  sections: normalizeSections(WRITTEN),
  knowledgePoints: ["项目与运营的区别", "WBS 分解原则"],
  wrongQuestionTitles: ["项目与运营的区别"],
};

// ── 六段结构 ────────────────────────────────────────────

test("六段齐全，每段都配引导问题而不是空标题", () => {
  assert.equal(SHEET_SECTIONS.length, 6);
  for (const section of SHEET_SECTIONS) {
    assert.ok(section.prompt.trim().length > 6, `${section.key} 的引导问题太短，落不了笔`);
    assert.ok(section.prompt.endsWith("？") || section.prompt.endsWith("。"));
  }
});

test("缺段补空串，段序不变", () => {
  const sections = normalizeSections({ definition: "一句话" });
  assert.equal(sections.definition, "一句话");
  assert.equal(sections.concepts, "");
  assert.deepEqual(Object.keys(sections), SHEET_SECTIONS.map((section) => section.key));
});

test("多出来的键扔掉，不往界面上带", () => {
  const sections = normalizeSections({ definition: "x", 口诀: "不该出现" });
  assert.equal("口诀" in sections, false);
});

test("非字符串的值当空处理，不抛", () => {
  const sections = normalizeSections({ definition: 42, concepts: null });
  assert.equal(sections.definition, "");
  assert.equal(sections.concepts, "");
});

test("超长内容截断，不拒绝", () => {
  const sections = normalizeSections({ definition: "字".repeat(30_000) });
  assert.equal([...sections.definition].length, 20_000);
});

test("空纸只有 0 段，写了一段的算 1 段", () => {
  assert.equal(isBlankSheet(emptySections()), true);
  assert.equal(filledSectionCount(normalizeSections(WRITTEN)), 5);
  assert.equal(describeProgress(normalizeSections(WRITTEN)), "写了 5/6 段");
  assert.equal(describeProgress(emptySections()), "还没写");
});

test("只有空白的段不算写过", () => {
  assert.equal(filledSectionCount(normalizeSections({ definition: "   \n  " })), 0);
});

// ── 请求校验 ────────────────────────────────────────────

test("六段全空时不许调模型——没内容可查，只会换来一段空话", () => {
  const result = validateSheetReviewRequest({
    moduleName: "项目管理框架",
    sections: emptySections(),
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /先写几句/);
});

test("写了内容就放行，缺模块名仍然拒绝", () => {
  assert.equal(validateSheetReviewRequest(INPUT).ok, true);
  assert.equal(validateSheetReviewRequest({ ...INPUT, moduleName: " " }).ok, false);
});

// ── 提示词 ──────────────────────────────────────────────

test("提示词带上六段原文与候选概念", () => {
  const [system, user] = buildSheetReviewMessages(INPUT);
  assert.match(system.content, /不许改写他的话/);
  assert.match(user.content, /把要做的事拆成可检查的活/);
  assert.match(user.content, /项目与运营的区别、WBS 分解原则/);
});

test("没写的段也摆出来，标成空着——模型才知道那里是洞", () => {
  const [, user] = buildSheetReviewMessages(INPUT);
  assert.match(user.content, /5 个自测题[^\n]*\n（空着）/);
});

// ── 返回校验 ────────────────────────────────────────────

test("gaps 只能落在候选概念里，编的概念丢掉", () => {
  const review = normalizeSheetReview(
    JSON.stringify({
      gaps: ["WBS 分解原则", "关键链法", "项目与运营的区别"],
      wrong: [],
      suggest: [],
    }),
    INPUT,
  );
  assert.deepEqual(review.gaps, ["WBS 分解原则", "项目与运营的区别"]);
});

test("没有候选概念时 gaps 一律清空，不允许凭感觉列", () => {
  const review = normalizeSheetReview(
    JSON.stringify({ gaps: ["随便一个概念"], wrong: [], suggest: [] }),
    { ...INPUT, knowledgePoints: [] },
  );
  assert.deepEqual(review.gaps, []);
});

test("wrong 必须引用他写过的原话，引用不到的丢掉", () => {
  const review = normalizeSheetReview(
    JSON.stringify({
      wrong: [
        "他写的「把 SV 的正负方向记反了」——SV 为负表示进度落后",
        "他对整体理解有偏差", // 没有原话可引，属于凭感觉
      ],
      gaps: [],
      suggest: [],
    }),
    INPUT,
  );
  assert.equal(review.wrong.length, 1);
  assert.match(review.wrong[0], /SV/);
});

test("suggest 原样保留，同样限条数与长度", () => {
  const many = Array.from({ length: 12 }, (_, index) => `建议 ${index}`);
  const review = normalizeSheetReview(
    JSON.stringify({ gaps: [], wrong: [], suggest: many }),
    INPUT,
  );
  assert.equal(review.suggest.length, 8);
});

test("三项都空是合法结果——他没漏也没错", () => {
  const review = normalizeSheetReview(JSON.stringify({ gaps: [], wrong: [], suggest: [] }), INPUT);
  assert.deepEqual(review, { gaps: [], wrong: [], suggest: [] });
});

test("返回里没有缺字段也不崩", () => {
  const review = normalizeSheetReview("{}", INPUT);
  assert.deepEqual(review, { gaps: [], wrong: [], suggest: [] });
});

test("不是 JSON 时报错，上层显示「检查没跑起来」", () => {
  assert.throws(() => normalizeSheetReview("你写得不错", INPUT), /找不到 JSON/);
});
