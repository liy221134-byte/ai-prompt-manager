// 工程导入的公共部分：草稿结构、编号查重、父节点与关系的物化。
// Schema 导入和代码目录扫描都只产出草稿，写库统一走这里，
// 保证两条来源在「编号唯一」「不覆盖已有节点」这些规则上完全一致。

import {
  type AssetRelation,
  type AssetRelationType,
  type GraphNodeAssetData,
  type GraphNodeType,
  createInitialAssetVersionId,
  normalizeGraphNodeMetadata,
} from "../data/assets.ts";

// 草稿之间先用编号互相引用，写库前才换成资产标识
export type GraphNodeImportRelation = {
  targetCode: string;
  relationType: AssetRelationType;
  note: string;
};

export type GraphNodeImportDraft = {
  id: string;
  nodeType: GraphNodeType;
  code: string;
  title: string;
  summary: string;
  content: string;
  note: string;
  // 来源说明：导入的 SQL 文件名或扫描的目录
  sourceLabel: string;
  // 父节点编号，限同一批导入的节点
  parentCode: string | null;
  relations: GraphNodeImportRelation[];
};

export type GraphNodeImportCandidate = GraphNodeImportDraft & {
  // 同项目同类型里已经有这个编号时指向那条资产，界面上标成「已存在」
  existingAssetId: string | null;
};

export function createGraphImportAssetId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `graph_node-${crypto.randomUUID()}`;
  }

  return `graph_node-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// 编号唯一的口径和编辑器一致：同项目、同类型、忽略大小写
function importCodeKey(nodeType: GraphNodeType, code: string) {
  return `${nodeType}:${code.trim().toLocaleUpperCase()}`;
}

// 把现有节点的编号建成索引，查重和解析关系都用它
function indexNodeCodes(nodes: GraphNodeAssetData[]) {
  const byKey = new Map<string, string>();

  for (const node of nodes) {
    if (node.assetType !== "graph_node" || node.deletedAt !== null) {
      continue;
    }

    const metadata = normalizeGraphNodeMetadata(node.metadata);
    const key = importCodeKey(metadata.nodeType, metadata.code);

    // 编号为空的节点不占位，也避免把空编号当成冲突
    if (metadata.code.trim() && !byKey.has(key)) {
      byKey.set(key, node.id);
    }
  }

  return byKey;
}

// 同编号的节点默认不导入：导入只补新的，不覆盖你已经改过的正文
export function markImportCandidates(
  drafts: GraphNodeImportDraft[],
  existingNodes: GraphNodeAssetData[],
): GraphNodeImportCandidate[] {
  const existingByKey = indexNodeCodes(existingNodes);

  return drafts.map((draft) => ({
    ...draft,
    existingAssetId:
      existingByKey.get(importCodeKey(draft.nodeType, draft.code)) ?? null,
  }));
}

// 把勾选的草稿变成资产：父节点和关系按编号解析，
// 同批里找不到就回落到现有节点，两边都没有这条关系就不建。
export function materializeImportAssets(input: {
  candidates: GraphNodeImportCandidate[];
  existingNodes: GraphNodeAssetData[];
  projectId: string;
  batchId: string;
  now: string;
}): GraphNodeAssetData[] {
  const idByKey = new Map<string, string>();

  for (const candidate of input.candidates) {
    idByKey.set(importCodeKey(candidate.nodeType, candidate.code), candidate.id);
  }

  for (const [key, id] of indexNodeCodes(input.existingNodes)) {
    if (!idByKey.has(key)) {
      idByKey.set(key, id);
    }
  }

  return input.candidates.map((candidate) => {
    const parentId = candidate.parentCode
      ? (idByKey.get(
          importCodeKey(candidate.nodeType, candidate.parentCode),
        ) ?? null)
      : null;
    const relations: AssetRelation[] = [];

    for (const relation of candidate.relations) {
      const targetAssetId = idByKey.get(
        importCodeKey(candidate.nodeType, relation.targetCode),
      );

      if (
        !targetAssetId ||
        targetAssetId === candidate.id ||
        relations.some((item) => item.targetAssetId === targetAssetId)
      ) {
        continue;
      }

      relations.push({
        targetAssetId,
        relationType: relation.relationType,
        note: relation.note.trim(),
      });
    }

    return {
      id: candidate.id,
      projectId: input.projectId,
      assetType: "graph_node",
      title: candidate.title.trim(),
      summary: candidate.summary.trim(),
      content: candidate.content.trim(),
      metadata: {
        nodeType: candidate.nodeType,
        code: candidate.code.trim(),
        parentId,
        note: candidate.note.trim(),
        ...(relations.length > 0 ? { relations } : {}),
      },
      source: {
        sourceType: "import",
        sourceAssetId: null,
        importBatchId: input.batchId,
        originalFilename: candidate.sourceLabel.trim() || null,
      },
      currentVersionId: createInitialAssetVersionId(candidate.id),
      status: "active",
      archivedAt: null,
      deletedAt: null,
      deletedReason: null,
      createdAt: input.now,
      updatedAt: input.now,
    } satisfies GraphNodeAssetData;
  });
}
