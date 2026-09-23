// MCP 只读查询：把库里的项目和资产整理成能给 AI 用的形状。
// 这里只做匹配、筛选和排序，纯函数、不碰数据库；取数据由 MCP 服务传进来。

import {
  type AssetData,
  type AssetRelationType,
  type AssetStatus,
  type AssetType,
  type GraphNodeType,
  type PromptAssetData,
  normalizeGraphNodeMetadata,
  normalizeRuleMetadata,
  readAssetRelations,
} from "../data/assets.ts";
import { DEFAULT_PROJECT_ID, type ProjectData } from "../data/projects.ts";
import { analyzeNodeImpact, buildNodePath, listProjectGraphNodes } from "./graph-node.ts";

export const mcpSearchLimits = {
  defaultLimit: 10,
  maxLimit: 50,
} as const;

export type McpAssetSummary = {
  assetId: string;
  assetType: AssetType;
  title: string;
  status: AssetStatus;
  summary: string;
  updatedAt: string;
};

export type McpAssetDetail = McpAssetSummary & {
  content: string;
  metadata: AssetData["metadata"];
  outgoing: McpRelationEntry[];
  incoming: McpRelationEntry[];
};

export type McpRelationEntry = {
  assetId: string;
  title: string;
  assetType: AssetType;
  relationType?: AssetRelationType;
  note?: string;
  // 间接影响是通过谁串起来的
  via?: string[];
};

export type McpRuleResult = McpAssetSummary & {
  ruleType: string;
  scope: string;
  level: string;
  purpose: string;
  rationale: string;
  sourceExcerpt: string;
  content: string;
};

export type McpNodeResult = McpAssetSummary & {
  code: string;
  nodeType: GraphNodeType;
  path: string[];
  note: string;
  content: string;
};

export type McpPromptResult = McpAssetSummary & {
  category: string;
  tags: string[];
  useCase: string;
  content: string;
};

export type McpImpactResult = {
  node: McpNodeResult;
  outgoing: McpRelationEntry[];
  incoming: McpRelationEntry[];
  indirect: McpRelationEntry[];
};

// 项目可以用标识、完整名称或名称里的一段来找；都没给就用默认项目
export function resolveProject(
  projects: ProjectData[],
  reference?: string,
): ProjectData | null {
  const trimmed = reference?.trim() ?? "";
  const active = projects.filter((project) => project.archivedAt === null);

  if (!trimmed) {
    return (
      active.find((project) => project.id === DEFAULT_PROJECT_ID) ??
      active[0] ??
      projects[0] ??
      null
    );
  }

  const byId = projects.find((project) => project.id === trimmed);

  if (byId) {
    return byId;
  }

  const byName = projects.find((project) => project.name === trimmed);

  if (byName) {
    return byName;
  }

  const keyword = trimmed.toLowerCase();
  const matched = active.filter((project) =>
    project.name.toLowerCase().includes(keyword),
  );

  // 名字只对上一部分时不猜，让调用方把名字写清楚
  return matched.length === 1 ? matched[0] : null;
}

// 默认不列归档内容，也不列垃圾箱里的东西；要历史就显式传 includeArchived
export function listProjectAssets(
  assets: AssetData[],
  projectId: string,
  options: { includeArchived?: boolean } = {},
) {
  return assets.filter(
    (asset) =>
      asset.projectId === projectId &&
      asset.deletedAt === null &&
      (options.includeArchived || asset.status !== "archived"),
  );
}

export function summarizeAsset(asset: AssetData): McpAssetSummary {
  return {
    assetId: asset.id,
    assetType: asset.assetType,
    title: asset.title,
    status: asset.status,
    summary: asset.summary,
    updatedAt: asset.updatedAt,
  };
}

function matchesKeyword(asset: AssetData, keyword: string) {
  const haystack = [
    asset.title,
    asset.summary,
    asset.content,
    JSON.stringify(asset.metadata),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(keyword);
}

export function searchPromptAssets(
  assets: AssetData[],
  projectId: string,
  options: { query?: string; tag?: string; limit?: number } = {},
): McpPromptResult[] {
  const keyword = options.query?.trim().toLowerCase() ?? "";
  const tag = options.tag?.trim() ?? "";
  const limit = Math.min(
    Math.max(1, options.limit ?? mcpSearchLimits.defaultLimit),
    mcpSearchLimits.maxLimit,
  );

  return listProjectAssets(assets, projectId)
    .filter((asset): asset is PromptAssetData => asset.assetType === "prompt")
    .filter((asset) => (tag ? asset.metadata.tags.includes(tag) : true))
    .filter((asset) => (keyword ? matchesKeyword(asset, keyword) : true))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit)
    .map((asset) => ({
      ...summarizeAsset(asset),
      category: asset.metadata.category,
      tags: [...asset.metadata.tags],
      useCase: asset.metadata.useCase,
      content: asset.content,
    }));
}

// 资产可以用标识、完整标题或标题里的一段来找，多义时返回 null
export function findAsset(assets: AssetData[], reference: string) {
  const trimmed = reference.trim();

  if (!trimmed) {
    return null;
  }

  const byId = assets.find((asset) => asset.id === trimmed);

  if (byId) {
    return byId;
  }

  const byTitle = assets.find((asset) => asset.title === trimmed);

  if (byTitle) {
    return byTitle;
  }

  const keyword = trimmed.toLowerCase();
  const matched = assets.filter(
    (asset) =>
      asset.deletedAt === null &&
      asset.title.toLowerCase().includes(keyword),
  );

  return matched.length === 1 ? matched[0] : null;
}

export function describeAsset(assets: AssetData[], asset: AssetData): McpAssetDetail {
  const outgoing: McpRelationEntry[] = [];
  const incoming: McpRelationEntry[] = [];

  for (const relation of readAssetRelations(asset.metadata)) {
    const target = assets.find((item) => item.id === relation.targetAssetId);

    if (!target) {
      continue;
    }

    outgoing.push({
      assetId: target.id,
      title: target.title,
      assetType: target.assetType,
      relationType: relation.relationType,
      note: relation.note,
    });
  }

  for (const item of assets) {
    if (item.id === asset.id || item.deletedAt !== null) {
      continue;
    }

    const relation = readAssetRelations(item.metadata).find(
      (entry) => entry.targetAssetId === asset.id,
    );

    if (!relation) {
      continue;
    }

    incoming.push({
      assetId: item.id,
      title: item.title,
      assetType: item.assetType,
      relationType: relation.relationType,
      note: relation.note,
    });
  }

  return {
    ...summarizeAsset(asset),
    content: asset.content,
    metadata: asset.metadata,
    outgoing,
    incoming,
  };
}

export function listRuleAssets(
  assets: AssetData[],
  projectId: string,
  options: {
    level?: string;
    ruleType?: string;
    scope?: string;
    query?: string;
  } = {},
): McpRuleResult[] {
  const keyword = options.query?.trim().toLowerCase() ?? "";

  return listProjectAssets(assets, projectId)
    .filter((asset) => asset.assetType === "rule")
    .filter((asset) => {
      const metadata = normalizeRuleMetadata(asset.metadata);

      if (options.level && metadata.level !== options.level) {
        return false;
      }

      if (options.ruleType && metadata.ruleType !== options.ruleType) {
        return false;
      }

      if (options.scope && metadata.scope !== options.scope) {
        return false;
      }

      return keyword ? matchesKeyword(asset, keyword) : true;
    })
    .sort((left, right) => left.title.localeCompare(right.title, "zh"))
    .map((asset) => {
      const metadata = normalizeRuleMetadata(asset.metadata);

      return {
        ...summarizeAsset(asset),
        ruleType: metadata.ruleType,
        scope: metadata.scope,
        level: metadata.level,
        purpose: metadata.purpose,
        rationale: metadata.rationale,
        sourceExcerpt: metadata.sourceExcerpt,
        content: asset.content,
      };
    });
}

export function listGraphNodeAssets(
  assets: AssetData[],
  projectId: string,
  nodeType?: GraphNodeType,
): McpNodeResult[] {
  const nodes = listProjectGraphNodes(assets, projectId);

  return nodes
    .filter((node) => (nodeType ? node.metadata.nodeType === nodeType : true))
    .map((node) => ({
      ...summarizeAsset(node),
      code: node.metadata.code,
      nodeType: node.metadata.nodeType,
      path: buildNodePath(nodes, node.id).map((item) => item.title),
      note: node.metadata.note,
      content: node.content,
    }));
}

// 图谱节点用编号或标题找；编号忽略大小写
export function findGraphNodeReference(
  assets: AssetData[],
  projectId: string,
  reference: string,
) {
  const nodes = listProjectGraphNodes(assets, projectId);
  const trimmed = reference.trim();

  if (!trimmed) {
    return null;
  }

  const byId = nodes.find((node) => node.id === trimmed);

  if (byId) {
    return byId;
  }

  const code = trimmed.toLocaleUpperCase();
  const byCode = nodes.find(
    (node) => node.metadata.code.toLocaleUpperCase() === code,
  );

  if (byCode) {
    return byCode;
  }

  const byTitle = nodes.find((node) => node.title === trimmed);

  if (byTitle) {
    return byTitle;
  }

  const keyword = trimmed.toLowerCase();
  const matched = nodes.filter((node) =>
    node.title.toLowerCase().includes(keyword),
  );

  return matched.length === 1 ? matched[0] : null;
}

export function analyzeNodeImpactByReference(
  assets: AssetData[],
  projectId: string,
  reference: string,
): McpImpactResult | null {
  const node = findGraphNodeReference(assets, projectId, reference);

  if (!node) {
    return null;
  }

  const impact = analyzeNodeImpact({ node, assets });
  const nodes = listProjectGraphNodes(assets, projectId);
  const toEntry = (entry: (typeof impact.outgoing)[number]): McpRelationEntry => ({
    assetId: entry.asset.id,
    title: entry.asset.title,
    assetType: entry.asset.assetType,
    relationType: entry.relationType,
    note: entry.note,
    ...(entry.via && entry.via.length > 0 ? { via: entry.via } : {}),
  });

  return {
    node: {
      ...summarizeAsset(node),
      code: normalizeGraphNodeMetadata(node.metadata).code,
      nodeType: normalizeGraphNodeMetadata(node.metadata).nodeType,
      path: buildNodePath(nodes, node.id).map((item) => item.title),
      note: normalizeGraphNodeMetadata(node.metadata).note,
      content: node.content,
    },
    outgoing: impact.outgoing.map(toEntry),
    incoming: impact.incoming.map(toEntry),
    indirect: impact.indirect.map(toEntry),
  };
}
