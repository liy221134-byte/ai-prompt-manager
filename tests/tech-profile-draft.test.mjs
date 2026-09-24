import assert from "node:assert/strict";
import test from "node:test";

import { draftStackFromPackageJson } from "../src/lib/tech-profile-draft.ts";

test("从 package.json 认出认识的技术栈，版本号去掉符号", () => {
  const stack = draftStackFromPackageJson(
    JSON.stringify({
      engines: { node: "24.x" },
      dependencies: {
        next: "16.3.5",
        react: "^19.2.8",
        "@supabase/supabase-js": "^2.116.0",
        lodash: "^4.17.21",
      },
      devDependencies: { typescript: "^5", tailwindcss: "^4" },
    }),
  );

  assert.deepEqual(stack, [
    { name: "Node.js", version: "24.x" },
    { name: "Next.js", version: "16.3.5" },
    { name: "React", version: "19.2.8" },
    { name: "TypeScript", version: "5" },
    { name: "Tailwind CSS", version: "4" },
    { name: "Supabase", version: "2.116.0" },
  ]);
});

test("不认识的依赖不猜，空项目返回空技术栈", () => {
  assert.deepEqual(
    draftStackFromPackageJson(JSON.stringify({ dependencies: { lodash: "4" } })),
    [],
  );
});

test("不是 package.json 时给出明确报错", () => {
  assert.throws(
    () => draftStackFromPackageJson("这不是 JSON"),
    /不是有效的 package.json/,
  );
});
