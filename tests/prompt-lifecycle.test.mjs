import assert from "node:assert/strict";
import test from "node:test";

import {
  getRemainingTrashDays,
  getTrashExpiresAt,
  isTrashExpired,
} from "../src/lib/prompt-lifecycle.ts";

test("垃圾箱过期时间固定为删除时间后 30 天", () => {
  assert.equal(
    getTrashExpiresAt("2026-09-01T00:00:00.000Z"),
    "2026-10-01T00:00:00.000Z",
  );
});

test("剩余保留天数向上取整", () => {
  assert.equal(
    getRemainingTrashDays(
      "2026-09-01T00:00:00.000Z",
      new Date("2026-09-30T12:00:00.000Z"),
    ),
    1,
  );
});

test("达到过期时间后判定为过期", () => {
  assert.equal(
    isTrashExpired(
      "2026-09-01T00:00:00.000Z",
      new Date("2026-10-01T00:00:00.000Z"),
    ),
    true,
  );
});
