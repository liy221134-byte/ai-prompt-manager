import type {
  PromptCardData,
  PromptDeletedReason,
} from "./prompts.ts";

export const assetTypes = [
  "prompt",
  "rule",
  "document",
  "template",
  "tech_profile",
  "rule_pack",
  "source_package",
] as const;
export type AssetType = (typeof assetTypes)[number];

export const assetStatuses = [
  "draft",
  "pending",
  "active",
  "archived",
  "deprecated",
] as const;
export type AssetStatus = (typeof assetStatuses)[number];

export const assetSourceTypes = [
  "manual",
  "import",
  "ai",
  "system",
] as const;
export type AssetSourceType = (typeof assetSourceTypes)[number];

// 资产之间的显式关系：先做这四类，弱关系以后按需要再加
export const assetRelationTypes = [
  "reference",
  "depends_on",
  "replaces",
  "implements",
] as const;
export type AssetRelationType = (typeof assetRelationTypes)[number];

export type AssetRelation = {
  targetAssetId: string;
  relationType: AssetRelationType;
  note: string;
};

export const ruleTypes = [
  "must",
  "forbidden",
  "recommended",
  "process",
  "acceptance",
  "technology",
] as const;
export type RuleType = (typeof ruleTypes)[number];

export const ruleScopes = ["global", "project", "task"] as const;
export type RuleScope = (typeof ruleScopes)[number];

// 规则的可信度：从「假设」到「已验证」，跟着资产包一起走
export const ruleConfidences = [
  "hypothesis",
  "provisional",
  "verified",
] as const;
export type RuleConfidence = (typeof ruleConfidences)[number];

// 规则适用的项目规模，和项目地图里的分级对齐
export const projectScales = [
  "personal",
  "medium",
  "large",
  "regulated",
] as const;
export type ProjectScale = (typeof projectScales)[number];

// 规则的编译去向：现在只存着，供后续版本生成 AGENTS.md 等交付物时用
export const compileTargets = [
  "agents",
  "readme",
  "start_prompt",
  "template",
  "none",
] as const;
export type CompileTarget = (typeof compileTargets)[number];

// 编译裁决：这条规则在生成 AGENTS.md 这类产物时算不算数
export type RuleCompileDecision = {
  decision: "included" | "excluded";
  note: string;
  decidedAt: string;
};

// 规则的作用层级、执行阶段、优先级、生命周期和覆盖权限。
// 这些都是扩展字段，允许留空；旧数据缺字段按空值处理，不做强制补齐。
export const ruleLevels = ["global", "module", "task", "code"] as const;
export type RuleLevel = (typeof ruleLevels)[number];

export const ruleStages = ["plan", "implement", "verify", "release"] as const;
export type RuleStage = (typeof ruleStages)[number];

export const rulePriorities = ["must", "should", "may"] as const;
export type RulePriority = (typeof rulePriorities)[number];

export const ruleLifecycles = [
  "draft",
  "active",
  "deprecated",
  "archived",
] as const;
export type RuleLifecycle = (typeof ruleLifecycles)[number];

export const ruleOverrideScopes = ["none", "project", "task"] as const;
export type RuleOverrideScope = (typeof ruleOverrideScopes)[number];

// 文档角色：区分来源、工作稿、权威版和编译结果
export const documentRoles = [
  "source",
  "working",
  "authoritative",
  "compiled",
] as const;
export type DocumentRole = (typeof documentRoles)[number];

export const assetVersionReasons = [
  "initial",
  "save",
  "restore",
  "merge_before",
  "optimize_before",
  "restore_before",
  "migration",
] as const;
export type AssetVersionReason = (typeof assetVersionReasons)[number];

export type AssetDeletedReason = PromptDeletedReason;

export type AssetSourceData = {
  sourceType: AssetSourceType;
  sourceAssetId: string | null;
  importBatchId: string | null;
  originalFilename: string | null;
};

export type AssetLifecycleFields = {
  status: AssetStatus;
  archivedAt: string | null;
  deletedAt: string | null;
  deletedReason: AssetDeletedReason | null;
};

export type PromptAssetMetadata = {
  category: string;
  tags: string[];
  useCase: string;
  mergedIntoAssetId: string | null;
  mergeVersionId: string | null;
  relations?: AssetRelation[];
};

// 资产来自哪个规则包：记在成员资产上，包详情反查成员，避免两处各存一份
export type AssetPackLink = {
  packId: string;
  packItemId: string;
  packVersion: string;
  // 包内原始类型：method／playbook／rule／template／case_note 等，保留以便回溯
  packAssetType: string;
  projectScale: ProjectScale[];
};

export type RuleAssetMetadata = {
  ruleType: RuleType;
  scope: RuleScope;
  purpose?: string;
  level?: RuleLevel;
  techContext?: string[];
  stage?: RuleStage;
  priority?: RulePriority;
  lifecycle?: RuleLifecycle;
  overrideScope?: RuleOverrideScope;
  evidence?: string;
  verification?: string;
  // 为什么立这条规则、从原文哪句话来：冲突裁决和回溯时要用
  rationale?: string;
  sourceExcerpt?: string;
  confidence?: RuleConfidence;
  compileTarget?: CompileTarget[];
  compileDecision?: RuleCompileDecision;
  pack?: AssetPackLink;
  relations?: AssetRelation[];
};

export type DocumentAssetMetadata = {
  documentType: string;
  role?: DocumentRole;
  authority?: boolean;
  module?: string;
  effectiveVersion?: string;
  sourceLocation?: string;
  updateTrigger?: string;
  freshness?: string;
  lastVerifiedAt?: string;
  pack?: AssetPackLink;
  relations?: AssetRelation[];
};

// 技术档案：一个项目一份，记录技术栈清单；选型说明写在资产正文里。
// 偏离默认选型的条目必须挂一条 ADR。
export type TechStackEntry = {
  name: string;
  version: string;
  purpose: string;
  isDeviation: boolean;
  adrAssetId: string | null;
};

export type TechProfileAssetMetadata = {
  stack: TechStackEntry[];
  relations?: AssetRelation[];
};

// 规则包：可复用的规则集合（一个项目可以装多个包）。
// 包自己的发布状态直接用资产状态，不再另存一份。
export type RulePackAssetMetadata = {
  packVersion: string;
  packConfidence: RuleConfidence;
  projectScale: ProjectScale[];
  sourceNote: string;
  relations?: AssetRelation[];
};

export type ReservedAssetMetadata = Record<string, unknown>;

type AssetBase<TType extends AssetType, TMetadata> = {
  id: string;
  projectId: string;
  assetType: TType;
  title: string;
  summary: string;
  content: string;
  metadata: TMetadata;
  source: AssetSourceData;
  currentVersionId: string;
  createdAt: string;
  updatedAt: string;
} & AssetLifecycleFields;

export type PromptAssetData = AssetBase<"prompt", PromptAssetMetadata>;
export type RuleAssetData = AssetBase<"rule", RuleAssetMetadata>;
export type DocumentAssetData = AssetBase<
  "document",
  DocumentAssetMetadata
>;
export type TechProfileAssetData = AssetBase<
  "tech_profile",
  TechProfileAssetMetadata
>;
export type RulePackAssetData = AssetBase<
  "rule_pack",
  RulePackAssetMetadata
>;
export type ReservedAssetType = "template" | "source_package";
export type ReservedAssetData = AssetBase<
  ReservedAssetType,
  ReservedAssetMetadata
>;

export type AssetData =
  | PromptAssetData
  | RuleAssetData
  | DocumentAssetData
  | TechProfileAssetData
  | RulePackAssetData
  | ReservedAssetData;

type AssetVersionBase<TType extends AssetType, TMetadata> = {
  versionId: string;
  assetId: string;
  assetType: TType;
  versionNumber: number;
  title: string;
  summary: string;
  content: string;
  metadata: TMetadata;
  changeReason: string;
  versionReason: AssetVersionReason;
  sourceAssetIds: string[];
  restoredAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type PromptAssetVersionData = AssetVersionBase<
  "prompt",
  PromptAssetMetadata
>;
export type RuleAssetVersionData = AssetVersionBase<
  "rule",
  RuleAssetMetadata
>;
export type DocumentAssetVersionData = AssetVersionBase<
  "document",
  DocumentAssetMetadata
>;
export type TechProfileAssetVersionData = AssetVersionBase<
  "tech_profile",
  TechProfileAssetMetadata
>;
export type RulePackAssetVersionData = AssetVersionBase<
  "rule_pack",
  RulePackAssetMetadata
>;
export type ReservedAssetVersionData = AssetVersionBase<
  ReservedAssetType,
  ReservedAssetMetadata
>;

export type AssetVersionData =
  | PromptAssetVersionData
  | RuleAssetVersionData
  | DocumentAssetVersionData
  | TechProfileAssetVersionData
  | RulePackAssetVersionData
  | ReservedAssetVersionData;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isValidDateString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    !Number.isNaN(new Date(value).getTime())
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

// 扩展字段都允许缺省；缺省和空值一律按「没填」处理，不拦截保存
function isOptionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function isOptionalEnum<T extends string>(value: unknown, allowed: readonly T[]) {
  return (
    value === undefined ||
    (typeof value === "string" && allowed.includes(value as T))
  );
}

function isOptionalStringList(value: unknown) {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}

function isAssetRelation(value: unknown): value is AssetRelation {
  return (
    isRecord(value) &&
    typeof value.targetAssetId === "string" &&
    Boolean(value.targetAssetId.trim()) &&
    assetRelationTypes.includes(value.relationType as AssetRelationType) &&
    typeof value.note === "string"
  );
}

function isOptionalRelations(value: unknown) {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every((item) => isAssetRelation(item)))
  );
}

function isOptionalEnumList<T extends string>(
  value: unknown,
  options: readonly T[],
) {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every((item) => options.includes(item as T)))
  );
}

function isAssetPackLink(value: unknown): value is AssetPackLink {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.packId === "string" &&
    Boolean(value.packId.trim()) &&
    typeof value.packItemId === "string" &&
    Boolean(value.packItemId.trim()) &&
    typeof value.packVersion === "string" &&
    typeof value.packAssetType === "string" &&
    Array.isArray(value.projectScale) &&
    value.projectScale.every((item) =>
      projectScales.includes(item as ProjectScale),
    )
  );
}

function isOptionalPackLink(value: unknown) {
  return value === undefined || isAssetPackLink(value);
}

function isOptionalCompileDecision(value: unknown) {
  if (value === undefined) {
    return true;
  }

  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.decision === "included" || value.decision === "excluded") &&
    typeof value.note === "string" &&
    isValidDateString(value.decidedAt)
  );
}

function isTechStackEntry(value: unknown): value is TechStackEntry {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    Boolean(value.name.trim()) &&
    typeof value.version === "string" &&
    typeof value.purpose === "string" &&
    typeof value.isDeviation === "boolean" &&
    isNullableString(value.adrAssetId)
  );
}

function isTechProfileAssetMetadata(
  value: unknown,
): value is TechProfileAssetMetadata {
  return (
    isRecord(value) &&
    Array.isArray(value.stack) &&
    value.stack.every((entry) => isTechStackEntry(entry)) &&
    isOptionalRelations(value.relations)
  );
}

function isAssetSourceData(value: unknown): value is AssetSourceData {
  if (!isRecord(value)) {
    return false;
  }

  return (
    assetSourceTypes.includes(value.sourceType as AssetSourceType) &&
    isNullableString(value.sourceAssetId) &&
    isNullableString(value.importBatchId) &&
    isNullableString(value.originalFilename)
  );
}

function isAssetLifecycleFields(
  value: Record<string, unknown>,
): value is AssetLifecycleFields {
  if (
    !assetStatuses.includes(value.status as AssetStatus) ||
    !isNullableString(value.archivedAt) ||
    !isNullableString(value.deletedAt)
  ) {
    return false;
  }

  if (value.archivedAt !== null && !isValidDateString(value.archivedAt)) {
    return false;
  }

  if (value.deletedAt !== null && !isValidDateString(value.deletedAt)) {
    return false;
  }

  if (value.deletedAt === null) {
    return value.deletedReason === null;
  }

  return value.deletedReason === "manual" || value.deletedReason === "merge";
}

function isPromptAssetMetadata(
  value: unknown,
): value is PromptAssetMetadata {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.category === "string" &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === "string") &&
    typeof value.useCase === "string" &&
    isNullableString(value.mergedIntoAssetId) &&
    isNullableString(value.mergeVersionId) &&
    isOptionalRelations(value.relations)
  );
}

function isRuleAssetMetadata(value: unknown): value is RuleAssetMetadata {
  if (!isRecord(value)) {
    return false;
  }

  return (
    ruleTypes.includes(value.ruleType as RuleType) &&
    ruleScopes.includes(value.scope as RuleScope) &&
    isOptionalString(value.purpose) &&
    isOptionalEnum(value.level, ruleLevels) &&
    isOptionalEnum(value.stage, ruleStages) &&
    isOptionalEnum(value.priority, rulePriorities) &&
    isOptionalEnum(value.lifecycle, ruleLifecycles) &&
    isOptionalEnum(value.overrideScope, ruleOverrideScopes) &&
    isOptionalString(value.evidence) &&
    isOptionalString(value.verification) &&
    isOptionalString(value.rationale) &&
    isOptionalString(value.sourceExcerpt) &&
    isOptionalEnum(value.confidence, ruleConfidences) &&
    isOptionalEnumList(value.compileTarget, compileTargets) &&
    isOptionalCompileDecision(value.compileDecision) &&
    isOptionalPackLink(value.pack) &&
    isOptionalStringList(value.techContext) &&
    isOptionalRelations(value.relations)
  );
}

function isRulePackAssetMetadata(
  value: unknown,
): value is RulePackAssetMetadata {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.packVersion === "string" &&
    ruleConfidences.includes(value.packConfidence as RuleConfidence) &&
    Array.isArray(value.projectScale) &&
    value.projectScale.every((item) =>
      projectScales.includes(item as ProjectScale),
    ) &&
    typeof value.sourceNote === "string" &&
    isOptionalRelations(value.relations)
  );
}

function isDocumentAssetMetadata(
  value: unknown,
): value is DocumentAssetMetadata {
  return (
    isRecord(value) &&
    typeof value.documentType === "string" &&
    Boolean(value.documentType.trim()) &&
    isOptionalEnum(value.role, documentRoles) &&
    (value.authority === undefined || typeof value.authority === "boolean") &&
    isOptionalString(value.module) &&
    isOptionalString(value.effectiveVersion) &&
    isOptionalString(value.sourceLocation) &&
    isOptionalString(value.updateTrigger) &&
    isOptionalString(value.freshness) &&
    isOptionalString(value.lastVerifiedAt) &&
    isOptionalPackLink(value.pack) &&
    isOptionalRelations(value.relations)
  );
}

function isAssetBase(
  value: unknown,
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    Boolean(value.id.trim()) &&
    typeof value.projectId === "string" &&
    Boolean(value.projectId.trim()) &&
    typeof value.title === "string" &&
    Boolean(value.title.trim()) &&
    typeof value.summary === "string" &&
    typeof value.content === "string" &&
    isAssetSourceData(value.source) &&
    typeof value.currentVersionId === "string" &&
    Boolean(value.currentVersionId.trim()) &&
    isValidDateString(value.createdAt) &&
    isValidDateString(value.updatedAt) &&
    isAssetLifecycleFields(value)
  );
}

export function isAssetData(value: unknown): value is AssetData {
  if (!isAssetBase(value) || !assetTypes.includes(value.assetType as AssetType)) {
    return false;
  }

  if (value.assetType === "prompt") {
    return isPromptAssetMetadata(value.metadata);
  }

  if (value.assetType === "rule") {
    return isRuleAssetMetadata(value.metadata);
  }

  if (value.assetType === "document") {
    return isDocumentAssetMetadata(value.metadata);
  }

  if (value.assetType === "tech_profile") {
    return isTechProfileAssetMetadata(value.metadata);
  }

  if (value.assetType === "rule_pack") {
    return isRulePackAssetMetadata(value.metadata);
  }

  return isRecord(value.metadata);
}

export function isAssetVersionData(
  value: unknown,
): value is AssetVersionData {
  if (!isRecord(value)) {
    return false;
  }

  if (
    typeof value.versionId !== "string" ||
    !value.versionId.trim() ||
    typeof value.assetId !== "string" ||
    !value.assetId.trim() ||
    !assetTypes.includes(value.assetType as AssetType) ||
    !Number.isInteger(value.versionNumber) ||
    Number(value.versionNumber) < 1 ||
    typeof value.title !== "string" ||
    typeof value.summary !== "string" ||
    typeof value.content !== "string" ||
    typeof value.changeReason !== "string" ||
    !value.changeReason.trim() ||
    !assetVersionReasons.includes(
      value.versionReason as AssetVersionReason,
    ) ||
    !Array.isArray(value.sourceAssetIds) ||
    !value.sourceAssetIds.every((item) => typeof item === "string") ||
    !isNullableString(value.restoredAt) ||
    !isNullableString(value.expiresAt) ||
    !isValidDateString(value.createdAt)
  ) {
    return false;
  }

  if (value.restoredAt !== null && !isValidDateString(value.restoredAt)) {
    return false;
  }

  if (value.expiresAt !== null && !isValidDateString(value.expiresAt)) {
    return false;
  }

  if (value.assetType === "prompt") {
    return isPromptAssetMetadata(value.metadata);
  }

  if (value.assetType === "rule") {
    return isRuleAssetMetadata(value.metadata);
  }

  if (value.assetType === "document") {
    return isDocumentAssetMetadata(value.metadata);
  }

  if (value.assetType === "tech_profile") {
    return isTechProfileAssetMetadata(value.metadata);
  }

  if (value.assetType === "rule_pack") {
    return isRulePackAssetMetadata(value.metadata);
  }

  return isRecord(value.metadata);
}

export function createInitialAssetVersionId(assetId: string) {
  return `current-${assetId}`;
}

// 迁移时保留原提示词标识和生命周期字段，确保旧恢复关系不断裂。
export function promptToAsset(
  prompt: PromptCardData,
  projectId: string,
): PromptAssetData {
  return {
    id: prompt.id,
    projectId,
    assetType: "prompt",
    title: prompt.title,
    summary: prompt.useCase,
    content: prompt.content,
    metadata: {
      category: prompt.category,
      tags: [...prompt.tags],
      useCase: prompt.useCase,
      mergedIntoAssetId: prompt.mergedIntoPromptId,
      mergeVersionId: prompt.mergeVersionId,
      ...(prompt.relations && prompt.relations.length > 0
        ? { relations: prompt.relations }
        : {}),
    },
    source: {
      sourceType: "system",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: createInitialAssetVersionId(prompt.id),
    status: "active",
    archivedAt: null,
    deletedAt: prompt.deletedAt,
    deletedReason: prompt.deletedReason,
    createdAt: prompt.createdAt,
    updatedAt: prompt.updatedAt,
  };
}

export function assetToPrompt(asset: PromptAssetData): PromptCardData {
  return {
    id: asset.id,
    title: asset.title,
    category: asset.metadata.category,
    tags: [...asset.metadata.tags],
    content: asset.content,
    useCase: asset.metadata.useCase,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    deletedAt: asset.deletedAt,
    deletedReason: asset.deletedReason,
    mergedIntoPromptId: asset.metadata.mergedIntoAssetId,
    mergeVersionId: asset.metadata.mergeVersionId,
    ...(asset.metadata.relations && asset.metadata.relations.length > 0
      ? { relations: asset.metadata.relations }
      : {}),
  };
}

export function createAssetVersion(
  asset: AssetData,
  input: {
    versionId: string;
    versionNumber: number;
    changeReason: string;
    createdAt: string;
    versionReason?: AssetVersionReason;
    sourceAssetIds?: string[];
    restoredAt?: string | null;
    expiresAt?: string | null;
  },
): AssetVersionData {
  return {
    versionId: input.versionId,
    assetId: asset.id,
    assetType: asset.assetType,
    versionNumber: input.versionNumber,
    title: asset.title,
    summary: asset.summary,
    content: asset.content,
    metadata: asset.metadata,
    changeReason: input.changeReason,
    versionReason: input.versionReason ?? "save",
    sourceAssetIds: [...(input.sourceAssetIds ?? [])],
    restoredAt: input.restoredAt ?? null,
    expiresAt: input.expiresAt ?? null,
    createdAt: input.createdAt,
  } as AssetVersionData;
}

// 文档类型的默认值：导入时先按参考资料归类，用户可以在编辑器里改
export const defaultDocumentType = "参考资料";

// 编辑器里用的完整形态：扩展字段缺省时补成空值，界面不需要自己兜底
export type RuleMetadataForm = {
  ruleType: RuleType;
  scope: RuleScope;
  purpose: string;
  level: RuleLevel | "";
  techContext: string[];
  stage: RuleStage | "";
  priority: RulePriority | "";
  lifecycle: RuleLifecycle | "";
  overrideScope: RuleOverrideScope | "";
  evidence: string;
  verification: string;
  rationale: string;
  sourceExcerpt: string;
  confidence: RuleConfidence | "";
  compileTarget: CompileTarget[];
};

// 规则包编辑器用的表单形状：包级字段单独一组，成员不在这里维护
export type RulePackMetadataForm = {
  packVersion: string;
  packConfidence: RuleConfidence;
  projectScale: ProjectScale[];
  sourceNote: string;
};

export type DocumentMetadataForm = {
  documentType: string;
  role: DocumentRole | "";
  authority: boolean;
  module: string;
  effectiveVersion: string;
  sourceLocation: string;
  updateTrigger: string;
  freshness: string;
  lastVerifiedAt: string;
};

function readEnum<T extends string>(value: unknown, allowed: readonly T[]): T | "" {
  return typeof value === "string" && allowed.includes(value as T)
    ? (value as T)
    : "";
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readStringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readEnumList<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T[] {
  return Array.isArray(value)
    ? value.filter((item): item is T => allowed.includes(item as T))
    : [];
}

export function normalizeRuleMetadata(value: unknown): RuleMetadataForm {
  const source = isRecord(value) ? value : {};

  return {
    ruleType: ruleTypes.includes(source.ruleType as RuleType)
      ? (source.ruleType as RuleType)
      : "recommended",
    scope: ruleScopes.includes(source.scope as RuleScope)
      ? (source.scope as RuleScope)
      : "project",
    purpose: readString(source.purpose),
    level: readEnum(source.level, ruleLevels),
    techContext: readStringList(source.techContext),
    stage: readEnum(source.stage, ruleStages),
    priority: readEnum(source.priority, rulePriorities),
    lifecycle: readEnum(source.lifecycle, ruleLifecycles),
    overrideScope: readEnum(source.overrideScope, ruleOverrideScopes),
    evidence: readString(source.evidence),
    verification: readString(source.verification),
    rationale: readString(source.rationale),
    sourceExcerpt: readString(source.sourceExcerpt),
    confidence: readEnum(source.confidence, ruleConfidences),
    compileTarget: readEnumList(source.compileTarget, compileTargets),
  };
}

export function normalizeRulePackMetadata(
  value: unknown,
): RulePackMetadataForm {
  const source = isRecord(value) ? value : {};

  return {
    packVersion: readString(source.packVersion),
    packConfidence: ruleConfidences.includes(
      source.packConfidence as RuleConfidence,
    )
      ? (source.packConfidence as RuleConfidence)
      : "provisional",
    projectScale: readEnumList(source.projectScale, projectScales),
    sourceNote: readString(source.sourceNote),
  };
}

export function normalizeDocumentMetadata(value: unknown): DocumentMetadataForm {
  const source = isRecord(value) ? value : {};

  return {
    documentType: readString(source.documentType) || defaultDocumentType,
    role: readEnum(source.role, documentRoles),
    authority: source.authority === true,
    module: readString(source.module),
    effectiveVersion: readString(source.effectiveVersion),
    sourceLocation: readString(source.sourceLocation),
    updateTrigger: readString(source.updateTrigger),
    freshness: readString(source.freshness),
    lastVerifiedAt: readString(source.lastVerifiedAt),
  };
}

export function normalizeAssetRelations(value: unknown): AssetRelation[] {
  return Array.isArray(value)
    ? value.filter((item) => isAssetRelation(item)).map((item) => ({ ...item }))
    : [];
}

// 关系挂在各类资产的元数据上，读取统一走这里，免得每处都判断资产类型
export function readAssetRelations(metadata: unknown): AssetRelation[] {
  const source = isRecord(metadata) ? metadata : {};

  return normalizeAssetRelations(source.relations);
}

export function isAssetRelationList(value: unknown) {
  return isOptionalRelations(value);
}

export type TechProfileMetadataForm = {
  stack: TechStackEntry[];
  relations: AssetRelation[];
};

export function normalizeTechProfileMetadata(
  value: unknown,
): TechProfileMetadataForm {
  const source = isRecord(value) ? value : {};

  return {
    stack: Array.isArray(source.stack)
      ? source.stack
          .filter((entry) => isTechStackEntry(entry))
          .map((entry) => ({ ...entry }))
      : [],
    relations: normalizeAssetRelations(source.relations),
  };
}
