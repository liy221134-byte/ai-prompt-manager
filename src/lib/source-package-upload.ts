// 来源包上传的格式与大小校验。
// 本地和云端共用这一套规则，保证两种模式下「能传什么、传多大」完全一致。

export const SOURCE_PACKAGE_UPLOAD_LIMITS = {
  // 单个 ZIP 文档包上限，超出直接拒绝并提示分批
  zipBytes: 20 * 1024 * 1024,
  // 单个 Markdown 或纯文本文件上限
  textBytes: 5 * 1024 * 1024,
} as const;

export const sourcePackageExtensions = [
  ".md",
  ".markdown",
  ".txt",
  ".zip",
] as const;

export type SourcePackageFileKind = "markdown" | "text" | "zip";

export type SourcePackageValidation =
  | { ok: true; kind: SourcePackageFileKind; filename: string }
  | { ok: false; message: string };

function extensionOf(filename: string) {
  const lastDot = filename.lastIndexOf(".");

  if (lastDot < 0) {
    return "";
  }

  return filename.slice(lastDot).toLowerCase();
}

export function detectSourcePackageKind(
  filename: string,
): SourcePackageFileKind | null {
  const extension = extensionOf(filename);

  if (extension === ".md" || extension === ".markdown") {
    return "markdown";
  }

  if (extension === ".txt") {
    return "text";
  }

  if (extension === ".zip") {
    return "zip";
  }

  return null;
}

// 去掉目录部分和文件名里的危险字符，避免写出来源目录之外。
// Windows 保留名（CON、PRN 等）会被加上前缀，防止创建失败。
export function sanitizeSourcePackageFilename(filename: string): string {
  const base = filename.replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .replace(/^\.+/, "")
    .trim();

  if (!cleaned) {
    return "未命名文件";
  }

  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

  return reserved.test(cleaned) ? `_${cleaned}` : cleaned;
}

function looksLikeZip(head: Uint8Array | null | undefined) {
  if (!head || head.length < 4) {
    return true;
  }

  // PK\x03\x04 是常规压缩包，PK\x05\x06 是空压缩包
  return (
    (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) ||
    (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x05 && head[3] === 0x06)
  );
}

export function validateSourcePackageFile(input: {
  filename: string;
  byteSize: number;
  head?: Uint8Array | null;
}): SourcePackageValidation {
  const kind = detectSourcePackageKind(input.filename);

  if (!kind) {
    return {
      ok: false,
      message: "只支持 Markdown、纯文本和 ZIP 文档包。",
    };
  }

  if (input.byteSize <= 0) {
    return { ok: false, message: "文件是空的，请换一个文件。" };
  }

  if (kind === "zip") {
    if (input.byteSize > SOURCE_PACKAGE_UPLOAD_LIMITS.zipBytes) {
      return { ok: false, message: "ZIP 包超过 20 MB 上限，请拆分后再上传。" };
    }

    if (!looksLikeZip(input.head)) {
      return { ok: false, message: "这个文件不是有效的 ZIP 包。" };
    }
  } else if (input.byteSize > SOURCE_PACKAGE_UPLOAD_LIMITS.textBytes) {
    return { ok: false, message: "文本文件超过 5 MB 上限，请拆分后再上传。" };
  }

  return { ok: true, kind, filename: sanitizeSourcePackageFilename(input.filename) };
}
