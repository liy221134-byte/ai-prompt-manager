import assert from "node:assert/strict";
import test from "node:test";

import { createMergeVersion } from "../src/lib/prompt-merge-draft.ts";

const target = {
  id: "prompt-a",
  title: "提示词 A",
  category: "AI效能",
  tags: ["测试"],
  content: "请处理 {{内容}}",
  useCase: "测试合并。",
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
  deletedAt: null,
  deletedReason: null,
  mergedIntoPromptId: null,
};

test("合并恢复快照保留目标、来源和 30 天过期时间", () => {
  const version = createMergeVersion({
    target,
    sourcePromptIds: ["prompt-a", "prompt-b"],
    createdAt: "2026-09-20T01:00:00.000Z",
  });

  assert.match(version.versionId, /^version-/);
  assert.equal(version.promptId, "prompt-a");
  assert.deepEqual(version.sourcePromptIds, ["prompt-a", "prompt-b"]);
  assert.equal(version.expiresAt, "2026-10-20T01:00:00.000Z");
});
