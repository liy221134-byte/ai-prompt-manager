import assert from "node:assert/strict";
import test from "node:test";

import { buildTechProfilePrompt } from "../src/lib/tech-profile-prompt.ts";

test("提示词带上项目名、项目说明和已有技术栈", () => {
  const prompt = buildTechProfilePrompt({
    projectName: "科创平台2.0",
    projectGoal: "把数据打通，支持模型训练。",
    stack: [
      { name: "Node.js", version: "24.x" },
      { name: "Supabase" },
    ],
  });

  assert.match(prompt, /科创平台2\.0/);
  assert.match(prompt, /把数据打通，支持模型训练。/);
  assert.match(prompt, /- Node\.js：24\.x/);
  assert.match(prompt, /- Supabase/);
  assert.match(prompt, /一次问完/);
  assert.match(prompt, /不要编版本号/);
});

test("没写项目说明、没有技术栈时也给得出可用的提示词", () => {
  const prompt = buildTechProfilePrompt({
    projectName: "",
    projectGoal: "   ",
    stack: [],
  });

  assert.match(prompt, /未命名项目/);
  assert.match(prompt, /还没写/);
  assert.match(prompt, /还没有记任何技术栈/);
});

test("技术栈里的空行会被丢掉", () => {
  const prompt = buildTechProfilePrompt({
    projectName: "示例",
    projectGoal: "说明",
    stack: [{ name: "  " }, { name: "React", version: "19" }],
  });

  assert.match(prompt, /- React：19/);
  assert.equal(prompt.includes("- ："), false);
});
