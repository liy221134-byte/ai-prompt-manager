// 发布记录的纯逻辑：按质量等级预填门禁项、算门禁完成情况、找最近一次发布。
// 门禁项的角度是「这次上线要留下什么证据」，所以只提供服务，不替用户勾。

import {
  type AssetData,
  type ReleaseGateItem,
  type ReleaseRecordAssetData,
  normalizeReleaseRecordMetadata,
} from "../data/assets.ts";
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

export function summarizeReleaseGates(record: ReleaseRecordAssetData) {
  return summarizeGates(normalizeReleaseRecordMetadata(record.metadata).gates);
}

// 发布记录只在「活跃、没进垃圾箱、要发的是这个项目」时参与比较
export function listProjectReleaseRecords(
  assets: AssetData[],
  projectId: string,
): ReleaseRecordAssetData[] {
  return assets.filter(
    (asset): asset is ReleaseRecordAssetData =>
      asset.assetType === "release_record" &&
      asset.projectId === projectId &&
      asset.status === "active" &&
      asset.deletedAt === null,
  );
}

// 最近一次发布：先看发布日期，没写日期的用更新时间兜底
function releaseSortKey(record: ReleaseRecordAssetData) {
  const { releasedAt } = normalizeReleaseRecordMetadata(record.metadata);

  return releasedAt.trim() || record.updatedAt;
}

export function findLatestReleaseRecord(
  assets: AssetData[],
  projectId: string,
): ReleaseRecordAssetData | null {
  const records = listProjectReleaseRecords(assets, projectId);

  if (records.length === 0) {
    return null;
  }

  return records.reduce((latest, current) =>
    releaseSortKey(current).localeCompare(releaseSortKey(latest)) > 0
      ? current
      : latest,
  );
}
