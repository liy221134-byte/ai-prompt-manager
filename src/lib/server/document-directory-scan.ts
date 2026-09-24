// 本机文档目录扫描：只读目录，把 .md / .markdown / .txt 的内容读出来，
// 交给界面原样建成文档资产。只在本机模式的路由里调用。
// 和代码目录扫描是一对：一个扫代码出节点，一个扫文档出资产。

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { DOCUMENT_IMPORT_LIMITS } from "../document-import.ts";
import { ignoredDirectoryNames } from "../code-module-scan.ts";

export const documentScanLimits = {
  maxFiles: DOCUMENT_IMPORT_LIMITS.filesPerBatch,
  maxFileBytes: DOCUMENT_IMPORT_LIMITS.bytesPerFile,
  maxDepth: 8,
} as const;

export const documentScanExtensions = [".md", ".markdown", ".txt"] as const;

const ignoredDirectoryNameSet = new Set<string>(ignoredDirectoryNames);

export class DocumentScanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentScanError";
  }
}

export type ScannedDocumentFile = {
  fileName: string;
  relativePath: string;
  content: string;
  byteSize: number;
};

function isDocumentFile(name: string) {
  const lower = name.toLowerCase();

  return documentScanExtensions.some((extension) => lower.endsWith(extension));
}

function shouldIgnoreDirectory(name: string) {
  // 点开头的目录一律跳过（.git/.next/.venv…），依赖目录也跳过
  return name.startsWith(".") || ignoredDirectoryNameSet.has(name);
}

export async function scanDocumentDirectory(input: {
  directoryPath: string;
}): Promise<ScannedDocumentFile[]> {
  const requested = input.directoryPath.trim();

  if (!requested) {
    throw new DocumentScanError("请先填写要扫描的目录。");
  }

  if (!path.isAbsolute(requested)) {
    throw new DocumentScanError("请填写目录的绝对路径，例如 E:\\codeX项目\\docs。");
  }

  const root = path.resolve(requested);
  const rootStat = await stat(root).catch(() => null);

  if (!rootStat) {
    throw new DocumentScanError("找不到这个目录，检查路径是否正确。");
  }

  if (!rootStat.isDirectory()) {
    throw new DocumentScanError("这个路径不是目录。");
  }

  const files: ScannedDocumentFile[] = [];
  const skipped: string[] = [];

  async function walk(directory: string, depth: number) {
    if (depth > documentScanLimits.maxDepth) {
      return;
    }

    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      if (files.length >= documentScanLimits.maxFiles) {
        return;
      }

      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        if (!shouldIgnoreDirectory(entry.name)) {
          await walk(fullPath, depth + 1);
        }

        continue;
      }

      if (!entry.isFile() || !isDocumentFile(entry.name)) {
        continue;
      }

      const fileStat = await stat(fullPath).catch(() => null);

      if (!fileStat) {
        continue;
      }

      if (fileStat.size > documentScanLimits.maxFileBytes) {
        skipped.push(entry.name);
        continue;
      }

      files.push({
        fileName: entry.name,
        relativePath: path.relative(root, fullPath).replace(/\\/g, "/"),
        content: await readFile(fullPath, "utf8"),
        byteSize: fileStat.size,
      });
    }
  }

  await walk(root, 0);

  return files.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath, "en"),
  );
}
