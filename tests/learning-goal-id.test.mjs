import assert from "node:assert/strict";
import { test } from "node:test";

import { goalId } from "../src/lib/learning/goal-id.ts";

// 这组测试守的是一件很窄的事：learning_goals.id 必须带上用户维度。
// 曾经写成 `goal-${topicId}`，单人用没问题，第二个人启用同一主题时撞主键，
// 而报错信息指向的是主键冲突，不是「你已经启用过」——排查时会被带偏。

test("同一个人的同一个主题，id 恒定不变（重复设主攻不会造新行）", () => {
  const first = goalId("user-a", "rk-mid-integration");
  const second = goalId("user-a", "rk-mid-integration");
  assert.equal(first, second);
});

test("不同用户启用同一主题，id 必须不同", () => {
  const a = goalId("user-a", "rk-mid-integration");
  const b = goalId("user-b", "rk-mid-integration");
  assert.notEqual(a, b);
});

test("同一用户的不同主题，id 必须不同", () => {
  const mid = goalId("user-a", "rk-mid-integration");
  const python = goalId("user-a", "python-basics");
  assert.notEqual(mid, python);
});

test("id 里带上人 + 主题两段，便于排查时直接看出归属", () => {
  assert.equal(goalId("u1", "t1"), "goal-u1-t1");
});
