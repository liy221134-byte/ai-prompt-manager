// 极简 ZIP 读取器：只做文档包需要的事——按中央目录列出条目并解压。
// 支持 stored（不压缩）和 deflate 两种方式；刻意不引入第三方库。

import { inflateRawSync } from "node:zlib";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;

export const ZIP_READ_LIMITS = {
  // 单个文档包最多认这么多条目，防止异常包拖垮内存
  maxEntries: 500,
  // 单个条目解压后上限
  maxEntryBytes: 5 * 1024 * 1024,
  // 所有条目解压后合计上限
  maxTotalBytes: 40 * 1024 * 1024,
} as const;

export type ZipEntry = {
  name: string;
  bytes: Uint8Array;
};

function readUInt16(view: DataView, offset: number) {
  return view.getUint16(offset, true);
}

function readUInt32(view: DataView, offset: number) {
  return view.getUint32(offset, true);
}

// 从尾部往前找中央目录结束记录，注释最长 65535 字节
function findEndOfCentralDirectory(view: DataView) {
  const earliest = Math.max(0, view.byteLength - 65557);

  for (let offset = view.byteLength - 22; offset >= earliest; offset -= 1) {
    if (readUInt32(view, offset) === EOCD_SIGNATURE) {
      return offset;
    }
  }

  throw new Error("这个文件不是有效的 ZIP 包。");
}

export function readZipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view);

  const totalEntries = readUInt16(view, eocd + 10);
  const directorySize = readUInt32(view, eocd + 12);
  const directoryOffset = readUInt32(view, eocd + 16);

  if (totalEntries === 0xffff || directoryOffset === 0xffffffff || directorySize === 0xffffffff) {
    throw new Error("暂不支持 64 位 ZIP 文档包。");
  }

  const locatorOffset = eocd - 20;

  if (
    locatorOffset >= 0 &&
    readUInt32(view, locatorOffset) === ZIP64_LOCATOR_SIGNATURE
  ) {
    throw new Error("暂不支持 64 位 ZIP 文档包。");
  }

  if (totalEntries > ZIP_READ_LIMITS.maxEntries) {
    throw new Error(`文档包里的文件太多，最多支持 ${ZIP_READ_LIMITS.maxEntries} 个。`);
  }

  const entries: ZipEntry[] = [];
  let cursor = directoryOffset;
  let totalBytes = 0;

  for (let index = 0; index < totalEntries; index += 1) {
    if (readUInt32(view, cursor) !== CENTRAL_SIGNATURE) {
      throw new Error("ZIP 中央目录已损坏。");
    }

    const compression = readUInt16(view, cursor + 10);
    const compressedSize = readUInt32(view, cursor + 20);
    const uncompressedSize = readUInt32(view, cursor + 24);
    const nameLength = readUInt16(view, cursor + 28);
    const extraLength = readUInt16(view, cursor + 30);
    const commentLength = readUInt16(view, cursor + 32);
    const localOffset = readUInt32(view, cursor + 42);
    const name = new TextDecoder().decode(
      bytes.subarray(cursor + 46, cursor + 46 + nameLength),
    );

    cursor += 46 + nameLength + extraLength + commentLength;

    // 只保留文件，跳过目录项
    if (name.endsWith("/")) {
      continue;
    }

    if (uncompressedSize > ZIP_READ_LIMITS.maxEntryBytes) {
      throw new Error(`${name} 解压后超过单文件上限，请拆分文档包。`);
    }

    if (readUInt32(view, localOffset) !== LOCAL_SIGNATURE) {
      throw new Error("ZIP 条目已损坏。");
    }

    const localNameLength = readUInt16(view, localOffset + 26);
    const localExtraLength = readUInt16(view, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);

    let content: Uint8Array;

    if (compression === 0) {
      content = compressed;
    } else if (compression === 8) {
      content = new Uint8Array(inflateRawSync(compressed));
    } else {
      throw new Error(`${name} 使用了不支持的压缩方式。`);
    }

    totalBytes += content.byteLength;

    if (totalBytes > ZIP_READ_LIMITS.maxTotalBytes) {
      throw new Error("文档包解压后总体积过大，请拆分后上传。");
    }

    entries.push({ name, bytes: content });
  }

  return entries;
}

// 文档包只关心能用文本分析的条目
export function readZipTextEntries(bytes: Uint8Array): ZipEntry[] {
  return readZipEntries(bytes).filter((entry) =>
    /\.(md|markdown|txt)$/i.test(entry.name),
  );
}
