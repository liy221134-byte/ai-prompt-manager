// 项目图谱的纯逻辑：节点树、路径、编号查重、影响分析。
// 图谱是只读的组织层——建节点和建关系仍然走资产编辑器和通用关系字段。

import {
  readAssetRelations,
  type AssetData,
  type AssetRelationType,
  type GraphNodeAssetData,
  type GraphNodeType,
} from "../data/assets.ts";

export type GraphNodeTree = {
  roots: GraphNodeAssetData[];
  childrenOf: Map<string, GraphNodeAssetData[]>;
};

export type NodeImpactEntry = {
  asset: AssetData;
  // 直接关系写关系类型；间接影响写是通过谁串起来的
  relationType?: AssetRelationType;
  note?: string;
  via?: string[];
};

export type NodeImpact = {
  // 这个节点指向谁
  outgoing: NodeImpactEntry[];
  // 谁指向这个节点
  incoming: NodeImpactEntry[];
  // 沿依赖链再走一层：依赖「指向我的东西」的那些资产
  indirect: NodeImpactEntry[];
};

function sortByCode(nodes: GraphNodeAssetData[]) {
  return [...nodes].sort(
    (left, right) =>
      left.metadata.code.localeCompare(right.metadata.code, "en") ||
      left.title.localeCompare(right.title, "zh"),
  );
}

// 图谱里只放活跃、没进垃圾箱的节点；归档和垃圾箱内容不出现
export function listProjectGraphNodes(
  assets: AssetData[],
  projectId: string,
) {
  return sortByCode(
    assets.filter(
      (asset): asset is GraphNodeAssetData =>
        asset.assetType === "graph_node" &&
        asset.projectId === projectId &&
        asset.deletedAt === null &&
        asset.status === "active",
    ),
  );
}

export function listProjectGraphNodesByType(
  assets: AssetData[],
  projectId: string,
  nodeType: GraphNodeType,
) {
  return listProjectGraphNodes(assets, projectId).filter(
    (node) => node.metadata.nodeType === nodeType,
  );
}

// 同一个项目、同一类型里编号必须唯一；返回占用这个编号的其它节点
export function findNodeWithSameCode(
  nodes: GraphNodeAssetData[],
  input: { id: string; nodeType: GraphNodeType; code: string },
) {
  const code = input.code.trim().toLocaleUpperCase();

  if (!code) {
    return null;
  }

  return (
    nodes.find(
      (node) =>
        node.id !== input.id &&
        node.metadata.nodeType === input.nodeType &&
        node.metadata.code.trim().toLocaleUpperCase() === code,
    ) ?? null
  );
}

// 把扁平节点按父节点组装成树；父节点不在列表里（被归档或删掉）的节点按根处理
export function buildGraphTree(nodes: GraphNodeAssetData[]): GraphNodeTree {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const childrenOf = new Map<string, GraphNodeAssetData[]>();
  const roots: GraphNodeAssetData[] = [];

  for (const node of nodes) {
    const parentId = node.metadata.parentId;
    const parent = parentId ? byId.get(parentId) : null;

    if (!parent) {
      roots.push(node);
      continue;
    }

    childrenOf.set(parent.id, [...(childrenOf.get(parent.id) ?? []), node]);
  }

  for (const [key, children] of childrenOf) {
    childrenOf.set(key, sortByCode(children));
  }

  return { roots: sortByCode(roots), childrenOf };
}

// 从根到自己的完整路径（节点详情里显示）
export function buildNodePath(
  nodes: GraphNodeAssetData[],
  nodeId: string,
): GraphNodeAssetData[] {
  const byId = new Map(nodes.map((item) => [item.id, item]));
  const path: GraphNodeAssetData[] = [];
  const visited = new Set<string>();
  let current = byId.get(nodeId) ?? null;

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current);

    const parentId = current.metadata.parentId;
    current = parentId ? (byId.get(parentId) ?? null) : null;
  }

  return path;
}

function resolveAsset(assets: AssetData[], assetId: string) {
  return assets.find((asset) => asset.id === assetId) ?? null;
}

// 影响分析：出向（我指向谁）、入向（谁指向我）、间接（谁指向「指向我的东西」）
export function analyzeNodeImpact(input: {
  node: GraphNodeAssetData;
  assets: AssetData[];
}): NodeImpact {
  const { node, assets } = input;
  const outgoing: NodeImpactEntry[] = [];
  const incoming: NodeImpactEntry[] = [];
  const indirect: NodeImpactEntry[] = [];
  const seenDirectIds = new Set<string>([node.id]);
  const seenIncomingIds = new Set<string>();

  for (const relation of readAssetRelations(node.metadata)) {
    const target = resolveAsset(assets, relation.targetAssetId);

    if (!target) {
      continue;
    }

    outgoing.push({
      asset: target,
      relationType: relation.relationType,
      note: relation.note,
    });
    seenDirectIds.add(target.id);
  }

  for (const asset of assets) {
    if (asset.id === node.id || asset.deletedAt !== null) {
      continue;
    }

    const relation = readAssetRelations(asset.metadata).find(
      (item) => item.targetAssetId === node.id,
    );

    if (!relation) {
      continue;
    }

    incoming.push({
      asset,
      relationType: relation.relationType,
      note: relation.note,
    });
    seenIncomingIds.add(asset.id);
  }

  // 二层：谁指向「指向我的资产」，用于看改动会顺着依赖链波及谁
  for (const asset of assets) {
    if (
      asset.id === node.id ||
      asset.deletedAt !== null ||
      seenIncomingIds.has(asset.id) ||
      seenDirectIds.has(asset.id)
    ) {
      continue;
    }

    const relation = readAssetRelations(asset.metadata).find((item) =>
      seenIncomingIds.has(item.targetAssetId),
    );

    if (!relation) {
      continue;
    }

    const via = incoming.find(
      (entry) => entry.asset.id === relation.targetAssetId,
    );

    indirect.push({
      asset,
      relationType: relation.relationType,
      note: relation.note,
      via: via ? [via.asset.title] : [],
    });
  }

  return { outgoing, incoming, indirect };
}
