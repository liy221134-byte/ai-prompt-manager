import type {
  AssetData,
  AssetStatus,
  AssetType,
  AssetRelationType,
  RuleScope,
  RuleType,
} from "../data/assets.ts";
import { readAssetRelations } from "../data/assets.ts";

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
  "tech_profile",
] as const;
export type AssetTypeFilter = (typeof assetTypeFilterOptions)[number];

export const assetTypeFilterLabels: Record<AssetTypeFilter, string> = {
  all: "全部",
  prompt: "提示词",
  rule: "规则",
  document: "文档",
  tech_profile: "技术档案",
};

export const assetRelationLabels: Record<AssetRelationType, string> = {
  reference: "引用",
  depends_on: "依赖",
  replaces: "替代",
  implements: "实现",
};

export const assetStatusLabels: Record<AssetStatus, string> = {
  draft: "草稿",
  pending: "待确认",
  active: "活跃",
  archived: "已归档",
  deprecated: "已废弃",
};

// 状态筛选把活跃放在第一位，因为它是列表默认口径。
export const assetStatusFilterOptions: AssetStatus[] = [
  "active",
  "draft",
  "pending",
  "deprecated",
  "archived",
];

export const ruleTypeLabels: Record<RuleType, string> = {
  must: "必须",
  forbidden: "禁止",
  recommended: "建议",
  process: "流程",
  acceptance: "验收",
  technology: "技术约束",
};

export const ruleScopeLabels: Record<RuleScope, string> = {
  global: "全局",
  project: "项目",
  task: "任务临时",
};

export const documentTypeOptions = [
  "PRD",
  "ADR",
  "验收记录",
  "数据库说明",
  "发布手册",
  "参考资料",
  "其他",
] as const;

// 列表默认只显示活跃资产，草稿、归档和垃圾箱内容不进入列表。
export function isActiveAsset(asset: AssetData) {
  return (
    asset.status === "active" &&
    asset.archivedAt === null &&
    asset.deletedAt === null
  );
}

export function isTrashedAsset(asset: AssetData) {
  return asset.deletedAt !== null;
}

export function filterProjectAssets(
  assets: AssetData[],
  options: {
    projectId: string;
    assetType?: AssetType;
    status?: AssetStatus;
    // 组合筛选：标签和关系目标
    tag?: string;
    relationTargetId?: string;
  },
) {
  return assets.filter((asset) => {
    if (asset.projectId !== options.projectId || isTrashedAsset(asset)) {
      return false;
    }

    if (options.assetType && asset.assetType !== options.assetType) {
      return false;
    }

    if (options.tag && !readAssetTags(asset).includes(options.tag)) {
      return false;
    }

    if (
      options.relationTargetId &&
      !readAssetRelations(asset.metadata).some(
        (relation) => relation.targetAssetId === options.relationTargetId,
      )
    ) {
      return false;
    }

    return asset.status === (options.status ?? "active");
  });
}

export function matchesAssetTypeFilter(
  asset: AssetData,
  filter: AssetTypeFilter,
) {
  return filter === "all" || asset.assetType === filter;
}

export function matchesAssetStatusFilter(
  asset: AssetData,
  status: AssetStatus,
) {
  return asset.status === status;
}

// 没有填写说明时用正文首行代替，保证列表卡片始终有可读的简介。
export function describeAssetSummary(asset: AssetData) {
  const summary = asset.summary.trim();

  if (summary) {
    return summary;
  }

  const firstLine = asset.content
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstLine ?? "";
}

// 各类型的「标签」来源不同：提示词用标签，规则用技术上下文，技术档案用技术栈名称
export function readAssetTags(asset: AssetData) {
  if (asset.assetType === "prompt") {
    return [...asset.metadata.tags];
  }

  if (asset.assetType === "rule") {
    return [...(asset.metadata.techContext ?? [])];
  }

  if (asset.assetType === "tech_profile") {
    return asset.metadata.stack
      .map((entry) => entry.name.trim())
      .filter(Boolean);
  }

  return [];
}

// 搜索范围：标题、说明、正文、类型、标签、技术栈名称和关系说明
function readRelationNotes(asset: AssetData) {
  return readAssetRelations(asset.metadata).map((relation) => relation.note);
}

export function buildAssetSearchText(asset: AssetData) {
  return [
    asset.title,
    asset.summary,
    asset.content,
    assetTypeLabels[asset.assetType],
    ...readAssetTags(asset),
    ...readRelationNotes(asset),
  ]
    .join(" ")
    .toLocaleLowerCase();
}

// 当前项目里出现过的标签，供筛选下拉使用
export function listProjectTags(assets: AssetData[], projectId: string) {
  const tags = new Set<string>();

  for (const asset of assets) {
    if (asset.projectId !== projectId || isTrashedAsset(asset)) {
      continue;
    }

    for (const tag of readAssetTags(asset)) {
      tags.add(tag);
    }
  }

  return [...tags].sort((left, right) => left.localeCompare(right, "zh"));
}

// 当前项目里被指向过的关系目标，供筛选下拉使用
export function listRelationTargets(assets: AssetData[], projectId: string) {
  const ids = new Set<string>();

  for (const asset of assets) {
    if (asset.projectId !== projectId) {
      continue;
    }

    for (const relation of readAssetRelations(asset.metadata)) {
      ids.add(relation.targetAssetId);
    }
  }

  return assets.filter(
    (asset) =>
      ids.has(asset.id) && asset.projectId === projectId && !asset.deletedAt,
  );
}
