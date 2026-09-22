// 来源包原文的本地存储：落在项目数据目录的 sources 子目录下，
// 资产里只记录相对路径，二进制不写进资产正文。

import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

export const SOURCE_PACKAGE_DIR_NAME = "source-packages";

export function createSourcePackageUploadId() {
  return `upload-${randomUUID()}`;
}

export function resolveSourcePackageRoot(dataRootDir: string) {
  return join(dataRootDir, SOURCE_PACKAGE_DIR_NAME);
}

// 相对路径固定用 / 分隔，避免换平台后读不回文件
export function createSourcePackageRelativePath(
  uploadId: string,
  filename: string,
) {
  return `${SOURCE_PACKAGE_DIR_NAME}/${uploadId}/${filename}`;
}

// 只允许读写来源目录内部，挡住 ../ 这类越界路径
function resolveInsideRoot(dataRootDir: string, relativePath: string) {
  const root = resolve(resolveSourcePackageRoot(dataRootDir));
  const target = resolve(dataRootDir, relativePath);

  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error("来源包路径越界。");
  }

  return target;
}

export async function saveSourcePackageUpload(input: {
  dataRootDir: string;
  uploadId: string;
  filename: string;
  bytes: Uint8Array;
}) {
  const relativePath = createSourcePackageRelativePath(
    input.uploadId,
    input.filename,
  );
  const target = resolveInsideRoot(input.dataRootDir, relativePath);

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, input.bytes);

  return { relativePath, byteSize: input.bytes.byteLength };
}

export async function readSourcePackageUpload(
  dataRootDir: string,
  relativePath: string,
) {
  return readFile(resolveInsideRoot(dataRootDir, relativePath));
}

export async function removeSourcePackageUpload(
  dataRootDir: string,
  uploadId: string,
) {
  const target = resolveInsideRoot(
    dataRootDir,
    `${SOURCE_PACKAGE_DIR_NAME}/${uploadId}`,
  );

  await rm(target, { recursive: true, force: true });
}

// 列出还没被确认引用的上传目录，供清理未确认上传时使用
export async function listSourcePackageUploadIds(dataRootDir: string) {
  try {
    const entries = await readdir(resolveSourcePackageRoot(dataRootDir), {
      withFileTypes: true,
    });

    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}
