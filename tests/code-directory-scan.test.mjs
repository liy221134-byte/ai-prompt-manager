import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { POST } from "../src/app/api/code-scan/route.ts";
import {
  CodeScanError,
  codeScanLimits,
  scanCodeDirectory,
} from "../src/lib/server/code-directory-scan.ts";

const ROUTE_URL = "http://localhost/api/code-scan";

function writeFile(root, relativePath, content) {
  const absolutePath = join(root, relativePath);

  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content, "utf8");
}

// 造一个像真实项目的小目录：依赖、构建产物、点目录和非源码文件都在里面
function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "code-scan-"));

  writeFile(
    root,
    "src/app/api/assets/route.ts",
    "export async function GET() {}\nexport async function POST() {}\n",
  );
  writeFile(
    root,
    "src/lib/util.ts",
    "// 注释里的 export function fake() {}\nexport function realOne() {}\n",
  );
  writeFile(root, "src/lib/huge.ts", `export const big = "${"x".repeat(500 * 1024)}";\n`);
  writeFile(root, "node_modules/pkg/index.ts", "export const dependency = 1;\n");
  writeFile(root, "dist/bundle.js", "export const built = 1;\n");
  writeFile(root, ".git/config", "[core]\n");
  writeFile(root, "next.config.ts", "export default {};\n");
  writeFile(root, "README.md", "# 不是源码文件\n");

  return root;
}

test("只收源码文件，依赖目录、构建产物和点目录都跳过", async () => {
  const root = createFixture();

  try {
    const files = await scanCodeDirectory({ directoryPath: root });
    const paths = files.map((file) => file.path);

    assert.deepEqual(paths, [
      "next.config.ts",
      "src/app/api/assets/route.ts",
      "src/lib/huge.ts",
      "src/lib/util.ts",
    ]);

    const route = files.find(
      (file) => file.path === "src/app/api/assets/route.ts",
    );
    assert.deepEqual(route.httpMethods, ["GET", "POST"]);

    const util = files.find((file) => file.path === "src/lib/util.ts");
    assert.deepEqual(util.exports, ["realOne"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("超过单文件上限的文件只进清单，不读导出", async () => {
  const root = createFixture();

  try {
    const files = await scanCodeDirectory({ directoryPath: root });
    const huge = files.find((file) => file.path === "src/lib/huge.ts");

    assert.ok(huge.byteSize > codeScanLimits.maxFileBytes);
    assert.deepEqual(huge.exports, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("路径不对时给中文提示，不写任何数据", async () => {
  await assert.rejects(
    () => scanCodeDirectory({ directoryPath: "" }),
    (error) => error instanceof CodeScanError && /请先填写/.test(error.message),
  );
  await assert.rejects(
    () => scanCodeDirectory({ directoryPath: "src" }),
    (error) =>
      error instanceof CodeScanError && /绝对路径/.test(error.message),
  );
  await assert.rejects(
    () => scanCodeDirectory({ directoryPath: join(tmpdir(), "not-exist-dir") }),
    (error) => error instanceof CodeScanError && /找不到这个目录/.test(error.message),
  );
});

test("给的是文件而不是目录时明确报错", async () => {
  const root = createFixture();

  try {
    await assert.rejects(
      () =>
        scanCodeDirectory({
          directoryPath: join(root, "next.config.ts"),
        }),
      (error) =>
        error instanceof CodeScanError && /不是目录/.test(error.message),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("扫描接口在本机模式返回文件清单，路径不对按 400 返回", async () => {
  const root = createFixture();
  const previous = {
    dataMode: process.env.NEXT_PUBLIC_DATA_MODE,
    vercel: process.env.VERCEL,
  };

  process.env.NEXT_PUBLIC_DATA_MODE = "local";
  delete process.env.VERCEL;

  try {
    const ok = await POST(
      new Request(ROUTE_URL, {
        method: "POST",
        body: JSON.stringify({ path: root }),
      }),
    );
    const okBody = await ok.json();

    assert.equal(ok.status, 200);
    assert.ok(okBody.files.length > 0);

    const bad = await POST(
      new Request(ROUTE_URL, {
        method: "POST",
        body: JSON.stringify({ path: "" }),
      }),
    );
    const badBody = await bad.json();

    assert.equal(bad.status, 400);
    assert.match(badBody.error, /请先填写/);
  } finally {
    if (previous.dataMode === undefined) {
      delete process.env.NEXT_PUBLIC_DATA_MODE;
    } else {
      process.env.NEXT_PUBLIC_DATA_MODE = previous.dataMode;
    }

    if (previous.vercel === undefined) {
      delete process.env.VERCEL;
    } else {
      process.env.VERCEL = previous.vercel;
    }

    rmSync(root, { recursive: true, force: true });
  }
});
