import {
  type AssetData,
  type AssetStatus,
  type DocumentAssetData,
  type RuleAssetData,
  type RuleScope,
  type RuleType,
  createInitialAssetVersionId,
} from "../data/assets.ts";
import type { AssetSaveInput } from "./prompt-api.ts";
import { assetStatusLabels } from "./asset-list.ts";

export const editableAssetTypes = ["rule", "document"] as const;
export type EditableAssetType = (typeof editableAssetTypes)[number];
export type EditableAssetData = RuleAssetData | DocumentAssetData;

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
};

export type DocumentAssetDraft = {
  assetType: "document";
  title: string;
  summary: string;
  content: string;
  status: AssetStatus;
  documentType: string;
};

export type AssetDraft = RuleAssetDraft | DocumentAssetDraft;

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
    };
  }

  return {
    assetType: "document",
    title: "",
    summary: "",
    content: "",
    status: "active",
    documentType: "PRD",
  };
}

export function assetToDraft(asset: EditableAssetData): AssetDraft {
  if (asset.assetType === "rule") {
    return {
      assetType: "rule",
      title: asset.title,
      summary: asset.summary,
      content: asset.content,
      status: asset.status,
      ruleType: asset.metadata.ruleType,
      scope: asset.metadata.scope,
    };
  }

  return {
    assetType: "document",
    title: asset.title,
    summary: asset.summary,
    content: asset.content,
    status: asset.status,
    documentType: asset.metadata.documentType,
  };
}

export function validateAssetDraft(draft: AssetDraft) {
  if (!draft.title.trim()) {
    return "请填写标题。";
  }

  if (draft.title.trim().length > ASSET_TITLE_MAX_LENGTH) {
    return `标题最多 ${ASSET_TITLE_MAX_LENGTH} 个字。`;
  }

  if (!draft.content.trim()) {
    return draft.assetType === "rule" ? "请填写规则正文。" : "请填写文档正文。";
  }

  if (draft.assetType === "document" && !draft.documentType.trim()) {
    return "请填写文档类型。";
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
    return {
      ...common,
      assetType: "rule",
      metadata: { ruleType: draft.ruleType, scope: draft.scope },
    };
  }

  return {
    ...common,
    assetType: "document",
    metadata: { documentType: draft.documentType.trim() },
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
