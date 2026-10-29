// 论文批改（M7）的纯函数与返回校验。
//
// 这组测试守的不是「字段能不能读出来」，而是三件更硬的事：
//   · **永远不出现分数**。模型违反「不给分」时，界面不能跟着把分数显示出来。
//   · **依据空的必须写成「未找到对应段落」**。空字符串会被渲染成空白，
//     看起来像「这条没问题」，而实际是「引不出来」——这两件事完全不同。
//   · **超长正文直接拒，不静默截断**。截断等于替他删掉了后半篇。
//
// 前两条如果破了，他会照着假结论去改一篇本来没问题的论文。

import assert from "node:assert/strict";
import test from "node:test";

import {
  NO_EVIDENCE,
  countAnswered,
  countEssayChars,
  describeCoverage,
  isCleanReview,
  validateEssayReviewRequest,
} from "../src/lib/learning/essay.ts";
import { looksLikeScore, normalizeEssayReview } from "../src/lib/learning/essay-prompt.ts";

// ── 字数 ────────────────────────────────────────────────────────

test("字数按去掉空白后的字符数算", () => {
  assert.equal(countEssayChars("项目 管理"), 4);
  assert.equal(countEssayChars("项目\n\n管理\t计划"), 6);
  assert.equal(countEssayChars("   "), 0);
  assert.equal(countEssayChars(""), 0);
});

test("非字符串不炸，按 0 字算", () => {
  assert.equal(countEssayChars(null), 0);
  assert.equal(countEssayChars(undefined), 0);
  assert.equal(countEssayChars(123), 0);
});

// ── 请求校验 ────────────────────────────────────────────────────

const OK_PROMPT = "论信息系统项目质量管理。1. 概要叙述你参与的项目。2.（1）如何评价数据质量（2）你怎么管的（3）写出三个指标";

test("题目与正文都齐了才放行", () => {
  const result = validateEssayReviewRequest({
    promptText: OK_PROMPT,
    essayText: "x".repeat(500),
    draftLabel: "第 1 稿",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.draftLabel, "第 1 稿");
  }
});

test("没贴题目就不给批——不接受只批文不批题", () => {
  const result = validateEssayReviewRequest({
    promptText: "   ",
    essayText: "x".repeat(500),
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    // 话术要指出去做什么，不是「参数缺失」
    assert.match(result.error, /题目/);
  }
});

test("题目太短按「贴得不全」处理", () => {
  const result = validateEssayReviewRequest({
    promptText: "论质量管理",
    essayText: "x".repeat(500),
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /题目/);
});

test("正文太短不给批", () => {
  const result = validateEssayReviewRequest({ promptText: OK_PROMPT, essayText: "刚写了个开头" });

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /太短/);
});

test("超长正文直接拒，不静默截断", () => {
  const result = validateEssayReviewRequest({
    promptText: OK_PROMPT,
    essayText: "字".repeat(30_001),
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /3 万字/);
});

test("非对象、数组、null 都挡掉", () => {
  assert.equal(validateEssayReviewRequest(null).ok, false);
  assert.equal(validateEssayReviewRequest([]).ok, false);
  assert.equal(validateEssayReviewRequest("x").ok, false);
});

test("稿次标签截到 20 字，不会因为标签太长拖垮插入", () => {
  const result = validateEssayReviewRequest({
    promptText: OK_PROMPT,
    essayText: "x".repeat(500),
    draftLabel: "第".repeat(50),
  });

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.draftLabel.length, 20);
});

// ── 返回校验 ────────────────────────────────────────────────────

const FULL_REVIEW = {
  subQuestions: [
    {
      question: "叙述你参与的项目",
      requirement: "",
      answered: true,
      groundedInProject: true,
      hasSpecifics: true,
      evidence: "我在 2025 年负责某市政数据平台",
    },
    {
      question: "写出三个评价数据准确性的指标及计算方法",
      requirement: "写出 3 个",
      answered: false,
      groundedInProject: false,
      hasSpecifics: false,
      evidence: "",
    },
  ],
  hardLineSuspects: [
    { kind: "fabricated", concern: "工期 20 天与 12 个模块的规模对不上", evidence: "工期 20 天" },
    { kind: "invented", concern: "模型自己发明的一类", evidence: "x" },
  ],
  dimensions: [
    { key: "relevance", grade: "较好地切合", basis: "第 2 题未答" },
    { key: "depth", grade: "58", basis: "综合印象" },
  ],
  topFix: "补上第 2 题(3)的三个指标与算法",
};

test("四块产出按结构解析出来", () => {
  const review = normalizeEssayReview(JSON.stringify(FULL_REVIEW));

  assert.equal(review.subQuestions.length, 2);
  assert.equal(review.subQuestions[1].answered, false);
  assert.equal(review.dimensions.length, 5);
  assert.equal(review.topFix, "补上第 2 题(3)的三个指标与算法");
});

test("**产出里没有任何分数字段**", () => {
  const review = normalizeEssayReview(JSON.stringify(FULL_REVIEW));

  // 顶层只有这四块，多一个字段就意味着界面可能把它渲染出来
  assert.deepEqual(Object.keys(review).sort(), [
    "dimensions",
    "hardLineSuspects",
    "subQuestions",
    "topFix",
  ]);

  const serialized = JSON.stringify(review);
  for (const forbidden of ["score", "total", "points", "pass", "及格线"]) {
    assert.equal(
      serialized.includes(`"${forbidden}`),
      false,
      `产出里不该出现 ${forbidden} 字段`,
    );
  }
});

test("模型给了分数而不是档位时，这一项作废成「未判」", () => {
  const review = normalizeEssayReview(JSON.stringify(FULL_REVIEW));
  const depth = review.dimensions.find((item) => item.key === "depth");

  assert.equal(depth?.grade, "未判");
  assert.match(depth?.basis ?? "", /分数/);
});

test("依据空的补成「未找到对应段落」，不留空串", () => {
  const review = normalizeEssayReview(JSON.stringify(FULL_REVIEW));

  assert.equal(review.subQuestions[1].evidence, NO_EVIDENCE);
});

test("硬线类型不在三条里的整条丢掉", () => {
  const review = normalizeEssayReview(JSON.stringify(FULL_REVIEW));

  assert.equal(review.hardLineSuspects.length, 1);
  assert.equal(review.hardLineSuspects[0].kind, "fabricated");
});

test("缺的维度补「未判」，不悄悄少一行", () => {
  const review = normalizeEssayReview(JSON.stringify(FULL_REVIEW));
  const analysis = review.dimensions.find((item) => item.key === "analysis");

  assert.equal(analysis?.grade, "未判");
  assert.match(analysis?.basis ?? "", /没给/);
});

test("维度按固定顺序输出，不跟着模型返回的顺序走", () => {
  const review = normalizeEssayReview(JSON.stringify(FULL_REVIEW));
  const keys = review.dimensions.map((item) => item.key);

  assert.deepEqual(keys, ["relevance", "depth", "practice", "expression", "analysis"]);
});

test("字符串布尔要认否定词——Boolean(\"否\") 会是 true，这是个真坑", () => {
  const review = normalizeEssayReview(
    JSON.stringify({
      subQuestions: [
        { question: "问一", answered: "否", groundedInProject: "没有", hasSpecifics: "是" },
        { question: "问二", answered: "已答", groundedInProject: false, hasSpecifics: true },
      ],
    }),
  );

  assert.equal(review.subQuestions[0].answered, false);
  assert.equal(review.subQuestions[0].groundedInProject, false);
  assert.equal(review.subQuestions[0].hasSpecifics, true);
  assert.equal(review.subQuestions[1].answered, true);
});

test("连「在问什么」都写不出来的行会被丢掉，不占对照表位置", () => {
  const review = normalizeEssayReview(
    JSON.stringify({
      subQuestions: [{ question: "  ", answered: true }, { question: "有内容的", answered: true }],
    }),
  );

  assert.equal(review.subQuestions.length, 1);
  assert.equal(review.subQuestions[0].question, "有内容的");
});

test("带 markdown 围栏的返回也能解析", () => {
  const review = normalizeEssayReview("```json\n" + JSON.stringify(FULL_REVIEW) + "\n```");
  assert.equal(review.subQuestions.length, 2);
});

test("返回不是 JSON 对象时报错，交给接口层翻成「再试一次」", () => {
  assert.throws(() => normalizeEssayReview("完全不是 JSON"));
  assert.throws(() => normalizeEssayReview(""));
  assert.throws(() => normalizeEssayReview("[1,2,3]"));
});

test("空的 subQuestions 收成空数组，界面据此提示「题目贴得不全」", () => {
  const review = normalizeEssayReview(JSON.stringify({ subQuestions: [], topFix: "" }));

  assert.equal(review.subQuestions.length, 0);
  assert.equal(describeCoverage(review), "没从题目里读出子问题");
});

// ── 统计与文案 ──────────────────────────────────────────────────

test("答到几条按 answered 数，不按 groundedInProject 数", () => {
  const review = normalizeEssayReview(JSON.stringify(FULL_REVIEW));

  assert.equal(countAnswered(review), 1);
  assert.equal(describeCoverage(review), "2 个子问题里答到 1 个");
});

test("全答到时的文案不复述数字", () => {
  const review = normalizeEssayReview(
    JSON.stringify({ subQuestions: [{ question: "问一", answered: true }] }),
  );

  assert.equal(describeCoverage(review), "1 个子问题都答到了");
});

test("四块全干净才算 clean", () => {
  const clean = normalizeEssayReview(
    JSON.stringify({
      subQuestions: [{ question: "问一", answered: true }],
      hardLineSuspects: [],
      topFix: "",
    }),
  );
  assert.equal(isCleanReview(clean), true);

  const withSuspect = normalizeEssayReview(JSON.stringify(FULL_REVIEW));
  assert.equal(isCleanReview(withSuspect), false);
});

test("分数样子的文字认得出来，档位词不会被误判", () => {
  assert.equal(looksLikeScore("58"), true);
  assert.equal(looksLikeScore("58 分"), true);
  assert.equal(looksLikeScore("58/75"), true);
  assert.equal(looksLikeScore("60%"), true);

  assert.equal(looksLikeScore("较好地切合"), false);
  assert.equal(looksLikeScore("一般"), false);
  assert.equal(looksLikeScore("未判"), false);
  // 「很强」里带个数字也不该误伤——现在没有这种档位，但判据要窄
  assert.equal(looksLikeScore("57 分的样子"), false);
});
