import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCodeModuleDrafts,
  extractCodeExports,
  extractHttpMethods,
  readRoutePath,
} from "../src/lib/code-module-scan.ts";

test("导出符号从声明、导出列表和默认导出里读出来，注释里的不算", () => {
  const exports = extractCodeExports(`
// export function 这是注释里的，不算
/* export const 注释块里的，也不算 */
export const assetTypeLabels = {};
export async function listProjectGraphNodes() {}
export class GraphNode {}
export type GraphNodeType = string;
export interface Options {}
export { helper as analyzeNodeImpact, internal };
export default function page() {}
const url = "https://example.com/export";
`);

  assert.deepEqual(exports, [
    "analyzeNodeImpact",
    "assetTypeLabels",
    "default",
    "GraphNode",
    "GraphNodeType",
    "internal",
    "listProjectGraphNodes",
    "Options",
  ]);
});

test("路由文件里导出的 HTTP 方法按固定顺序读出来", () => {
  const methods = extractHttpMethods(`
export async function POST() {}
export async function GET() {}
export const dynamic = "force-dynamic";
`);

  assert.deepEqual(methods, ["GET", "POST"]);
});

test("只认 API 路由文件，页面文件不建接口节点", () => {
  assert.equal(
    readRoutePath("src/app/api/assets/[id]/versions/route.ts"),
    "/api/assets/[id]/versions",
  );
  assert.equal(readRoutePath("src/app/api/route.ts"), "/api");
  assert.equal(
    readRoutePath("src/app/(marketing)/api/leads/route.ts"),
    "/api/leads",
  );
  assert.equal(readRoutePath("src/app/page.tsx"), null);
  assert.equal(readRoutePath("src/app/dashboard/route.ts"), null);
});

test("目录按层级组模块树，编号是 MOD-相对路径", () => {
  const drafts = buildCodeModuleDrafts([
    { path: "proxy.ts", byteSize: 10, exports: [], httpMethods: [] },
    {
      path: "src/lib/graph-node.ts",
      byteSize: 10,
      exports: ["buildGraphTree", "analyzeNodeImpact"],
      httpMethods: [],
    },
    {
      path: "src/lib/server/prompt-database.ts",
      byteSize: 10,
      exports: ["getPromptDatabase"],
      httpMethods: [],
    },
  ]);
  const byCode = new Map(drafts.map((draft) => [draft.code, draft]));

  assert.deepEqual(
    drafts.map((draft) => draft.code),
    ["MOD-root", "MOD-src/lib", "MOD-src/lib/server"],
  );
  assert.equal(byCode.get("MOD-root").parentCode, null);
  assert.equal(byCode.get("MOD-src/lib").parentCode, "MOD-root");
  assert.equal(
    byCode.get("MOD-src/lib/server").parentCode,
    "MOD-src/lib",
  );
  assert.equal(byCode.get("MOD-root").title, "根目录");
  assert.equal(byCode.get("MOD-src/lib").summary, "1 个文件");
  assert.match(
    byCode.get("MOD-src/lib").content,
    /`graph-node\.ts`：analyzeNodeImpact、buildGraphTree/,
  );
  assert.match(byCode.get("MOD-root").content, /没有具名导出/);
});

test("接口节点按路径前缀组树，正文列出支持的方法", () => {
  const drafts = buildCodeModuleDrafts(
    [
      {
        path: "src/app/api/assets/route.ts",
        byteSize: 10,
        exports: ["GET", "POST"],
        httpMethods: ["GET", "POST"],
      },
      {
        path: "src/app/api/assets/[id]/versions/route.ts",
        byteSize: 10,
        exports: ["GET"],
        httpMethods: ["GET"],
      },
      {
        path: "src/app/api/health/db/route.ts",
        byteSize: 10,
        exports: ["dynamic"],
        httpMethods: [],
      },
    ],
    { sourceLabel: "E:/codeX项目" },
  );
  const interfaces = drafts.filter((draft) => draft.nodeType === "interface");
  const byCode = new Map(interfaces.map((draft) => [draft.code, draft]));

  assert.deepEqual(
    interfaces.map((draft) => draft.code),
    ["API-/api/assets", "API-/api/assets/[id]/versions"],
    "没有导出方法的路由文件不建接口节点",
  );
  assert.equal(
    byCode.get("API-/api/assets/[id]/versions").parentCode,
    "API-/api/assets",
  );
  assert.equal(
    byCode.get("API-/api/assets").summary,
    "GET、POST",
  );
  assert.match(
    byCode.get("API-/api/assets").content,
    /支持的方法：GET、POST/,
  );
  assert.equal(byCode.get("API-/api/assets").note, "扫描目录：E:/codeX项目");
});

test("同一批里模块和接口互不干扰，各自只挂同类型的父节点", () => {
  const drafts = buildCodeModuleDrafts([]);

  assert.deepEqual(drafts, []);
});
