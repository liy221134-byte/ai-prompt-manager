// 把上传进来的文件转成可分析的文本。
// Markdown 和纯文本直接解码；ZIP 按条目取出文本文档。

import { readZipTextEntries } from "./zip-reader.ts";
import { detectSourcePackageKind } from "./source-package-upload.ts";

export const SOURCE_PACKAGE_TEXT_LIMITS = {
  // 单个文件送进 AI 的字符上限
  perFileChars: 30000,
  // 一次识别所有文件合计的字符上限
  totalChars: 60000,
} as const;

export type SourcePackageTextDocument = {
  filename: string;
  text: string;
};

export function extractSourcePackageText(input: {
  filename: string;
  bytes: Uint8Array;
}): SourcePackageTextDocument[] {
  const kind = detectSourcePackageKind(input.filename);

  if (!kind) {
    throw new Error("只支持 Markdown、纯文本和 ZIP 文档包。");
  }

  if (kind === "zip") {
    const entries = readZipTextEntries(input.bytes);

    if (entries.length === 0) {
      throw new Error("这个文档包里没有可识别的 Markdown 或文本文件。");
    }

    return entries.map((entry) => ({
      filename: entry.name,
      text: decodeUtf8(entry.bytes),
    }));
  }

  return [{ filename: input.filename, text: decodeUtf8(input.bytes) }];
}

function decodeUtf8(bytes: Uint8Array) {
  // 去掉 BOM，避免正文开头多出看不见的字符
  return new TextDecoder("utf-8")
    .decode(bytes)
    .replace(/^\uFEFF/, "");
}

// 识别前统一裁剪超长内容，超限时明确告诉用户要分批
export function limitSourcePackageText(documents: SourcePackageTextDocument[]) {
  const limited: SourcePackageTextDocument[] = [];
  let total = 0;

  for (const document of documents) {
    if (document.text.length > SOURCE_PACKAGE_TEXT_LIMITS.perFileChars) {
      throw new Error(
        `${document.filename} 内容过长，请拆分后再上传（单个文件最多 ${
          SOURCE_PACKAGE_TEXT_LIMITS.perFileChars / 1000
        } 千字）。`,
      );
    }

    total += document.text.length;

    if (total > SOURCE_PACKAGE_TEXT_LIMITS.totalChars) {
      throw new Error("文档包内容总量过大，请分批上传。");
    }

    limited.push(document);
  }

  return limited;
}
