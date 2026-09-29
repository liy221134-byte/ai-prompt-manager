// 线索 3 M1：把「seed-packs/external-sources/README.md 第六节 采集进度台账」
// 解析成结构化数据。
//
// 台账仍然是一手真相源，由人手工维护 Markdown；这里只做**只读解析**，不写回。
// 构建期由 scripts/generate-external-sources-ledger.ts 调用，产物是
// src/data/external-sources-ledger.json，前端只读这份快照渲染。
//
// 上限（有意留的简化）：视图是 README 的镜像，README 改了要重跑生成脚本
// （npm run generate:leads3-ledger）才会更新；tests/external-sources-ledger.test.mjs
// 会比对 JSON 与 README，README 改了没重跑就会被测试挡下。

export type LedgerEntry = {
  /** 台账里的行序，从 1 开始（用于界面展示序号） */
  seq: number;
  source: string;
  type: string;
  status: string;
  sourceUrl: string;
  disposition: string;
  landing: string;
  verifiedAt: string;
  note: string;
};

/** 库内资产的最小画像：只读关联用，不含正文 */
export type LibraryAssetRef = {
  libraryAssetId: string;
  canonicalId: string;
  title: string;
  assetType: string;
  status: string;
  role?: string;
  authority?: boolean;
};

/** 规范 ID（大写）→ 库内资产画像 */
export type LibraryIndex = Record<string, LibraryAssetRef>;

export const compileStatusLevels = [
  "empty",
  "compiled_candidate",
  "not_compiled",
  "knowledge",
  "template",
  "not_imported",
] as const;
export type CompileStatusLevel = (typeof compileStatusLevels)[number];

export type CompileStatus = {
  level: CompileStatusLevel;
  label: string;
  matchedAssets: LibraryAssetRef[];
};

export const compileStatusLabels: Record<CompileStatusLevel, string> = {
  empty: "—（未提炼资产）",
  compiled_candidate: "已编译候选（待你确认）",
  not_compiled: "未编译／候选",
  knowledge: "知识库资产（不编译进 AGENTS.md）",
  template: "已进模板/规则层（非库内资产）",
  not_imported: "未导入库（仅台账记录）",
};

export type LedgerSnapshotEntry = LedgerEntry & {
  compileStatus: CompileStatus;
};

export type LedgerSnapshot = {
  generatedAt: string;
  sourceFile: string;
  ledgerHeading: string;
  /** 生成快照时本机库是否可读；不可读时落点匹配一律为空 */
  libraryAvailable: boolean;
  count: number;
  sources: LedgerSnapshotEntry[];
};

const LEDGER_HEADING = "## 六、采集进度台账";
const LEDGER_HEADING_PATTERN = /^##\s*六、采集进度台账\s*$/;

export function readLedgerHeading() {
  return LEDGER_HEADING;
}

/** 把一行表格拆成单元格；首尾的竖线和两侧空白都去掉 */
function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

// 展示前做一次轻量清洗：Markdown 的加粗与行内代码标记在纯文本视图里没有意义，
// 直接显示反而难看；转义的竖线还原成普通竖线。台账原文仍完整保留在 README 里。
function cleanCell(value: string): string {
  return value
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\\\|/g, "|")
    .trim();
}

function isSeparatorRow(cells: string[]) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

/**
 * 解析第六节「采集进度台账」的表格。
 * 找不到该节或表格不完整时返回空数组，由调用方决定怎么提示。
 */
export function parseLedgerSection(markdown: string): LedgerEntry[] {
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) =>
    LEDGER_HEADING_PATTERN.test(line.trim()),
  );
  if (headingIndex < 0) {
    return [];
  }

  // 只取本节内的表格行；遇到下一个二级标题（## 版本）就停
  const tableLines: string[] = [];
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (/^##\s/.test(line)) {
      break;
    }
    if (line.startsWith("|")) {
      tableLines.push(line);
    }
  }

  // 至少要有表头、分隔行和一行数据
  if (tableLines.length < 3) {
    return [];
  }

  return tableLines.slice(2).map((rowLine, rowIndex) => {
    const cells = splitRow(rowLine);
    const pick = (cellIndex: number) => cleanCell(cells[cellIndex] ?? "");

    return {
      seq: rowIndex + 1,
      source: pick(0),
      type: pick(1),
      status: pick(2),
      sourceUrl: pick(3),
      disposition: pick(4),
      landing: pick(5),
      verifiedAt: pick(6),
      note: pick(7),
    };
  });
}

/**
 * 从「落到哪条资产」文本里抽出规范 ID（如 MTH-TEAM-OKR-001、RULE-PG-FK-INDEX-001）。
 * 形态：大写字母开头、含至少一个连字符分段。用于和库内资产做只读匹配。
 */
export function extractCanonicalIds(text: string): string[] {
  const matched = text.match(/\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\b/g) ?? [];
  return Array.from(new Set(matched));
}

function isEmptyLanding(text: string) {
  return text === "" || text === "—" || text === "-";
}

/**
 * 按设计稿第三节的简化规则推导「是否已编译进 AGENTS.md」。
 *
 * 规则（M1 阶段，不解析 AGENTS.md 正文做精确比对——那是更后面的事），共五档：
 *  1. 落点为空 → empty「—（未提炼资产）」
 *  2. 落点在库内且是规则类：active → compiled_candidate「已编译候选」，否则 not_compiled
 *  3. 落点在库内且是文档类 → knowledge「知识库资产（不编译进 AGENTS.md）」
 *  4. 落点是资产 ID 形态但库内找不到 → not_imported（例如种子包里的规则不在本机库）
 *  5. 落点不是资产 ID 而是文件路径或 AGENTS.md 章节 → template「已进模板/规则层」
 *
 * 说明：五档对应设计稿第三节（docs/leads-3-m1-design-and-tasks.md）的判定规则。
 * template 档是为台账里「templates/new-project/AGENTS.md」「AGENTS.md『界面改动的验证』」
 * 这类落点设的——它们其实已编译进模板/规则层，若按 not_imported 标会让人误判成「没编译」。
 */
export function deriveCompileStatus(
  landing: string,
  index: LibraryIndex,
): CompileStatus {
  const text = (landing ?? "").trim();

  if (isEmptyLanding(text)) {
    return { level: "empty", label: compileStatusLabels.empty, matchedAssets: [] };
  }

  const matchedAssets = extractCanonicalIds(text)
    .map((canonicalId) => index[canonicalId.toUpperCase()])
    .filter((ref): ref is LibraryAssetRef => Boolean(ref));

  if (matchedAssets.length > 0) {
    const ruleRefs = matchedAssets.filter((ref) => ref.assetType === "rule");

    if (ruleRefs.length > 0) {
      const hasActive = ruleRefs.some((ref) => ref.status === "active");
      return {
        level: hasActive ? "compiled_candidate" : "not_compiled",
        label: hasActive
          ? compileStatusLabels.compiled_candidate
          : compileStatusLabels.not_compiled,
        matchedAssets,
      };
    }

    return {
      level: "knowledge",
      label: compileStatusLabels.knowledge,
      matchedAssets,
    };
  }

  // 写了资产 ID（形态像），但库内一条都没匹配上
  if (extractCanonicalIds(text).length > 0) {
    return {
      level: "not_imported",
      label: compileStatusLabels.not_imported,
      matchedAssets: [],
    };
  }

  // 落点是文件路径或 AGENTS.md 章节，不是库内资产 ID
  if (/\.md\b/.test(text) || /AGENTS\.md/i.test(text)) {
    return {
      level: "template",
      label: compileStatusLabels.template,
      matchedAssets: [],
    };
  }

  return {
    level: "not_imported",
    label: compileStatusLabels.not_imported,
    matchedAssets: [],
  };
}
