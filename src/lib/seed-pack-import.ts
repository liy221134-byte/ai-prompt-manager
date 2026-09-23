// 种子资产包（仓库里的 Markdown 资产包）→ 产品规则包的解析与映射。
// 只做纯数据转换：不读文件系统、不碰数据库，方便测试和脚本复用。

import {
  assetStatuses,
  compileTargets,
  projectScales,
  ruleConfidences,
  ruleOverrideScopes,
  rulePriorities,
  ruleScopes,
  ruleStages,
  ruleTypes,
  type AssetPackLink,
  type AssetStatus,
  type AssetType,
  type CompileTarget,
  type DocumentAssetMetadata,
  type ProjectScale,
  type RuleAssetMetadata,
  type RuleConfidence,
  type RuleLevel,
  type RuleOverrideScope,
  type RulePriority,
  type RuleScope,
  type RuleStage,
  type RuleType,
} from "../data/assets.ts";

export const RULE_PACK_FILE_TYPE = "ai-prompt-manager-rule-pack";
export const RULE_PACK_FILE_VERSION = 1;
export const RULE_PACK_FILE_NOTE =
  "规则包包含包信息和成员资产。安装时按包内编号去重，只新增不覆盖已有内容。";

export type SeedPackFile = {
  path: string;
  content: string;
};

export type RulePackFileMember = {
  id: string;
  assetType: AssetType;
  title: string;
  summary: string;
  content: string;
  metadata: RuleAssetMetadata | DocumentAssetMetadata | Record<string, unknown>;
  status: AssetStatus;
};

export type RulePackFilePack = {
  id: string;
  title: string;
  summary: string;
  content: string;
  metadata: {
    packVersion: string;
    packConfidence: RuleConfidence;
    projectScale: ProjectScale[];
    sourceNote: string;
  };
  status: AssetStatus;
};

export type RulePackFile = {
  type: typeof RULE_PACK_FILE_TYPE;
  version: number;
  exportedAt: string;
  note: string;
  pack: RulePackFilePack;
  members: RulePackFileMember[];
};

// 种子包字段 → 产品字段的取值映射。两套层级的取值体系不同，
// 认不出来的值一律留空，原始 front-matter 会完整保留在正文末尾。
const purposeLabels: Record<string, string> = {
  analysis: "分析",
  development: "开发",
  testing: "测试",
  release: "发布",
  data: "数据",
  safety: "安全",
  collaboration: "协作",
};

const layerToLevel: Record<string, RuleLevel> = {
  module: "module",
};

const phaseToStage: Record<string, RuleStage> = {
  analysis: "plan",
  design: "plan",
  build: "implement",
  verify: "verify",
  release: "release",
  operate: "release",
};

const priorityMap: Record<string, RulePriority> = {
  p0: "must",
  p1: "should",
  p2: "may",
};

const verificationLabels: Record<string, string> = {
  manual: "人工核对",
  test: "自动化测试",
  gate: "门禁检查",
  runtime: "运行时验证",
};

const assetTypeMap: Record<string, { assetType: AssetType; ruleType?: RuleType }> =
  {
    rule: { assetType: "rule" },
    method: { assetType: "rule", ruleType: "recommended" },
    principle: { assetType: "rule", ruleType: "recommended" },
    playbook: { assetType: "rule", ruleType: "process" },
    template: { assetType: "document" },
    case_note: { assetType: "document" },
  };

const documentTypeByPackAssetType: Record<string, string> = {
  template: "模板",
  case_note: "案例",
  profile: "项目画像",
  validation: "编译验证记录",
};

type FrontMatter = {
  fields: Record<string, string>;
  lists: Record<string, string[]>;
  body: string;
  raw: string;
};

// 种子包的 front-matter 只用了「键值」和「键 + 短横线列表」两种写法，
// 这里按这个子集解析，不引入 YAML 依赖。
export function parseSeedFrontMatter(content: string): FrontMatter {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);

  if (!match) {
    return { fields: {}, lists: {}, body: content.trim(), raw: "" };
  }

  const raw = match[1];
  const fields: Record<string, string> = {};
  const lists: Record<string, string[]> = {};
  let currentListKey: string | null = null;

  for (const line of raw.split(/\r?\n/)) {
    const listItem = line.match(/^\s+-\s*(.*)$/);

    if (listItem && currentListKey) {
      const value = listItem[1].trim().replace(/^["']|["']$/g, "");

      if (value) {
        lists[currentListKey].push(value);
      }

      continue;
    }

    const pair = line.match(/^([a-z_]+):\s*(.*)$/);

    if (!pair) {
      continue;
    }

    const [, key, value] = pair;
    const trimmed = value.trim().replace(/^["']|["']$/g, "");

    if (trimmed) {
      fields[key] = trimmed;
      currentListKey = null;
      continue;
    }

    lists[key] = [];
    currentListKey = key;
  }

  return { fields, lists, body: content.slice(match[0].length).trim(), raw };
}

function readList(parsed: FrontMatter, key: string) {
  return parsed.lists[key] ?? [];
}

function slugify(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readAssetType(parsed: FrontMatter) {
  const mapped = assetTypeMap[parsed.fields.asset_type ?? ""];

  return mapped ?? null;
}

// 成员标识按包内编号生成，稳定可复现：同一条资产重复导入时能被认出来
export function createSeedMemberId(assetType: AssetType, seedId: string) {
  return `${assetType}-${slugify(seedId)}`;
}

function pickFirstMapped<T extends string>(
  values: string[],
  map: Record<string, T>,
): T | "" {
  for (const value of values) {
    const mapped = map[value];

    if (mapped) {
      return mapped;
    }
  }

  return "";
}

// 取某个二级标题下的第一段，用来把「核心结论」「失败模式」这类小节搬进元数据
function readSectionParagraph(body: string, heading: string) {
  const section = body
    .split(/^##\s+/m)
    .find((part) => part.startsWith(heading));

  if (!section) {
    return "";
  }

  const paragraph = section
    .split(/\r?\n\r?\n/)
    .slice(1)
    .map((part) => part.replace(/\r?\n/g, " ").trim())
    .find(Boolean);

  return paragraph ?? "";
}

// 画像和验证记录没有 front-matter，标题取正文第一个一级标题
function readHeading(body: string) {
  return body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
}

function buildPackLink(
  packId: string,
  seedId: string,
  packVersion: string,
  packAssetType: string,
  projectScale: ProjectScale[],
): AssetPackLink {
  return {
    packId,
    // 画像和验证记录没有 front-matter 编号，用解析出来的稳定编号兜底
    packItemId: seedId,
    packVersion,
    packAssetType,
    projectScale,
  };
}

function buildContent(body: string, raw: string) {
  // 原始 front-matter 一并留在正文里：没映射上的字段（层级、复核日期等）不丢
  return raw
    ? `${body}\n\n## 包内原始元数据\n\n\`\`\`yaml\n${raw}\n\`\`\``
    : body;
}

// 种子包的资产用「失败模式」说明这条规则防的是什么问题，正好对应「理由」字段
function withFailureModeRationale(
  metadata: RuleAssetMetadata | DocumentAssetMetadata,
  body: string,
) {
  const failureMode = readSectionParagraph(body, "失败模式");

  if (!failureMode || "rationale" in metadata) {
    return metadata;
  }

  return {
    ...metadata,
    rationale: failureMode,
  } as RuleAssetMetadata;
}

function buildRuleMetadata(
  parsed: FrontMatter,
  packId: string,
  seedId: string,
  projectScale: ProjectScale[],
  packAssetType: string,
  ruleType: RuleType,
): RuleAssetMetadata {
  const evidence = [
    ...readList(parsed, "evidence"),
    ...readList(parsed, "source_references"),
  ]
    .map((item) => `- ${item}`)
    .join("\n");

  const overrideAllowed = parsed.fields.override_allowed;
  const overrideScope: RuleOverrideScope | undefined =
    overrideAllowed === undefined
      ? undefined
      : overrideAllowed === "false"
        ? "none"
        : "project";
  const level = layerToLevel[parsed.fields.layer ?? ""];
  const stage = pickFirstMapped(readList(parsed, "lifecycle_phase"), phaseToStage);
  const confidence = ruleConfidences.includes(
    parsed.fields.confidence as RuleConfidence,
  )
    ? (parsed.fields.confidence as RuleConfidence)
    : undefined;
  const compileTarget = readList(parsed, "compile_target").filter(
    (item): item is CompileTarget =>
      compileTargets.includes(item as CompileTarget),
  );

  return {
    ruleType,
    scope: ruleScopes.includes(parsed.fields.scope as RuleScope)
      ? (parsed.fields.scope as RuleScope)
      : "project",
    purpose: purposeLabels[parsed.fields.purpose ?? ""] ?? "",
    ...(level ? { level } : {}),
    ...(readList(parsed, "tech_context").length > 0
      ? { techContext: readList(parsed, "tech_context") }
      : {}),
    ...(stage ? { stage } : {}),
    ...(priorityMap[parsed.fields.priority ?? ""]
      ? { priority: priorityMap[parsed.fields.priority ?? ""] }
      : {}),
    ...(overrideScope ? { overrideScope } : {}),
    ...(evidence ? { evidence } : {}),
    ...(verificationLabels[parsed.fields.verification ?? ""]
      ? { verification: verificationLabels[parsed.fields.verification ?? ""] }
      : {}),
    ...(confidence ? { confidence } : {}),
    ...(compileTarget.length > 0 ? { compileTarget } : {}),
    pack: buildPackLink(
      packId,
      seedId,
      parsed.fields.version ?? "",
      packAssetType,
      projectScale,
    ),
  };
}

function buildDocumentMetadata(
  parsed: FrontMatter,
  packId: string,
  seedId: string,
  projectScale: ProjectScale[],
  packAssetType: string,
): DocumentAssetMetadata {
  return {
    documentType: documentTypeByPackAssetType[packAssetType] ?? "文档",
    ...(readList(parsed, "source_references").length > 0
      ? { sourceLocation: readList(parsed, "source_references").join("；") }
      : {}),
    pack: buildPackLink(
      packId,
      seedId,
      parsed.fields.version ?? "",
      packAssetType,
      projectScale,
    ),
  };
}

function readProjectScale(parsed: FrontMatter): ProjectScale[] {
  return readList(parsed, "project_scale").filter((item): item is ProjectScale =>
    projectScales.includes(item as ProjectScale),
  );
}

function readPackAssetType(path: string, parsed: FrontMatter) {
  const folder = path.split("/").slice(-2, -1)[0];

  if (folder === "assets") {
    return parsed.fields.asset_type ?? "";
  }

  if (folder === "profiles") {
    return "profile";
  }

  return folder ?? "";
}

export type SeedPackImportResult = {
  pack: RulePackFilePack;
  members: RulePackFileMember[];
  warnings: string[];
};

// 把种子包的 Markdown 文件集合转成规则包。
// 入参只包含包内文件（相对路径 + 内容），顶层 README 作为包说明，
// manifest 和 schema 属于包的目录与字段定义，不单独建资产。
export function seedPackFilesToRulePack(
  files: SeedPackFile[],
  options: {
    packId: string;
    exportedAt: string;
    fallbackTitle?: string;
  },
): SeedPackImportResult {
  const warnings: string[] = [];
  const members: RulePackFileMember[] = [];
  const memberIds = new Set<string>();
  const memberIdBySeedId = new Map<string, string>();
  const related: Array<{ from: string; to: string }> = [];
  const scales = new Set<ProjectScale>();
  let readme = "";

  for (const file of files) {
    const normalizedPath = file.path.replace(/\\/g, "/");

    if (normalizedPath === "README.md") {
      readme = file.content;
      continue;
    }

    if (
      normalizedPath === "manifest.md" ||
      normalizedPath === "schema.md" ||
      !normalizedPath.endsWith(".md")
    ) {
      continue;
    }

    const parsed = parseSeedFrontMatter(file.content);
    const packAssetType = readPackAssetType(normalizedPath, parsed);
    const fileName = normalizedPath.replace(/^.*\//, "").replace(/\.md$/, "");
    const folder = normalizedPath.split("/").slice(-2, -1)[0] ?? "";
    // 核心资产用包内编号；画像和验证记录没有编号，用「目录 + 文件名」避免重名
    const seedId =
      parsed.fields.id ?? (folder === "assets" ? fileName : `${folder}-${fileName}`);
    const projectScale = readProjectScale(parsed);
    const mapped = normalizedPath.startsWith("assets/")
      ? readAssetType(parsed)
      : null;
    const isRule = mapped ? mapped.assetType === "rule" : false;
    const assetType: AssetType = isRule
      ? "rule"
      : "document";
    const id = createSeedMemberId(assetType, seedId);

    if (memberIds.has(id)) {
      warnings.push(`成员编号重复，已跳过：${id}`);
      continue;
    }

    memberIds.add(id);
    memberIdBySeedId.set(slugify(seedId), id);
    projectScale.forEach((scale) => scales.add(scale));

    const ruleType: RuleType =
      mapped?.ruleType ??
      (ruleTypes.includes(parsed.fields.rule_type as RuleType)
        ? (parsed.fields.rule_type as RuleType)
        : "must");
    const metadata = isRule
      ? buildRuleMetadata(
          parsed,
          options.packId,
          seedId,
          projectScale,
          packAssetType,
          ruleType,
        )
      : buildDocumentMetadata(
          parsed,
          options.packId,
          seedId,
          projectScale,
          packAssetType,
        );
  const coreConclusion = readSectionParagraph(parsed.body, "核心结论");

    if (parsed.body.length === 0) {
      warnings.push(`成员正文为空：${normalizedPath}`);
    }

    members.push({
      id,
      assetType,
      title: parsed.fields.title ?? readHeading(parsed.body) ?? seedId,
      summary: coreConclusion.slice(0, 120),
      content: buildContent(parsed.body, parsed.raw),
      metadata: withFailureModeRationale(metadata, parsed.body),
      status: "active",
    });

    if (isRule) {
      for (const target of readList(parsed, "related_assets")) {
        related.push({ from: id, to: target });
      }
    }
  }

  // 包内互相引用的编号，只有指向同一批成员时才建关系
  for (const link of related) {
    const target = memberIdBySeedId.get(slugify(link.to));

    if (!target) {
      warnings.push(`引用的资产不在这个包内，已跳过：${link.to}`);
      continue;
    }

    const member = members.find((item) => item.id === link.from);

    if (!member) {
      continue;
    }

    const metadata = member.metadata as RuleAssetMetadata;
    const relations = metadata.relations ?? [];

    if (relations.some((relation) => relation.targetAssetId === target)) {
      continue;
    }

    metadata.relations = [
      ...relations,
      { targetAssetId: target, relationType: "reference", note: "包内关联" },
    ];
  }

  const [firstLine] = readme.split(/\r?\n/).filter((line) => line.trim());
  const version = readPackVersion(files);

  return {
    pack: {
      id: options.packId,
      title: (firstLine ?? "").replace(/^#\s*/, "").trim() ||
        options.fallbackTitle ||
        "未命名规则包",
      summary: readReadmePurpose(readme),
      content: readme.trim(),
      metadata: {
        packVersion: version,
        // 种子包自述是「候选资产，已完成画像编译验证并经人工确认」
        packConfidence: readPackConfidence(files) ?? "provisional",
        projectScale: [...scales].sort(),
        sourceNote:
          "来自仓库里的种子资产包（Markdown 源文件）；manifest 与 schema 属于包的目录和字段定义，内容已并入包说明。",
      },
      status: "active",
    },
    members,
    warnings,
  };
}

function readReadmePurpose(readme: string) {
  const match = readme.match(/##\s*用途\r?\n+([\s\S]*?)\r?\n##/);

  return (match?.[1] ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function readPackVersion(files: SeedPackFile[]) {
  const manifest = files.find((file) =>
    file.path.replace(/\\/g, "/").endsWith("manifest.md"),
  );
  const version = manifest?.content.match(/\|\s*版本\s*\|\s*`?([0-9]+\.[0-9]+\.[0-9]+)`?\s*\|/);

  return version?.[1] ?? "";
}

function readPackConfidence(files: SeedPackFile[]): RuleConfidence | null {
  const readme = files.find((file) =>
    file.path.replace(/\\/g, "/").endsWith("README.md"),
  );

  if (!readme) {
    return null;
  }

  // README 自述「候选资产……经人工确认」，对应「暂时验证」
  return readme.content.includes("候选") ? "provisional" : null;
}

export function createRulePackFile(input: {
  pack: RulePackFilePack;
  members: RulePackFileMember[];
  exportedAt: string;
}): RulePackFile {
  return {
    type: RULE_PACK_FILE_TYPE,
    version: RULE_PACK_FILE_VERSION,
    exportedAt: input.exportedAt,
    note: RULE_PACK_FILE_NOTE,
    pack: input.pack,
    members: input.members,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isRulePackMember(value: unknown): value is RulePackFileMember {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    Boolean(value.id.trim()) &&
    typeof value.assetType === "string" &&
    typeof value.title === "string" &&
    typeof value.summary === "string" &&
    typeof value.content === "string" &&
    isRecord(value.metadata) &&
    assetStatuses.includes(value.status as AssetStatus)
  );
}

export function parseRulePackFile(content: string): RulePackFile {
  const parsed: unknown = (() => {
    try {
      return JSON.parse(content);
    } catch {
      throw new Error("规则包文件不是有效的 JSON。");
    }
  })();

  if (!isRecord(parsed) || parsed.type !== RULE_PACK_FILE_TYPE) {
    throw new Error("这个文件不是规则包。");
  }

  if (parsed.version !== RULE_PACK_FILE_VERSION) {
    throw new Error("规则包版本无法识别，请升级产品后再导入。");
  }

  const pack = parsed.pack;

  if (
    !isRecord(pack) ||
    typeof pack.id !== "string" ||
    Boolean(pack.id) === false ||
    typeof pack.title !== "string" ||
    !isRecord(pack.metadata) ||
    !assetStatuses.includes(pack.status as AssetStatus) ||
    !ruleConfidences.includes(
      (pack.metadata as { packConfidence?: unknown }).packConfidence as RuleConfidence,
    )
  ) {
    throw new Error("规则包的包信息不完整。");
  }

  if (!Array.isArray(parsed.members) || !parsed.members.every(isRulePackMember)) {
    throw new Error("规则包的成员清单不完整。");
  }

  return {
    type: RULE_PACK_FILE_TYPE,
    version: RULE_PACK_FILE_VERSION,
    exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : "",
    note: typeof parsed.note === "string" ? parsed.note : RULE_PACK_FILE_NOTE,
    pack: {
      id: pack.id,
      title: pack.title,
      summary: typeof pack.summary === "string" ? pack.summary : "",
      content: typeof pack.content === "string" ? pack.content : "",
      metadata: pack.metadata as RulePackFilePack["metadata"],
      status: pack.status as AssetStatus,
    },
    members: parsed.members,
  };
}
