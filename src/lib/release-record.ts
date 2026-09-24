// 发布记录的纯逻辑：按质量等级预填门禁项、算门禁完成情况、找最近一次发布。
// 门禁项的角度是「这次上线要留下什么证据」，所以只提供服务，不替用户勾。
//
// 2026-09-24 起，发布记录就是「文档类型 = 发布记录」的项目文档：
// 正文写这次改了什么、遇到什么异常，版本、结果、回滚目标和门禁放元数据。

import {
  type AssetData,
  type DocumentAssetData,
  type ReleaseGateItem,
  type ReleaseRecordResult,
  readDocumentReleaseMetadata,
} from "../data/assets.ts";
import { listProjectReleaseDocuments } from "./document-flow.ts";
import { readQualityProfile } from "./quality-level.ts";

// 按等级把检查项变成门禁草稿：默认都没勾，等着人一项项做、一项项写证据
export function buildGateItemsFromLevel(level: unknown): ReleaseGateItem[] {
  return readQualityProfile(level).releaseChecks.map((label, index) => ({
    key: `gate-${index + 1}`,
    label,
    done: false,
    note: "",
  }));
}

export type ReleaseGateSummary = {
  total: number;
  done: number;
  pending: string[];
};

export function summarizeGates(gates: ReleaseGateItem[]): ReleaseGateSummary {
  const pending = gates
    .filter((gate) => !gate.done)
    .map((gate) => gate.label || gate.key);

  return {
    total: gates.length,
    done: gates.length - pending.length,
    pending,
  };
}

// 一次发布在界面上要用的全部信息：从发布记录文档的元数据里取，
// 没有元数据块（老数据）时按空值兜底，门禁清单为空。
export type ProjectRelease = {
  assetId: string;
  title: string;
  version: string;
  releasedAt: string;
  result: ReleaseRecordResult;
  rollbackTarget: string;
  gates: ReleaseGateItem[];
  updatedAt: string;
};

function documentToRelease(document: DocumentAssetData): ProjectRelease {
  const release = readDocumentReleaseMetadata(document.metadata);

  return {
    assetId: document.id,
    title: document.title,
    version: release?.version ?? "",
    releasedAt: release?.releasedAt ?? "",
    result: release?.result ?? "in_progress",
    rollbackTarget: release?.rollbackTarget ?? "",
    gates: release?.gates ?? [],
    updatedAt: document.updatedAt,
  };
}

// 发布记录只在「活跃、没进垃圾箱、要发的是这个项目」时参与比较
export function listProjectReleases(
  assets: AssetData[],
  projectId: string,
): ProjectRelease[] {
  return listProjectReleaseDocuments(assets, projectId).map(documentToRelease);
}

// 最近一次发布：先看发布日期，没写日期的用更新时间兜底
function releaseSortKey(release: ProjectRelease) {
  return release.releasedAt.trim() || release.updatedAt;
}

export function findLatestProjectRelease(
  assets: AssetData[],
  projectId: string,
): ProjectRelease | null {
  const releases = listProjectReleases(assets, projectId);

  if (releases.length === 0) {
    return null;
  }

  return releases.reduce((latest, current) =>
    releaseSortKey(current).localeCompare(releaseSortKey(latest)) > 0
      ? current
      : latest,
  );
}
