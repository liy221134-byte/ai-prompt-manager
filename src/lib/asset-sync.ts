// 本地 ↔ 云端定期同步（方案 A）：两边各存一份全量，按资产比时间。
//
// 三条纪律（2026-09-24 产品负责人拍板）：
//   1. 只增不删：同步不做物理删除；删除状态（deletedAt）本身照常同步。
//   2. 谁新谁赢：同一条资产两边都有时，按 updatedAt 判断；新的那一份覆盖旧的，
//      被覆盖的内容留在那一侧的版本记录里，能回退。
//   3. 判不出来就留：时间一样但内容不同 → 两边都不动，列进待裁决清单，由人决定。
//
// 只带「当前内容」：同步以资产主行为准，历史版本不跟着走（备份本来也不含历史版本）。

import type { AssetData } from "../data/assets.ts";
import type { ProjectData } from "../data/projects.ts";

export type SyncDirection = "both" | "pull" | "push";

export type AssetSyncConflict = {
  local: AssetData;
  cloud: AssetData;
};

export type AssetSyncPlan = {
  // 本机 → 云端
  assetsToPush: AssetData[];
  // 云端 → 本机
  assetsToPull: AssetData[];
  // 时间一样、内容不同：两边都留，等人裁决
  conflicts: AssetSyncConflict[];
  // 两边一模一样、不用动的条数
  unchanged: number;
  projectsToCreateLocally: ProjectData[];
  projectsToCreateRemotely: ProjectData[];
};

function readTime(value: string) {
  const time = Date.parse(value);

  return Number.isNaN(time) ? 0 : time;
}

// 「内容一样」只比会变的部分：标题、说明、正文、状态、元数据和删除标记。
// created_at / updated_at / current_version_id 这些每次写入都会变，不参与比较。
// 元数据来自两套存储（本机是 JSON 文本、云端是 jsonb），**键的顺序可能不同**，
// 比较前必须先按键排序，否则会出现「内容一样却被判成冲突」。
function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value) ?? "null";
}

export function isSameAssetContent(left: AssetData, right: AssetData) {
  return (
    left.title === right.title &&
    left.summary === right.summary &&
    left.content === right.content &&
    left.status === right.status &&
    left.projectId === right.projectId &&
    left.deletedAt === right.deletedAt &&
    stableJson(left.metadata) === stableJson(right.metadata)
  );
}

export function planAssetSync(input: {
  localProjects: ProjectData[];
  localAssets: AssetData[];
  cloudProjects: ProjectData[];
  cloudAssets: AssetData[];
  direction?: SyncDirection;
}): AssetSyncPlan {
  const direction = input.direction ?? "both";
  const canPush = direction === "both" || direction === "push";
  const canPull = direction === "both" || direction === "pull";
  const localById = new Map(input.localAssets.map((asset) => [asset.id, asset]));
  const cloudById = new Map(input.cloudAssets.map((asset) => [asset.id, asset]));
  const plan: AssetSyncPlan = {
    assetsToPush: [],
    assetsToPull: [],
    conflicts: [],
    unchanged: 0,
    projectsToCreateLocally: [],
    projectsToCreateRemotely: [],
  };

  for (const local of input.localAssets) {
    const cloud = cloudById.get(local.id);

    if (!cloud) {
      if (canPush) {
        plan.assetsToPush.push(local);
      }

      continue;
    }

    if (isSameAssetContent(local, cloud)) {
      plan.unchanged += 1;
      continue;
    }

    const localTime = readTime(local.updatedAt);
    const cloudTime = readTime(cloud.updatedAt);

    if (localTime === cloudTime) {
      plan.conflicts.push({ local, cloud });
      continue;
    }

    if (localTime > cloudTime) {
      if (canPush) {
        plan.assetsToPush.push(local);
      }
    } else if (canPull) {
      plan.assetsToPull.push(cloud);
    }
  }

  for (const cloud of input.cloudAssets) {
    if (localById.has(cloud.id)) {
      continue;
    }

    if (canPull) {
      plan.assetsToPull.push(cloud);
    }
  }

  const localProjectIds = new Set(input.localProjects.map((project) => project.id));
  const cloudProjectIds = new Set(input.cloudProjects.map((project) => project.id));

  if (canPull) {
    plan.projectsToCreateLocally = input.cloudProjects.filter(
      (project) => !localProjectIds.has(project.id),
    );
  }

  if (canPush) {
    plan.projectsToCreateRemotely = input.localProjects.filter(
      (project) => !cloudProjectIds.has(project.id),
    );
  }

  return plan;
}
