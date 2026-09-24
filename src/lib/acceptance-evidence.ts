// 验收证据链的纯逻辑：验收记录的整理、一个需求节点有多少条验收、
// 以及「哪些需求还没有通过验收」。只算，不改，界面和 MCP 都用这一份口径。
//
// 2026-09-24 起，验收记录就是「文档类型 = 验收记录」的项目文档：
// 正文写验收条件、步骤、结果，结论和提交版本放元数据；
// 「这份记录覆盖了哪些需求」看它指向的需求节点（资产关系）。
// 一版一份清单也行——那时一份文档会指向多条需求，每条需求都算验收过一次。

import {
  type AssetData,
  type DocumentAssetData,
  type GraphNodeAssetData,
  readAssetRelations,
  readDocumentEvidenceMetadata,
} from "../data/assets.ts";
import { listProjectAcceptanceDocuments } from "./document-flow.ts";
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
): DocumentAssetData[] {
  return listProjectAcceptanceDocuments(assets, projectId);
}

// 没填结论时按「待确认」算，和界面上显示的一致
export function readEvidenceConclusion(record: DocumentAssetData) {
  return readDocumentEvidenceMetadata(record.metadata)?.conclusion ?? "pending";
}

// 这份验收记录覆盖的需求节点。两个方向都认：
//   1）验收记录文档自己指向需求（这份清单覆盖这几条需求）；
//   2）需求节点指向这份验收记录（图谱里「批量挂文档」挂的就是这个方向）。
// 只认本项目的需求节点，别的项目、别的节点类型都不算。
function readCoveredRequirementIds(
  assets: AssetData[],
  projectId: string,
  record: DocumentAssetData,
) {
  const requirements = listProjectGraphNodes(assets, projectId).filter(
    (node) => node.metadata.nodeType === "requirement",
  );
  const requirementIds = new Set(requirements.map((node) => node.id));
  const covered = new Set(
    readAssetRelations(record.metadata)
      .map((relation) => relation.targetAssetId)
      .filter((targetId) => requirementIds.has(targetId)),
  );

  for (const node of requirements) {
    const pointsToRecord = readAssetRelations(node.metadata).some(
      (relation) => relation.targetAssetId === record.id,
    );

    if (pointsToRecord) {
      covered.add(node.id);
    }
  }

  return [...covered];
}

// 按需求节点汇总：这个需求验收了几次、几条通过
export function summarizeNodeEvidence(
  assets: AssetData[],
  projectId: string,
): Map<string, EvidenceSummary> {
  const summaryByNode = new Map<string, EvidenceSummary>();

  for (const record of listProjectEvidence(assets, projectId)) {
    const conclusion = readEvidenceConclusion(record);

    for (const nodeId of readCoveredRequirementIds(assets, projectId, record)) {
      const summary = summaryByNode.get(nodeId) ?? createEmptyEvidenceSummary();
      summary.total += 1;
      summary[conclusion] += 1;
      summaryByNode.set(nodeId, summary);
    }
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
    .filter((record) =>
      readCoveredRequirementIds(assets, projectId, record).includes(nodeId),
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
