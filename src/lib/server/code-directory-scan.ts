// 本机代码目录扫描：只读目录，跳过依赖和构建产物，返回可分析的源码清单。
// 只在本机模式的路由里调用，云端没有本机目录可读。

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  extractCodeExports,
  extractHttpMethods,
  ignoredDirectoryNames,
  type CodeFileInfo,
} from "../code-module-scan.ts";

// 扫描是只读的，但要防止手一抖写了个盘符根目录：文件数、单文件体积和层数都有上限
export const codeScanLimits = {
  maxFiles: 3000,
  maxFileBytes: 400 * 1024,
  maxDepth: 12,
} as const;

export const codeScanExtensions = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
] as const;

const ignoredDirectoryNameSet = new Set<string>(ignoredDirectoryNames);

// 用专门的错误类型区分「路径不对」和「服务出错」，接口按 400 返回给用户
export class CodeScanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodeScanError";
  }
}

function isCodeFile(name: string) {
  const lower = name.toLowerCase();

  return codeScanExtensions.some((extension) => lower.endsWith(extension));
}

// 依赖、构建产物、工具目录和所有点开头的目录都不进模块树
function shouldIgnoreDirectory(name: string) {
  return name.startsWith(".") || ignoredDirectoryNameSet.has(name);
}

export async function scanCodeDirectory(input: {
  directoryPath: string;
}): Promise<CodeFileInfo[]> {
  const requested = input.directoryPath.trim();

  if (!requested) {
    throw new CodeScanError("请先填写要扫描的目录。");
  }

  if (!path.isAbsolute(requested)) {
    throw new CodeScanError(
      "请填写目录的绝对路径，例如 E:\\codeX项目。",
    );
  }

  const root = path.resolve(requested);
  const rootStat = await stat(root).catch(() => null);

  if (!rootStat) {
    throw new CodeScanError("找不到这个目录，检查路径是否正确。");
  }

  if (!rootStat.isDirectory()) {
    throw new CodeScanError("这个路径不是目录。");
  }

  const found: Array<{
    absolutePath: string;
    relativePath: string;
    byteSize: number;
  }> = [];
  const pending: Array<{
    absolutePath: string;
    relativePath: string;
    depth: number;
  }> = [{ absolutePath: root, relativePath: "", depth: 0 }];

  while (pending.length > 0) {
    const current = pending.pop()!;
    // 读不了的目录直接跳过，不让一个权限问题中断整次扫描
    const entries = await readdir(current.absolutePath, {
      withFileTypes: true,
    }).catch(() => []);

    for (const entry of entries) {
      // 符号链接一律不跟，避免绕成环或扫到给定目录之外
      if (entry.isSymbolicLink()) {
        continue;
      }

      const relativePath = current.relativePath
        ? `${current.relativePath}/${entry.name}`
        : entry.name;

      if (entry.isDirectory()) {
        if (
          shouldIgnoreDirectory(entry.name) ||
          current.depth + 1 > codeScanLimits.maxDepth
        ) {
          continue;
        }

        pending.push({
          absolutePath: path.join(current.absolutePath, entry.name),
          relativePath,
          depth: current.depth + 1,
        });
        continue;
      }

      if (!entry.isFile() || !isCodeFile(entry.name)) {
        continue;
      }

      if (found.length >= codeScanLimits.maxFiles) {
        throw new CodeScanError(
          `这个目录里的源码文件超过 ${codeScanLimits.maxFiles} 个，请改成扫描某个子目录。`,
        );
      }

      const absolutePath = path.join(current.absolutePath, entry.name);
      const fileStat = await stat(absolutePath).catch(() => null);

      if (!fileStat) {
        continue;
      }

      found.push({
        absolutePath,
        relativePath,
        byteSize: fileStat.size,
      });
    }
  }

  const files: CodeFileInfo[] = [];

  for (const file of found) {
    // 超大的文件只进清单不读内容，避免把内存吃满
    const content =
      file.byteSize <= codeScanLimits.maxFileBytes
        ? await readFile(file.absolutePath, "utf8").catch(() => "")
        : "";

    files.push({
      path: file.relativePath,
      byteSize: file.byteSize,
      exports: content ? extractCodeExports(content) : [],
      httpMethods: content ? extractHttpMethods(content) : [],
    });
  }

  return files.sort((left, right) => left.path.localeCompare(right.path, "en"));
}
