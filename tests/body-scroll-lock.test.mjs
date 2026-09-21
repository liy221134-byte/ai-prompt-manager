import assert from "node:assert/strict";
import test from "node:test";

import { createBodyScrollLock } from "../src/lib/body-scroll-lock.ts";

function createTarget() {
  return { style: { overflow: "" } };
}

test("锁定后禁止滚动，解锁后恢复", () => {
  const target = createTarget();
  const lock = createBodyScrollLock(target);

  lock.lock();
  assert.equal(target.style.overflow, "hidden");

  lock.unlock();
  assert.equal(target.style.overflow, "");
});

test("嵌套弹窗依次关闭后恢复滚动", () => {
  const target = createTarget();
  const lock = createBodyScrollLock(target);

  lock.lock();
  lock.lock();
  lock.unlock();
  assert.equal(target.style.overflow, "hidden");

  lock.unlock();
  assert.equal(target.style.overflow, "");
});

test("反复重入后关闭仍然恢复滚动", () => {
  const target = createTarget();
  const lock = createBodyScrollLock(target);

  for (let index = 0; index < 5; index += 1) {
    lock.lock();
    lock.unlock();
  }

  assert.equal(target.style.overflow, "");
});

test("多余的解锁不会破坏状态", () => {
  const target = createTarget();
  const lock = createBodyScrollLock(target);

  lock.lock();
  lock.lock();
  lock.unlock();
  lock.unlock();
  lock.unlock();

  assert.equal(target.style.overflow, "");
});

test("原来已经有其他滚动设置时按原值恢复", () => {
  const target = { style: { overflow: "auto" } };
  const lock = createBodyScrollLock(target);

  lock.lock();
  assert.equal(target.style.overflow, "hidden");

  lock.unlock();
  assert.equal(target.style.overflow, "auto");
});