// 保底考试解析。
//
// 这组测试守的不是「字段能不能读出来」，而是**读不出来时不许编**：
//   · 没有考试名的 jsonb 整条作废，不显示「保底：未命名」；
//   · 日期格式不对当作未定，不硬塞进倒计时；
//   · 2027 年下半年那场的官方日期还没发布，所以允许 date 为 null，
//     界面只显示「报名约 X」，不显示假的「距考试还有 N 天」。
//
// 这三条如果破了，界面上会出现一个看起来正常、实际是编的数字——
// 那比不显示更糟，因为人会照着它安排时间。

import assert from "node:assert/strict";
import test from "node:test";

import { describeFallbackExam, parseFallbackExam } from "../src/lib/learning/fallback.ts";

test("完整的保底对象按四个字段解析出来", () => {
  const parsed = parseFallbackExam({
    exam: "系统集成项目管理工程师（中级）",
    date: "2027-10-24",
    registration: "2027-08 中旬",
    note: "5 月高项未过则转此场",
  });

  assert.deepEqual(parsed, {
    exam: "系统集成项目管理工程师（中级）",
    date: "2027-10-24",
    registration: "2027-08 中旬",
    note: "5 月高项未过则转此场",
  });
});

test("没有 exam 的整条视为无效，不显示占位名", () => {
  assert.equal(parseFallbackExam({ date: "2027-10-24" }), null);
  assert.equal(parseFallbackExam({ exam: "   " }), null);
  assert.equal(parseFallbackExam({ exam: 123 }), null);
});

test("null、undefined、数组都当没有保底", () => {
  assert.equal(parseFallbackExam(null), null);
  assert.equal(parseFallbackExam(undefined), null);
  assert.equal(parseFallbackExam([]), null);
  // 误把主题包里 milestones 的结构抄过来时就是这个形状：库里被 CHECK 拦着，
  // 但解析层也要兜住，不能因为绕过 CHECK 的写入（比如手工 SQL）让整页崩掉
  assert.equal(parseFallbackExam([{ name: "报名", date: "2027-08-15" }]), null);
});

test("日期格式不对当作未定，但考试名保留", () => {
  const parsed = parseFallbackExam({ exam: "中项", date: "2027/10/24" });

  assert.equal(parsed?.exam, "中项");
  assert.equal(parsed?.date, null);
});

test("官方日期未发布时 date 就是 null，不编一个", () => {
  const parsed = parseFallbackExam({ exam: "中项", registration: "2027-08 中旬" });

  assert.equal(parsed?.date, null);
  assert.equal(parsed?.registration, "2027-08 中旬");
});

test("空字符串字段统一收敛成 null，不留下空串", () => {
  const parsed = parseFallbackExam({ exam: "中项", date: "", registration: "  ", note: "" });

  assert.deepEqual(parsed, { exam: "中项", date: null, registration: null, note: null });
});

test("描述行只拼已知信息，不出现空的连接符", () => {
  assert.equal(
    describeFallbackExam({ exam: "中项", date: null, registration: "2027-08 中旬", note: null }),
    "中项 · 报名约 2027-08 中旬",
  );

  assert.equal(
    describeFallbackExam({ exam: "中项", date: null, registration: null, note: null }),
    "中项",
  );
});
