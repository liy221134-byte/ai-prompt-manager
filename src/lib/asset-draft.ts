import {
  type AssetData,
  type AssetStatus,
  type DocumentAssetData,
  type DocumentAssetMetadata,
  type DocumentRole,
  type RuleAssetMetadata,
  type RuleAssetData,
  type RuleLevel,
  type RuleLifecycle,
  type RuleOverrideScope,
  type RulePriority,
  type RuleScope,
  type RuleStage,
  type RuleType,
  createInitialAssetVersionId,
  defaultDocumentType,
  normalizeDocumentMetadata,
  normalizeRuleMetadata,
  normalizeTechProfileMetadata,
  type TechProfileAssetData,
  type TechProfileAssetMetadata,
} from "../data/assets.ts";
import type { AssetSaveInput } from "./prompt-api.ts";
import { assetStatusLabels } from "./asset-list.ts";
import { validateTechStack } from "./tech-profile.ts";

export const editableAssetTypes = ["rule", "document", "tech_profile"] as const;
export type EditableAssetType = (typeof editableAssetTypes)[number];
export type EditableAssetData =
  | RuleAssetData
  | DocumentAssetData
  | TechProfileAssetData;

export const ASSET_TITLE_MAX_LENGTH = 60;

// 手动编辑只开放这四个状态，「待确认」留给后续 AI 和导入流程。
export const editableAssetStatuses: AssetStatus[] = [
  "draft",
  "active",
  "deprecated",
  "archived",
];

export type RuleAssetDraft = {
  assetType: "rule";
  title: string;
  summary: string;
  content: string;
  status: AssetStatus;
  ruleType: RuleType;
  scope: RuleScope;
  // 扩展元数据都可以留空，界面不因为没填而拦截保存
  purpose: string;
  level: RuleLevel | "";
  techContext: string;
  stage: RuleStage | "";
  priority: RulePriority | "";
  lifecycle: RuleLifecycle | "";
  overrideScope: RuleOverrideScope | "";
  evidence: string;
  verification: string;
};

export type DocumentAssetDraft = {
  assetType: "document";
  title: string;
  summary: string;
  content: string;
  status: AssetStatus;
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

// 技术栈一行：界面上用 key 做稳定标识，保存时转成元数据里的数组
export type TechStackEntryDraft = {
  key: string;
  name: string;
  version: string;
  purpose: string;
  isDeviation: boolean;
  adrAssetId: string;
};

export type TechProfileAssetDraft = {
  assetType: "tech_profile";
  title: string;
  summary: string;
  content: string;
  status: AssetStatus;
  stack: TechStackEntryDraft[];
};

export type AssetDraft =
  | RuleAssetDraft
  | DocumentAssetDraft
  | TechProfileAssetDraft;

// 2.0.0 只有规则和文档有编辑入口，提示词继续走既有流程。
export function isEditableAssetData(value: AssetData): value is EditableAssetData {
  return value.assetType === "rule" || value.assetType === "document";
}

export function createAssetId(assetType: EditableAssetType) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${assetType}-${crypto.randomUUID()}`;
  }

  return `${assetType}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createEmptyAssetDraft(
  assetType: EditableAssetType,
): AssetDraft {
  if (assetType === "rule") {
    return {
      assetType: "rule",
      title: "",
      summary: "",
      content: "",
      status: "active",
      ruleType: "must",
      scope: "project",
      purpose: "",
      level: "",
      techContext: "",
      stage: "",
      priority: "",
      lifecycle: "",
      overrideScope: "",
      evidence: "",
      verification: "",
    };
  }

  if (assetType === "tech_profile") {
    return {
      assetType: "tech_profile",
      title: "",
      summary: "",
      content: "",
      status: "active",
      stack: [],
    };
  }

  return {
    assetType: "document",
    title: "",
    summary: "",
    content: "",
    status: "active",
    documentType: "PRD",
    role: "",
    authority: false,
    module: "",
    effectiveVersion: "",
    sourceLocation: "",
    updateTrigger: "",
    freshness: "",
    lastVerifiedAt: "",
  };
}

export function assetToDraft(asset: EditableAssetData): AssetDraft {
  if (asset.assetType === "tech_profile") {
    return techProfileToDraft(asset);
  }

  if (asset.assetType === "rule") {
    // 旧数据只有核心字段，这里统一补成空值，编辑器不用自己兜底
    const metadata = normalizeRuleMetadata(asset.metadata);

    return {
      assetType: "rule",
      title: asset.title,
      summary: asset.summary,
      content: asset.content,
      status: asset.status,
      ruleType: metadata.ruleType,
      scope: metadata.scope,
      purpose: metadata.purpose,
      level: metadata.level,
      techContext: metadata.techContext.join("，"),
      stage: metadata.stage,
      priority: metadata.priority,
      lifecycle: metadata.lifecycle,
      overrideScope: metadata.overrideScope,
      evidence: metadata.evidence,
      verification: metadata.verification,
    };
  }

  const metadata = normalizeDocumentMetadata(asset.metadata);

  return {
    assetType: "document",
    title: asset.title,
    summary: asset.summary,
    content: asset.content,
    status: asset.status,
    documentType: metadata.documentType,
    role: metadata.role,
    authority: metadata.authority,
    module: metadata.module,
    effectiveVersion: metadata.effectiveVersion,
    sourceLocation: metadata.sourceLocation,
    updateTrigger: metadata.updateTrigger,
    freshness: metadata.freshness,
    lastVerifiedAt: metadata.lastVerifiedAt,
  };
}

export function techProfileToDraft(
  asset: TechProfileAssetData,
): TechProfileAssetDraft {
  const metadata = normalizeTechProfileMetadata(asset.metadata);

  return {
    assetType: "tech_profile",
    title: asset.title,
    summary: asset.summary,
    content: asset.content,
    status: asset.status,
    stack: metadata.stack.map((entry, index) => ({
      key: `stack-${index + 1}`,
      name: entry.name,
      version: entry.version,
      purpose: entry.purpose,
      isDeviation: entry.isDeviation,
      adrAssetId: entry.adrAssetId ?? "",
    })),
  };
}

// 缺字段的旧数据补成空值，界面不因为扩展字段为空而拦截保存
function normalizeDraftStack(stack: TechStackEntryDraft[]) {
  return stack.map((entry) => ({
    name: entry.name.trim(),
    version: entry.version.trim(),
    purpose: entry.purpose.trim(),
    isDeviation: entry.isDeviation,
    adrAssetId: entry.isDeviation && entry.adrAssetId ? entry.adrAssetId : null,
  }));
}

export function validateAssetDraft(draft: AssetDraft) {
  if (!draft.title.trim()) {
    return "请填写标题。";
  }

  if (draft.title.trim().length > ASSET_TITLE_MAX_LENGTH) {
    return `标题最多 ${ASSET_TITLE_MAX_LENGTH} 个字。`;
  }

  // 技术档案的正文是选型说明，允许先留空，技术栈清单才是必填
  if (draft.assetType !== "tech_profile" && !draft.content.trim()) {
    return draft.assetType === "rule" ? "请填写规则正文。" : "请填写文档正文。";
  }

  if (draft.assetType === "document" && !draft.documentType.trim()) {
    return "请填写文档类型。";
  }

  if (draft.assetType === "tech_profile") {
    return validateTechStack(normalizeDraftStack(draft.stack));
  }

  return null;
}

function buildAsset(
  draft: AssetDraft,
  base: {
    id: string;
    projectId: string;
    versionId: string;
    status: AssetStatus;
    archivedAt: string | null;
    deletedAt: string | null;
    deletedReason: AssetData["deletedReason"];
    source: AssetData["source"];
    createdAt: string;
    updatedAt: string;
  },
): AssetData {
  const common = {
    id: base.id,
    projectId: base.projectId,
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    content: draft.content.trim(),
    source: base.source,
    currentVersionId: base.versionId,
    status: base.status,
    archivedAt: base.archivedAt,
    deletedAt: base.deletedAt,
    deletedReason: base.deletedReason,
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
  };

  if (draft.assetType === "rule") {
    const ruleMetadata: RuleAssetMetadata = {
      ruleType: draft.ruleType,
      scope: draft.scope,
      purpose: draft.purpose.trim(),
      // 枚举留空时不写进元数据，避免出现空字符串这种非法取值
      ...(draft.level ? { level: draft.level } : {}),
      techContext: draft.techContext
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
      ...(draft.stage ? { stage: draft.stage } : {}),
      ...(draft.priority ? { priority: draft.priority } : {}),
      ...(draft.lifecycle ? { lifecycle: draft.lifecycle } : {}),
      ...(draft.overrideScope ? { overrideScope: draft.overrideScope } : {}),
      evidence: draft.evidence.trim(),
      verification: draft.verification.trim(),
    };

    return {
      ...common,
      assetType: "rule",
      metadata: ruleMetadata,
    };
  }

  if (draft.assetType === "tech_profile") {
    const techMetadata: TechProfileAssetMetadata = {
      stack: normalizeDraftStack(draft.stack).filter((entry) => entry.name),
      relations: [],
    };

    return {
      ...common,
      assetType: "tech_profile",
      metadata: techMetadata,
    };
  }

  const documentMetadata: DocumentAssetMetadata = {
    documentType: draft.documentType.trim() || defaultDocumentType,
    ...(draft.role ? { role: draft.role } : {}),
    authority: draft.authority,
    module: draft.module.trim(),
    effectiveVersion: draft.effectiveVersion.trim(),
    sourceLocation: draft.sourceLocation.trim(),
    updateTrigger: draft.updateTrigger.trim(),
    freshness: draft.freshness.trim(),
    lastVerifiedAt: draft.lastVerifiedAt.trim(),
  };

  return {
    ...common,
    assetType: "document",
    metadata: documentMetadata,
  };
}

// 归档状态与归档时间必须同时设置，避免出现有归档时间却仍活跃的资产。
function resolveArchivedAt(
  status: AssetStatus,
  previousArchivedAt: string | null,
  now: string,
) {
  if (status !== "archived") {
    return null;
  }

  return previousArchivedAt ?? now;
}

export function buildCreateAssetInput(input: {
  id: string;
  projectId: string;
  draft: AssetDraft;
  now: string;
}): AssetSaveInput {
  const versionId = createInitialAssetVersionId(input.id);
  const asset = buildAsset(input.draft, {
    id: input.id,
    projectId: input.projectId,
    versionId,
    status: input.draft.status,
    archivedAt: resolveArchivedAt(input.draft.status, null, input.now),
    deletedAt: null,
    deletedReason: null,
    source: {
      sourceType: "manual",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    createdAt: input.now,
    updatedAt: input.now,
  });

  return {
    asset,
    versionId,
    changeReason: "创建资产",
    versionReason: "initial",
  };
}

function describeSaveReason(asset: EditableAssetData, draft: AssetDraft) {
  if (asset.status !== draft.status) {
    if (draft.status === "archived") {
      return "归档资产";
    }

    if (asset.status === "archived") {
      return "重新激活资产";
    }

    return `状态改为${assetStatusLabels[draft.status]}`;
  }

  return "保存资产";
}

export function buildUpdateAssetInput(
  asset: EditableAssetData,
  draft: AssetDraft,
  options: { versionId: string; now: string },
): AssetSaveInput {
  const nextAsset = buildAsset(draft, {
    id: asset.id,
    projectId: asset.projectId,
    versionId: options.versionId,
    status: draft.status,
    archivedAt: resolveArchivedAt(
      draft.status,
      asset.archivedAt,
      options.now,
    ),
    deletedAt: asset.deletedAt,
    deletedReason: asset.deletedReason,
    source: asset.source,
    createdAt: asset.createdAt,
    updatedAt: options.now,
  });

  return {
    asset: nextAsset,
    versionId: options.versionId,
    changeReason: describeSaveReason(asset, draft),
    versionReason: "save",
  };
}
