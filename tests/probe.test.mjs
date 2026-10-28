import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_PROBE_ROUNDS,
  checkFollowUp,
  countMyAnswers,
  findQuotedFragment,
  isFinished,
  isUsableVerdict,
  lastAiQuestion,
  normalizeForCompare,
  planNextTurn,
  repairHint,
  readStoredProbe,
} from "../src/lib/learning/probe.ts";

// M5 追问状态机。这组测试守两件事：
//   一、轮数：到了上限必须收尾，不能无限追问下去（模型不会自己停）。
//   二、有效追问：不引用上一轮回答具体内容的问句不算数——
//       这条最容易漏，因为「能再详细说说吗」读起来完全像一句正常的追问。

const ask = (text) => ({ role: "ai", text });
const me = (text) => ({ role: "me", text });

// ── 轮数 ────────────────────────────────────────────────

test("只数我的回答，模型说了几句不算轮数", () => {
  const transcript = [ask("你为什么选 B？"), me("我觉得进度超前"), ask("哪个指标看出来的？")];
  assert.equal(countMyAnswers(transcript), 1);
  assert.equal(isFinished(transcript), false);
});

test("空白回答不算一轮", () => {
  const transcript = [ask("你为什么选 B？"), me("   ")];
  assert.equal(countMyAnswers(transcript), 0);
});

test("还没回答时，下一步是第一问", () => {
  const plan = planNextTurn([]);
  assert.equal(plan.phase, "ask");
  assert.equal(plan.round, 1);
  assert.equal(plan.lastChance, false);
});

test("答满上限后收尾，不再问", () => {
  const transcript = [
    ask("你为什么选 B？"),
    me("因为进度超前"),
    ask("进度超前是靠哪个指标判断的？"),
    me("看 SV 是负的"),
    ask("SV 是负的为什么等于超前？"),
    me("我记得负的就是不好"),
  ];
  assert.equal(countMyAnswers(transcript), MAX_PROBE_ROUNDS);
  assert.equal(isFinished(transcript), true);
  assert.deepEqual(planNextTurn(transcript), { phase: "verdict", round: 0, lastChance: false });
});

test("最后一问会被标成 lastChance，模型问完就该收尾", () => {
  // 我答了两轮 ⇒ 这是第 3 问，问完必须给结论
  const transcript = [ask("为什么选 B？"), me("因为超前"), ask("哪个指标？"), me("SV")];
  const plan = planNextTurn(transcript);
  assert.equal(plan.phase, "ask");
  assert.equal(plan.round, 3);
  assert.equal(plan.lastChance, true);
});

test("超过上限也不会再问（防 transcript 被外部改坏后卡在追问里）", () => {
  const transcript = [me("一"), me("二"), me("三"), me("四")];
  assert.equal(planNextTurn(transcript).phase, "verdict");
});

// ── 有效追问 ────────────────────────────────────────────

test("引用了我上一轮说过的词，算有效追问", () => {
  const transcript = [ask("你为什么选 B？"), me("我觉得进度超前，因为 SV 是负的")];
  const check = checkFollowUp("你说「SV 是负的」——负的为什么等于超前？", transcript);
  assert.equal(check.ok, true);
  // 取最长匹配：能引到「sv是负的」就不会只引「sv」
  assert.equal(check.quoted, "sv是负的");
});

test("泛泛的「再详细说说」不算追问", () => {
  const transcript = [ask("你为什么选 B？"), me("我觉得进度超前，因为 SV 是负的")];
  const check = checkFollowUp("能再详细说说你的思路吗？", transcript);
  assert.equal(check.ok, false);
  assert.equal(check.reason, "generic");
});

test("只问「为什么」不算追问", () => {
  const transcript = [ask("你为什么选 B？"), me("我觉得进度超前")];
  const check = checkFollowUp("为什么？", transcript);
  assert.equal(check.ok, false);
  assert.equal(check.reason, "too-short");
});

test("空问题不算追问", () => {
  const transcript = [ask("为什么选 B？"), me("因为超前")];
  assert.deepEqual(checkFollowUp("   ", transcript), { ok: false, reason: "empty" });
});

test("重复问同一个问题不算追问", () => {
  const transcript = [ask("你为什么选 B？"), me("因为进度超前"), ask("你为什么选 B？")];
  // 把问题再问一遍时，transcript 里已经有这一句了
  const check = checkFollowUp("你为什么选 B？", transcript);
  assert.equal(check.ok, false);
  assert.equal(check.reason, "repeated");
});

test("换个语序把上一句整个包进去，也算重复", () => {
  const transcript = [
    ask("你为什么会觉得进度是超前的？"),
    me("因为 SV 是负的"),
    ask("你为什么会觉得进度是超前的？"),
  ];
  const check = checkFollowUp("那你为什么会觉得进度是超前的呢？", transcript);
  assert.equal(check.ok, false);
  assert.equal(check.reason, "repeated");
});

test("只引用了「这个」「因为」这类填空词，不算引用", () => {
  // 「这个」在我回答里出现过，但它是任何句子都有的填空词
  assert.equal(findQuotedFragment("这个能再说清楚一点吗？", "因为这个指标是负的"), null);
});

test("第一次提问时没有「上一轮回答」可引用，只查空与长度", () => {
  // 第一问由 route 直接走 ask 相位，不走 checkFollowUp；
  // 这里确认它在没有上文时不会误判成「有效」
  const check = checkFollowUp("你为什么选 B？", []);
  assert.equal(check.ok, false);
  assert.equal(check.reason, "generic");
});

test("无效追问会给出对应的重问指令，四种原因不混", () => {
  const hints = ["empty", "too-short", "repeated", "generic"].map((reason) =>
    repairHint({ ok: false, reason }),
  );
  for (const hint of hints) assert.ok(hint.length > 10, "每条提示都要能指导模型具体怎么改");
  assert.equal(new Set(hints).size, 4);
});

// ── 结论校验 ────────────────────────────────────────────

test("结论缺「卡在哪」或「下一步」都不可用", () => {
  assert.equal(isUsableVerdict({ stuck: "", knowledgePointId: null, next: "做题" }), false);
  assert.equal(isUsableVerdict({ stuck: "把 SV 正负方向搞反了", knowledgePointId: null, next: "" }), false);
  assert.equal(
    isUsableVerdict({ stuck: "把 SV 正负方向搞反了", knowledgePointId: null, next: "重看挣值分析的定义" }),
    true,
  );
});

test("知识点选不到时允许为 null——不许硬编一个", () => {
  assert.equal(
    isUsableVerdict({ stuck: "把 SV 正负方向搞反了", knowledgePointId: null, next: "重看定义" }),
    true,
  );
});

// ── 工具函数 ────────────────────────────────────────────

test("比较前去掉标点空白并统一小写", () => {
  assert.equal(normalizeForCompare("SV 是 负的，对吧？"), "sv是负的对吧");
});

test("取最后一个模型问题，跳过我的回答", () => {
  const transcript = [ask("第一问"), me("答"), ask("第二问"), me("答2")];
  assert.equal(lastAiQuestion(transcript), "第二问");
  assert.equal(lastAiQuestion([]), null);
});

// ── 从库里读回上次追问 ──────────────────────────────────
// 这一组守的是「存下来要能看见」：只写不读的记录等于日志，
// 人打不开就看不到「我上次是怎么说的」。同时挡掉半截记录——只有对话没有结论、
// 或只有结论没有对话的，都不该被当成一次完整的追问展示出来。

test("正常的一次追问能读回对话与结论", () => {
  const previous = readStoredProbe({
    id: "p1",
    question_id: "Q1",
    transcript: [
      { role: "ai", text: "你为什么选 B？" },
      { role: "me", text: "因为 SV 是负的" },
    ],
    verdict: { stuck: "把 SV 的正负搞反了", knowledgePointId: "KP-0102", next: "重看挣值分析" },
    created_at: "2026-10-28T15:44:00Z",
  });

  assert.ok(previous);
  assert.equal(previous.transcript.length, 2);
  assert.equal(previous.verdict.stuck, "把 SV 的正负搞反了");
  assert.equal(previous.verdict.knowledgePointId, "KP-0102");
  assert.equal(previous.createdAt, "2026-10-28T15:44:00Z");
});

test("jsonb 里混进非法角色或空句子时丢掉，不崩", () => {
  const previous = readStoredProbe({
    id: "p1",
    question_id: "Q1",
    transcript: [
      { role: "ai", text: "问一句" },
      { role: "system", text: "越权内容" },
      { role: "me", text: "  " },
      { role: "me", text: "答一句" },
      null,
    ],
    verdict: { stuck: "卡住了", next: "做题" },
    created_at: "2026-10-28T15:44:00Z",
  });

  assert.equal(previous.transcript.length, 2);
});

test("结论里只有空格等于没有结论，返回 null", () => {
  assert.equal(
    readStoredProbe({
      id: "p1",
      question_id: "Q1",
      transcript: [],
      verdict: { stuck: "  ", next: " " },
      created_at: "2026-10-28T15:44:00Z",
    }),
    null,
  );
});

test("只有结论没有对话也能读回——结论本身就是有用的东西", () => {
  const previous = readStoredProbe({
    id: "p1",
    question_id: "Q1",
    transcript: [],
    verdict: { stuck: "卡住", next: "做题" },
    created_at: "2026-10-28T15:44:00Z",
  });
  assert.ok(previous);
  assert.deepEqual(previous.transcript, []);
  assert.equal(previous.verdict.stuck, "卡住");
});

test("只有对话没有结论也读回：那是一段被中断的追问，可以接着往下说", () => {
  const previous = readStoredProbe({
    id: "p1",
    question_id: "Q1",
    transcript: [{ role: "ai", text: "你为什么选 B？" }],
    verdict: {},
    created_at: "2026-10-28T15:44:00Z",
  });
  assert.ok(previous);
  assert.equal(previous.transcript.length, 1);
  assert.equal(previous.verdict, null);
});

test("没有记录时返回 null，抽屉照常从第一问开始", () => {
  assert.equal(readStoredProbe(undefined), null);
  assert.equal(readStoredProbe(null), null);
});

test("结论里的知识点不是字符串时退回 null，不把脏值带到界面上", () => {
  const previous = readStoredProbe({
    id: "p1",
    question_id: "Q1",
    transcript: [{ role: "ai", text: "问" }],
    verdict: { stuck: "卡住", next: "做题", knowledgePointId: 42 },
    created_at: "2026-10-28T15:44:00Z",
  });
  assert.equal(previous.verdict.knowledgePointId, null);
});
