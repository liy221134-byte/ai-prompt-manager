// 线索 3：采集记录的解析与派生。
//
// M1 时台账是 seed-packs/external-sources/README.md 里由人手工维护的 Markdown 表格，
// 产品只读构建期生成的 JSON 快照，视图是「只读镜像」。
// M2 起台账进库——**一条采集记录 = 一条 document 资产**（documentType「采集记录」），
// 本地与云端读同一套资产通道（本地 /api/assets、云端 Supabase），视图不再是镜像而是活的台账。
//
// README 第六节没有废弃：它保留为「人读的作业指引 + 历史留档」，
// 迁移脚本 scripts/import-external-source-records.ts 会读它把 23 条历史登记录入产品，
// 之后不再要求它与产品同步。
//
// 这个文件只放纯函数：挑记录、算五档「是否编译」、按生态分组。
// 读库/写库由调用方负责（页面走 PromptDataSource，迁移脚本走本机库）。

import {
  isCollectionRecordAsset,
  readCollectionRecord,
  readConfirmationRecord,
  type AssetData,
  type CollectionRecordMetadata,
  type ConfirmationRecord,
} from "../data/assets.ts";

/** 库内资产的最小画像：只看跳转和档位判定要用的字段，不带正文 */
export type LibraryAssetRef = {
  libraryAssetId: string;
  title: string;
  assetType: string;
  status: string;
};

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
  compiled_candidate: "已进编译候选（待确认发布）",
  not_compiled: "未编译／候选",
  knowledge: "知识库资产（不编译进 AGENTS.md）",
  template: "已进模板/规则层（非库内资产）",
  not_imported: "未导入库（仅台账记录）",
};

/** 视图里的一行采集记录：资产本体 + 结构化字段 + 派生档位 */
export type CollectionRecordRow = {
  /** 库内资产 ID：编辑、跳转、深链都用它 */
  assetId: string;
  /** 视图行号：按登记录入顺序排好后从 1 开始 */
  seq: number;
  /** 来源名（资产标题） */
  source: string;
  /** 来源类型：Skills／MCP／资讯流…… */
  type: string;
  /** 资产状态（draft／active……），与「处置结论」不是一回事 */
  status: string;
  /** 来源链接 */
  sourceUrl: string;
  /** 处置结论（人写的原话） */
  disposition: string;
  /** 落到哪条资产（人写的原话） */
  landing: string;
  /** 核实日期 */
  verifiedAt: string;
  /** 备注 */
  note: string;
  /** 生态／厂商，取值见 collectionEcosystems */
  ecosystem: string;
  /** 人工确认记录；没确认过为 null */
  confirmed: ConfirmationRecord | null;
  compileStatus: CompileStatus;
  updatedAt: string;
};

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 兜底显示用：空值统一成「—」，避免视图里出现一片空白看不出有没有填 */
export function orDash(value: string): string {
  return value.trim() ? value : "—";
}

/**
 * 把库内资产里的采集记录挑出来，按登记录入顺序排成视图行。
 *
 * 排序：先按 collection.seq（迁移与新建时写入的登记序号），
 * 没有 seq 的（手工在资产库里建的）排在后面，按创建时间先后。
 */
export function toCollectionRecordRows(assets: AssetData[]): CollectionRecordRow[] {
  const assetsById = buildAssetIndex(assets);

  const records = assets.filter(isCollectionRecordAsset);

  const ordered = [...records].sort((left, right) => {
    const leftSeq = readSequence(left);
    const rightSeq = readSequence(right);

    if (leftSeq !== rightSeq) {
      return leftSeq - rightSeq;
    }

    const leftTime = left.createdAt || "";
    const rightTime = right.createdAt || "";

    if (leftTime !== rightTime) {
      return leftTime < rightTime ? -1 : 1;
    }

    return left.id < right.id ? -1 : 1;
  });

  return ordered.map((asset, index) => {
    const collection = readCollectionRecord(asset) ?? {};

    return {
      assetId: asset.id,
      seq: index + 1,
      source: asset.title,
      type: readText(collection.sourceType),
      status: asset.status,
      sourceUrl: readText(collection.sourceUrl),
      disposition: readText(collection.disposition),
      landing: readText(collection.landing),
      verifiedAt: readText(collection.verifiedAt),
      note: readText(collection.note),
      ecosystem: readText(collection.ecosystem) || "其他",
      confirmed: readConfirmationRecord(asset.metadata),
      compileStatus: deriveCompileStatus(collection, assetsById),
      updatedAt: asset.updatedAt,
    };
  });
}

// 登记序号：缺省时给一个很大的值，让它稳定排在已知序号之后
function readSequence(asset: AssetData): number {
  const seq = readCollectionRecord(asset)?.seq;
  return typeof seq === "number" && Number.isFinite(seq) ? seq : 1_000_000;
}

/** 资产 ID → 资产：落点判定要按 ID 反查，才能知道它是不是规则、是不是 active */
export function buildAssetIndex(assets: AssetData[]): Map<string, AssetData> {
  return new Map(assets.map((asset) => [asset.id, asset]));
}

/**
 * 「是否编译」判定（M2 口径）。
 *
 * 判据来源从 M1 的「落点文本里的规范 ID → 源文件 frontmatter」改成
 * 「落点的库内资产 ID（collection.collectedAssetIds）」，因为产品端读不到仓库文件，
 * 而采集记录里已经存好了资产 ID（迁移脚本与新建时写入）。
 *
 * 六档：
 *  1. 没有落点 → empty
 *  2. 落点里有规则资产且其中至少一条 active → compiled_candidate（已进编译候选）
 *  3. 落点里有规则资产但都还没 active → not_compiled
 *  4. 落点里只有文档资产 → knowledge（知识库资产，本就不进 AGENTS.md）
 *  5. 落点写了但库内找不到 / 是文件路径 → not_imported / template
 */
export function deriveCompileStatus(
  record: Pick<CollectionRecordMetadata, "landing" | "collectedAssetIds">,
  assetsById: Map<string, AssetData>,
): CompileStatus {
  const landing = readText(record.landing);

  if (isEmptyLanding(landing)) {
    return {
      level: "empty",
      label: compileStatusLabels.empty,
      matchedAssets: [],
    };
  }

  const matchedAssets = (record.collectedAssetIds ?? [])
    .map((assetId) => assetsById.get(assetId))
    .filter((asset): asset is AssetData => Boolean(asset))
    .map(toAssetRef);

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

  // 写了资产 ID 但库里一条都没匹配上（例如种子包里的规则不在本机库）
  if (extractCanonicalIds(landing).length > 0) {
    return {
      level: "not_imported",
      label: compileStatusLabels.not_imported,
      matchedAssets: [],
    };
  }

  // 落点是文件路径或 AGENTS.md 章节，不是库内资产
  if (/\.md\b/.test(landing) || /AGENTS\.md/i.test(landing)) {
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

function toAssetRef(asset: AssetData): LibraryAssetRef {
  return {
    libraryAssetId: asset.id,
    title: asset.title,
    assetType: asset.assetType,
    status: asset.status,
  };
}

function isEmptyLanding(text: string) {
  return text === "" || text === "—" || text === "-";
}

/**
 * 按生态筛出记录。「全部」档传空字符串时原样返回，避免上层分叉。
 */
export function filterByEcosystem(
  rows: CollectionRecordRow[],
  ecosystem: string,
): CollectionRecordRow[] {
  const target = ecosystem.trim();

  return target ? rows.filter((row) => row.ecosystem === target) : rows;
}

/** 按生态统计条数，供筛选栏显示「这个生态采了多少条」 */
export function summarizeEcosystems(
  rows: CollectionRecordRow[],
): Array<{ ecosystem: string; count: number }> {
  const counts = new Map<string, number>();

  for (const row of rows) {
    counts.set(row.ecosystem, (counts.get(row.ecosystem) ?? 0) + 1);
  }

  return Array.from(counts, ([ecosystem, count]) => ({ ecosystem, count })).sort(
    (left, right) => right.count - left.count,
  );
}

/**
 * 采集记录的正文：人读得懂的说明。
 * 台账里那几列本来就是给人看的，搬进产品后仍然以「一眼能读完」为准，
 * 不放机器用的重复字段（结构化部分在 metadata.collection 里）。
 */
export function buildCollectionRecordContent(input: {
  source: string;
  ecosystem: string;
  sourceType: string;
  sourceUrl: string;
  disposition: string;
  landing: string;
  verifiedAt: string;
  note: string;
  /** 台账原件里的「状态」列：搬历史数据时带上，新建的没有 */
  ledgerStatus?: string;
}): string {
  const line = (label: string, value: string) =>
    `- ${label}：${value.trim() || "—"}`;

  return [
    `# ${input.source}`,
    "",
    "外部来源采集记录（线索 3）。",
    "",
    line("生态", input.ecosystem),
    line("类型", input.sourceType),
    line("来源链接", input.sourceUrl),
    line("处置结论", input.disposition),
    ...(input.ledgerStatus ? [line("台账状态", input.ledgerStatus)] : []),
    line("落到哪条资产", input.landing),
    line("核实日期", input.verifiedAt),
    "",
    "## 备注",
    input.note.trim() || "—",
  ].join("\n");
}

/**
 * 生成采集任务单话术（M2.1 T13）。
 *
 * 把用户填的「目标来源 + 生态 + 关注点」参数化成一段可复制的话术，
 * 交给 WorkBuddy / Codex 执行。模板源自 seed-packs/external-sources/README.md
 * 第五节采集作业 SOP，按设计稿要求拆成提炼要求、去重口径、合规硬约束、
 * 回填格式四段。
 */
export function buildCollectionTaskPrompt(input: {
  sourceUrl: string;
  ecosystem?: string;
  focus?: string;
}): string {
  const source = input.sourceUrl.trim();
  const ecosystem = input.ecosystem?.trim() ?? "";
  const focus = input.focus?.trim() ?? "";

  // 关注点这一条只在用户填了的时候出现，不硬塞空行
  const focusLine = focus
    ? `\n4. 重点关注：${focus}`
    : "";

  // 生态提示只在选了的时候出现
  const ecosystemHint = ecosystem ? `（生态：${ecosystem}）` : "";

  // M2.2：本地智能体能碰仓库文件系统，就让它自己跑落库命令，不用把产出件交回来
  const landCommand = [
    `npm run collect:land -- <产出件目录> --source "${source}"`,
    ecosystem ? ` --ecosystem "${ecosystem}"` : "",
  ].join("");

  return [
    `请阅读这个 Skills / MCP 仓库：${source}`,
    `背景：我是产品经理，零代码用 AI 交付软件，正在建设工程规则资产包。`,
    `任务：从中提炼"可复用的工程规则"，不要照搬它的完整流程，也不要安装或修改任何东西。`,
    ``,
    `提炼要求：`,
    `1. 逐条输出候选规则，每条标注来源（具体到哪个 SKILL.md / 哪个官方约定）。`,
    `2. 区分两类：约束 AI 的规则（进工程包）/ 教操作者的方法（进训练包）。`,
    `3. 每条给出：规则类型（必须/禁止/建议/流程/验收）、适用项目规模`,
    `   （个人/中型/大型）、优先级、不适用场景。${focusLine}`,
    ``,
    `去重口径：`,
    `对照我现有的工程资产清单（见 seed-packs/engineering-foundations/manifest.md）去重，`,
    `只输出真正的新增项，并指出它补强或冲突的现有资产 ID。`,
    ``,
    `合规硬约束：`,
    `- 只产出候选清单，不要写进 AGENTS.md，也不要把任何条目当作正式规则启用，等我人工确认。`,
    `- 一次只处理这一个来源，不要批量采。`,
    ``,
    `回填格式（重要，照做）：`,
    `- 产出物是一个或多个 .md 文件，条目多就打包成一个 .zip。`,
    `- 每个 .md 文件写一条候选规则：第一行用 "# 规则标题" 起头，下面写规则正文`,
    `  （类型/规模/优先级/不适用场景 + 正例反例），纯 Markdown。`,
    `- 不要写 YAML frontmatter：status、confidence、来源这些由产品落库时统一处理，写了也用不上。`,
    `- 不要在文件里写"去重说明""未采纳项"这类元信息——产品导入时会把文件里每一块`,
    `  内容都当候选提炼，元信息会变成垃圾资产。`,
    ``,
    `落库（按你的执行环境二选一，只做适用那一支）：`,
    `A. 你能访问我本机仓库（Codex 这类本地智能体）：把 .md 写进一个目录`,
    `   （例如 .data/collection-outputs/obra-superpowers/），然后执行落库命令：`,
    `   ${landCommand}`,
    `   规则会进公共库（草稿态、假设级可信度，等我确认），同时自动生成一条采集记录；`,
    `   命令会打印新增了哪几条、采集记录是哪个 ID——在回复里把这两件事告诉我。`,
    `B. 你碰不到本机文件系统（云端 / 网页智能体）：把 .md（或 .zip）交回给我，`,
    `   并明确说下一步是到产品「采集台账 → 给压缩包」导入，导入后台账会自动多一行采集记录${ecosystemHint}。`,
  ].join("\n");
}

/**
 * 从落点文本里认出库内资产，产出可以写进 collectedAssetIds 的资产 ID。
 *
 * 两种认法：文本里出现资产 ID，或出现资产标题（标题太短的不认，避免「OKR」这种
 * 两三个字的标题到处误伤）。认不出来的不硬猜——视图会退回按文本判档。
 */
export function resolveLandingAssets(
  landing: string,
  assets: AssetData[],
): string[] {
  const text = landing.trim();

  if (!text) {
    return [];
  }

  const matched = new Set<string>();

  for (const asset of assets) {
    if (text.includes(asset.id)) {
      matched.add(asset.id);
      continue;
    }

    const title = asset.title.trim();

    if (title.length >= 4 && text.includes(title)) {
      matched.add(asset.id);
    }
  }

  return Array.from(matched);
}

// —— 下面两个函数留给迁移脚本：把 README 第六节的老台账读进产品 ——

const LEDGER_HEADING = "## 六、采集进度台账";
const LEDGER_HEADING_PATTERN = /^##\s*六、采集进度台账\s*$/;

export function readLedgerHeading() {
  return LEDGER_HEADING;
}

/** 台账的一行原始文本（迁移脚本把它转成采集记录的字段） */
export type LedgerEntry = {
  /** 台账里的行序，从 1 开始 */
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

/**
 * 解析第六节「采集进度台账」的表格。迁移脚本用它读历史 23 条；
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
 * 形态：大写字母开头、含至少一个连字符分段。
 * 迁移脚本拿它去比对库内资产，换算成采集记录里的 collectedAssetIds。
 */
export function extractCanonicalIds(text: string): string[] {
  const matched = text.match(/\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\b/g) ?? [];
  return Array.from(new Set(matched));
}
