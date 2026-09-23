// 代码目录分析：把文件清单变成「模块」和「接口」节点草稿。
// 读目录在 server/code-directory-scan.ts 里，这里只做纯逻辑，方便测试。
// 只按目录和路由文件归类，不解析 import 关系，也不判断代码好坏。

import {
  createGraphImportAssetId,
  type GraphNodeImportDraft,
} from "./graph-import.ts";

export type CodeFileInfo = {
  // 相对扫描目录的路径，统一用 /
  path: string;
  byteSize: number;
  exports: string[];
  // 路由文件里导出的 HTTP 方法
  httpMethods: string[];
};

export const httpMethodNames = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;

// 扫描时忽略的目录：依赖、构建产物和工具目录都不进模块树
export const ignoredDirectoryNames = [
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  "vendor",
  "__snapshots__",
] as const;

const declarationExportPattern =
  /export\s+(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
const listExportPattern = /export\s*(?:type\s*)?\{([^}]*)\}/g;
const defaultExportPattern = /export\s+default\b/;

// 注释里的 export 不算数；`//` 只在行首或空白后当成注释，
// 免得把字符串里的 https:// 截断。
function stripCodeComments(content: string) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|\s)\/\/[^\n]*/gm, "$1");
}

export function extractCodeExports(content: string) {
  const source = stripCodeComments(content);
  const names = new Set<string>();

  for (const match of source.matchAll(declarationExportPattern)) {
    names.add(match[1]);
  }

  for (const match of source.matchAll(listExportPattern)) {
    for (const item of match[1].split(",")) {
      // export { foo as bar } 对外暴露的名字是 bar
      const parts = item.trim().split(/\s+as\s+/);
      const name = (parts[parts.length - 1] ?? "").trim();

      if (/^[A-Za-z_$][\w$]*$/.test(name)) {
        names.add(name);
      }
    }
  }

  if (defaultExportPattern.test(source)) {
    names.add("default");
  }

  return [...names].sort((left, right) => left.localeCompare(right, "en"));
}

export function extractHttpMethods(content: string) {
  const exported = extractCodeExports(content);

  return httpMethodNames.filter((method) => exported.includes(method));
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\.?\//, "").replace(/\/+$/, "");
}

function directoryOf(path: string) {
  const index = path.lastIndexOf("/");

  return index < 0 ? "" : path.slice(0, index);
}

const routeFilePattern = /(?:^|\/)route\.(?:ts|tsx|js|jsx|mjs|cjs)$/i;

// 路由文件 → 接口路径；Next.js 的分组目录 (group) 不进路径
export function readRoutePath(path: string) {
  if (!routeFilePattern.test(path)) {
    return null;
  }

  const segments = normalizePath(path).split("/").filter(Boolean);
  segments.pop();

  const appIndex = segments.indexOf("app");
  const start = appIndex >= 0 ? appIndex + 1 : segments.indexOf("api");

  if (start < 0) {
    return null;
  }

  const visible = segments
    .slice(start)
    .filter((segment) => !/^\(.+\)$/.test(segment));

  // 只认 API 路由，页面文件不建接口节点
  if (visible.length === 0 || !visible.includes("api")) {
    return null;
  }

  return `/${visible.join("/")}`;
}

// 往上一层一层找最近的父节点；同类型才允许组树
function findParentCode(
  segments: string[],
  codeByPath: Map<string, string>,
  separator: string,
) {
  // 一直找到空路径为止：模块树里空路径就是根目录节点
  for (let end = segments.length - 1; end >= 0; end -= 1) {
    const parent = codeByPath.get(segments.slice(0, end).join(separator));

    if (parent) {
      return parent;
    }
  }

  return null;
}

function buildModuleContent(files: CodeFileInfo[]) {
  const lines = [`扫描到的文件（${files.length} 个）：`, ""];

  for (const file of files) {
    const name = file.path.split("/").pop() ?? file.path;
    // 导出清单排序后再截断，同一份代码重复扫描得到的正文一致
    const exported = [...file.exports].sort((left, right) =>
      left.localeCompare(right, "en"),
    );

    if (exported.length === 0) {
      lines.push(`- \`${name}\`：没有具名导出`);
      continue;
    }

    const shown = exported.slice(0, 6).join("、");
    const rest = exported.length - 6;
    lines.push(
      `- \`${name}\`：${shown}${rest > 0 ? ` 等 ${exported.length} 个` : ""}`,
    );
  }

  return lines.join("\n");
}

function buildInterfaceContent(file: CodeFileInfo) {
  return [
    `路由文件：\`${file.path}\``,
    "",
    `支持的方法：${file.httpMethods.join("、")}`,
  ].join("\n");
}

export function buildCodeModuleDrafts(
  files: CodeFileInfo[],
  options: { sourceLabel?: string } = {},
): GraphNodeImportDraft[] {
  const sourceLabel = options.sourceLabel?.trim() ?? "";
  const normalized = files
    .map((file) => ({ ...file, path: normalizePath(file.path) }))
    .filter((file) => file.path);
  const filesByDirectory = new Map<string, CodeFileInfo[]>();

  for (const file of normalized) {
    const directory = directoryOf(file.path);
    filesByDirectory.set(directory, [
      ...(filesByDirectory.get(directory) ?? []),
      file,
    ]);
  }

  const directories = [...filesByDirectory.keys()].sort((left, right) =>
    left.localeCompare(right, "en"),
  );
  const moduleCodeByDirectory = new Map(
    directories.map((directory) => [
      directory,
      `MOD-${directory || "root"}`,
    ]),
  );
  const drafts: GraphNodeImportDraft[] = directories.map((directory) => {
    const directoryFiles = [...(filesByDirectory.get(directory) ?? [])].sort(
      (left, right) => left.path.localeCompare(right.path, "en"),
    );

    return {
      id: createGraphImportAssetId(),
      nodeType: "module",
      code: moduleCodeByDirectory.get(directory) ?? `MOD-${directory}`,
      title: directory || "根目录",
      summary: `${directoryFiles.length} 个文件`,
      content: buildModuleContent(directoryFiles),
      note: sourceLabel ? `扫描目录：${sourceLabel}` : "",
      sourceLabel,
      parentCode: findParentCode(
        directory.split("/").filter(Boolean),
        moduleCodeByDirectory,
        "/",
      ),
      relations: [],
    };
  });

  const routeFiles = normalized
    .map((file) => ({ file, routePath: readRoutePath(file.path) }))
    .filter(
      (
        entry,
      ): entry is { file: CodeFileInfo; routePath: string } =>
        Boolean(entry.routePath) && entry.file.httpMethods.length > 0,
    )
    .sort((left, right) => left.routePath.localeCompare(right.routePath, "en"));
  // 父节点查表按去掉开头斜杠的路径存，和 split("/") 出来的片段对齐
  const interfaceCodeByPath = new Map(
    routeFiles.map((entry) => [
      entry.routePath.replace(/^\//, ""),
      `API-${entry.routePath}`,
    ]),
  );

  for (const { file, routePath } of routeFiles) {
    drafts.push({
      id: createGraphImportAssetId(),
      nodeType: "interface",
      code: `API-${routePath}`,
      title: routePath,
      summary: file.httpMethods.join("、"),
      content: buildInterfaceContent(file),
      note: sourceLabel ? `扫描目录：${sourceLabel}` : "",
      sourceLabel,
      parentCode: findParentCode(
        routePath.replace(/^\//, "").split("/").filter(Boolean),
        interfaceCodeByPath,
        "/",
      ),
      relations: [],
    });
  }

  return drafts;
}
