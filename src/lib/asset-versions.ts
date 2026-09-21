import type {
  AssetData,
  AssetVersionData,
  AssetVersionReason,
} from "../data/assets.ts";
import type { AssetSaveInput } from "./prompt-api.ts";

export const assetVersionReasonLabels: Record<AssetVersionReason, string> = {
  initial: "创建",
  save: "保存",
  restore: "恢复",
  merge_before: "合并前",
  optimize_before: "优化前",
  restore_before: "恢复前",
  migration: "迁移",
};

export function createAssetVersionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `version-${crypto.randomUUID()}`;
  }

  return `version-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// 版本列表按版本号从新到旧展示，方便先看到最近一次变更。
export function sortAssetVersionsNewestFirst(versions: AssetVersionData[]) {
  return [...versions].sort(
    (left, right) => right.versionNumber - left.versionNumber,
  );
}

export function isCurrentAssetVersion(
  asset: AssetData,
  version: AssetVersionData,
) {
  return asset.currentVersionId === version.versionId;
}

export function canRestoreAssetVersion(
  asset: AssetData,
  version: AssetVersionData,
) {
  return (
    version.assetId === asset.id && !isCurrentAssetVersion(asset, version)
  );
}

export function createRestoreChangeReason(version: AssetVersionData) {
  return `恢复到第 ${version.versionNumber} 版`;
}

// 恢复不覆盖历史：把旧版本的内容写成一条新版本，当前版本指向它。
export function buildRestoreAssetInput(
  asset: AssetData,
  version: AssetVersionData,
  options: { versionId: string; now: string },
): AssetSaveInput {
  const restoredAsset: AssetData = {
    id: asset.id,
    projectId: asset.projectId,
    assetType: asset.assetType,
    title: version.title,
    summary: version.summary,
    content: version.content,
    metadata: version.metadata,
    source: asset.source,
    currentVersionId: options.versionId,
    status: asset.status,
    archivedAt: asset.archivedAt,
    deletedAt: asset.deletedAt,
    deletedReason: asset.deletedReason,
    createdAt: asset.createdAt,
    updatedAt: options.now,
  } as AssetData;

  return {
    asset: restoredAsset,
    versionId: options.versionId,
    changeReason: createRestoreChangeReason(version),
    versionReason: "restore",
  };
}
