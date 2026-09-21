import type { AssetData, AssetType } from "../data/assets.ts";

export const assetTypeLabels: Record<AssetType, string> = {
  prompt: "提示词",
  rule: "规则",
  document: "文档",
  template: "模板",
  tech_profile: "技术档案",
  source_package: "来源包",
};

// 2.0.0 只开放提示词、规则和文档三种筛选，模板和技术档案由后续版本接入。
export const assetTypeFilterOptions = [
  "all",
  "prompt",
  "rule",
  "document",
] as const;
export type AssetTypeFilter = (typeof assetTypeFilterOptions)[number];

export const assetTypeFilterLabels: Record<AssetTypeFilter, string> = {
  all: "全部",
  prompt: "提示词",
  rule: "规则",
  document: "文档",
};

// 列表默认只显示活跃资产，草稿、归档和垃圾箱内容不进入列表。
export function isActiveAsset(asset: AssetData) {
  return (
    asset.status === "active" &&
    asset.archivedAt === null &&
    asset.deletedAt === null
  );
}

export function filterProjectAssets(
  assets: AssetData[],
  options: { projectId: string; assetType?: AssetType },
) {
  return assets.filter((asset) => {
    if (asset.projectId !== options.projectId || !isActiveAsset(asset)) {
      return false;
    }

    return options.assetType ? asset.assetType === options.assetType : true;
  });
}

export function matchesAssetTypeFilter(
  asset: AssetData,
  filter: AssetTypeFilter,
) {
  return filter === "all" || asset.assetType === filter;
}

function readAssetTags(asset: AssetData) {
  const metadata = asset.metadata as { tags?: unknown };

  return Array.isArray(metadata.tags)
    ? metadata.tags.filter((tag): tag is string => typeof tag === "string")
    : [];
}

export function buildAssetSearchText(asset: AssetData) {
  return [
    asset.title,
    asset.summary,
    asset.content,
    assetTypeLabels[asset.assetType],
    ...readAssetTags(asset),
  ]
    .join(" ")
    .toLocaleLowerCase();
}
