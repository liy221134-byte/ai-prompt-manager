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
};

export type RuleAssetMetadata = {
  ruleType: RuleType;
  scope: RuleScope;
};

export type DocumentAssetMetadata = {
  documentType: string;
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
export type ReservedAssetType =
  | "template"
  | "tech_profile"
  | "source_package";
export type ReservedAssetData = AssetBase<
  ReservedAssetType,
  ReservedAssetMetadata
>;

export type AssetData =
  | PromptAssetData
  | RuleAssetData
  | DocumentAssetData
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
export type ReservedAssetVersionData = AssetVersionBase<
  ReservedAssetType,
  ReservedAssetMetadata
>;

export type AssetVersionData =
  | PromptAssetVersionData
  | RuleAssetVersionData
  | DocumentAssetVersionData
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
    isNullableString(value.mergeVersionId)
  );
}

function isRuleAssetMetadata(value: unknown): value is RuleAssetMetadata {
  if (!isRecord(value)) {
    return false;
  }

  return (
    ruleTypes.includes(value.ruleType as RuleType) &&
    ruleScopes.includes(value.scope as RuleScope)
  );
}

function isDocumentAssetMetadata(
  value: unknown,
): value is DocumentAssetMetadata {
  return (
    isRecord(value) &&
    typeof value.documentType === "string" &&
    Boolean(value.documentType.trim())
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
