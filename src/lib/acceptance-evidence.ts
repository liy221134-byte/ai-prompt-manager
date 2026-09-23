// 验收证据链的纯逻辑：验收记录的整理、一个需求节点有多少条验收、
// 以及「哪些需求还没有通过验收」。只算，不改，界面和 MCP 都用这一份口径。

import {
  type AssetData,
  type EvidenceAssetData,
  type GraphNodeAssetData,
  normalizeEvidenceMetadata,
} from "../data/assets.ts";
import { listProjectGraphNodes } from "./graph-node.ts";

export type EvidenceSummary = {
  total: number;
  passed: number;
  pending: number;
  failed: number;
  exception: number;
};

export function createEmptyEvidenceSummary(): EvidenceSummary {
  return { total: 0, passed: 0, pending: 0, failed: 0, exception: 0 };
}

// 只有「活跃、没进垃圾箱」的验收记录算数：草稿还没提交，归档表示不再用
export function listProjectEvidence(
  assets: AssetData[],
  projectId: string,
): EvidenceAssetData[] {
  return assets.filter(
    (asset): asset is EvidenceAssetData =>
      asset.assetType === "evidence" &&
      asset.projectId === projectId &&
      asset.status === "active" &&
      asset.deletedAt === null,
  );
}

export function readEvidenceConclusion(asset: EvidenceAssetData) {
  return normalizeEvidenceMetadata(asset.metadata).conclusion;
}

// 按需求节点汇总：这个需求验收了几次、几条通过
export function summarizeNodeEvidence(
  assets: AssetData[],
  projectId: string,
): Map<string, EvidenceSummary> {
  const summaryByNode = new Map<string, EvidenceSummary>();

  for (const record of listProjectEvidence(assets, projectId)) {
    const { nodeId, conclusion } = normalizeEvidenceMetadata(record.metadata);

    if (!nodeId) {
      continue;
    }

    const summary = summaryByNode.get(nodeId) ?? createEmptyEvidenceSummary();
    summary.total += 1;
    summary[conclusion] += 1;
    summaryByNode.set(nodeId, summary);
  }

  return summaryByNode;
}

export function describeNodeEvidence(
  assets: AssetData[],
  projectId: string,
  nodeId: string,
): EvidenceSummary {
  return (
    summarizeNodeEvidence(assets, projectId).get(nodeId) ??
    createEmptyEvidenceSummary()
  );
}

export function listEvidenceForNode(
  assets: AssetData[],
  projectId: string,
  nodeId: string,
) {
  return listProjectEvidence(assets, projectId)
    .filter(
      (record) =>
        normalizeEvidenceMetadata(record.metadata).nodeId === nodeId,
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

// 还没有通过验收的需求节点（按编号排序），工程基线拿它做覆盖缺口
export function listUnverifiedRequirements(
  assets: AssetData[],
  projectId: string,
): GraphNodeAssetData[] {
  const summaryByNode = summarizeNodeEvidence(assets, projectId);

  return listProjectGraphNodes(assets, projectId)
    .filter((node) => node.metadata.nodeType === "requirement")
    .filter((node) => (summaryByNode.get(node.id)?.passed ?? 0) === 0)
    .sort((left, right) =>
      left.metadata.code.localeCompare(right.metadata.code, "en"),
    );
}

// 出问题最多的需求先看：没有通过验收的排前面，其次未通过记录多的排前面
export function rankRequirementsByEvidence(
  assets: AssetData[],
  projectId: string,
) {
  const summaryByNode = summarizeNodeEvidence(assets, projectId);

  return listProjectGraphNodes(assets, projectId)
    .filter((node) => node.metadata.nodeType === "requirement")
    .map((node) => ({
      node,
      summary: summaryByNode.get(node.id) ?? createEmptyEvidenceSummary(),
    }))
    .sort((left, right) => {
      const leftUnverified = left.summary.passed === 0 ? 0 : 1;
      const rightUnverified = right.summary.passed === 0 ? 0 : 1;

      if (leftUnverified !== rightUnverified) {
        return leftUnverified - rightUnverified;
      }

      if (left.summary.failed !== right.summary.failed) {
        return right.summary.failed - left.summary.failed;
      }

      return left.node.metadata.code.localeCompare(
        right.node.metadata.code,
        "en",
      );
    });
}
