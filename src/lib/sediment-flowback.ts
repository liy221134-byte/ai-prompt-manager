// 沉淀回流：把项目里攒下来的资产「升」到公共资产库，并跟踪两边有没有分叉。
// 只做纯逻辑，不碰数据库：写库、拉版本由界面按计划执行。

import type { AssetData, AssetRelation } from "../data/assets.ts";

// 「同源」标记写在关系备注里，靠它认出公共那条和项目那条是一对
export function buildOriginNote(projectName: string) {
  return `同源：${projectName}`;
}

export function readOriginLink(asset: AssetData, note: string) {
  return readRelations(asset).find((relation) => relation.note === note) ?? null;
}

function readRelations(asset: AssetData) {
  const relations = (asset.metadata as { relations?: unknown }).relations;

  return Array.isArray(relations) ? (relations as AssetRelation[]) : [];
}

export type PromotePlan =
  | {
      kind: "promote";
      // 要写进公共资产库的那一条（新标识，正文原样）
      publicAssetId: string;
      // 项目里那条要补的关系（指向公共那条）
      projectRelation: AssetRelation;
      // 公共那条要写的关系（指回项目那条）
      publicRelation: AssetRelation;
    }
  | { kind: "skipped"; reason: string };

// 提升计划：项目里的资产复制一份进公共库，两边各记一条「同源」关系。
// 不删不改项目里那份；已经提升过的会给出原因，避免重复升。
export function planPromoteToPublic(input: {
  asset: AssetData;
  projectName: string;
  createId: () => string;
}): PromotePlan {
  const note = buildOriginNote(input.projectName);

  if (input.asset.assetType === "prompt") {
    return {
      kind: "skipped",
      reason: "提示词本来就是账号级的，不需要提升；只有规则、文档、模板和图谱节点需要。",
    };
  }

  if (readOriginLink(input.asset, note)) {
    return {
      kind: "skipped",
      reason: "这条已经提升到公共资产库了，去公共库对应那条改就行。",
    };
  }

  return {
    kind: "promote",
    publicAssetId: input.createId(),
    projectRelation: {
      targetAssetId: "", // 由调用方填公共那条的标识
      relationType: "reference",
      note,
    },
    publicRelation: {
      targetAssetId: input.asset.id,
      relationType: "reference",
      note,
    },
  };
}

export type UpstreamState = {
  // 公共库里对应的那条
  upstream: AssetData | null;
  // 公共那条比项目这条新
  hasUpdate: boolean;
  upstreamUpdatedAt: string | null;
};

// 上游状态：顺着「同源」关系找到公共那条，比一下更新时间。
// 只读，不写任何东西——要不要拉，由人决定。
export function readUpstreamState(input: {
  asset: AssetData;
  projectName: string;
  assets: AssetData[];
}): UpstreamState {
  const link = readOriginLink(input.asset, buildOriginNote(input.projectName));

  if (!link) {
    return { upstream: null, hasUpdate: false, upstreamUpdatedAt: null };
  }

  const upstream =
    input.assets.find(
      (asset) => asset.id === link.targetAssetId && asset.deletedAt === null,
    ) ?? null;

  if (!upstream) {
    return { upstream: null, hasUpdate: false, upstreamUpdatedAt: null };
  }

  return {
    upstream,
    hasUpdate:
      new Date(upstream.updatedAt).getTime() >
      new Date(input.asset.updatedAt).getTime(),
    upstreamUpdatedAt: upstream.updatedAt,
  };
}

export type SedimentCheckup = {
  // 只在某个项目里出现、还没提升过的规则
  projectOnlyRules: Array<{ projectId: string; asset: AssetData }>;
  // 标题和公共库重复的项目资产
  duplicateTitles: Array<{ asset: AssetData; publicAsset: AssetData }>;
  // 公共库里长期没更新的资产
  stalePublicAssets: Array<{ asset: AssetData; daysSinceUpdate: number }>;
};

// 沉淀体检：只读，给三条线索，不做任何自动动作。
export function listSedimentCheckup(input: {
  assets: AssetData[];
  publicProjectId: string;
  projects: Array<{ id: string; name: string }>;
  now: string;
  staleDays?: number;
}): SedimentCheckup {
  const staleDays = input.staleDays ?? 90;
  const alive = input.assets.filter((asset) => asset.deletedAt === null);
  const publicAssets = alive.filter(
    (asset) => asset.projectId === input.publicProjectId,
  );
  const publicByTitle = new Map(
    publicAssets.map((asset) => [asset.title.trim(), asset]),
  );
  const projectNameById = new Map(
    input.projects.map((project) => [project.id, project.name]),
  );

  const projectOnlyRules = alive
    .filter(
      (asset) =>
        asset.assetType === "rule" &&
        asset.projectId !== input.publicProjectId &&
        !readOriginLink(
          asset,
          buildOriginNote(projectNameById.get(asset.projectId) ?? ""),
        ),
    )
    .map((asset) => ({ projectId: asset.projectId, asset }));

  const duplicateTitles = alive
    .filter(
      (asset) =>
        asset.projectId !== input.publicProjectId &&
        publicByTitle.has(asset.title.trim()),
    )
    .map((asset) => ({
      asset,
      publicAsset: publicByTitle.get(asset.title.trim())!,
    }));

  const nowTime = new Date(input.now).getTime();
  const stalePublicAssets = publicAssets
    .map((asset) => ({
      asset,
      daysSinceUpdate: Math.floor(
        (nowTime - new Date(asset.updatedAt).getTime()) / 86_400_000,
      ),
    }))
    .filter((entry) => entry.daysSinceUpdate >= staleDays)
    .sort((left, right) => right.daysSinceUpdate - left.daysSinceUpdate);

  return { projectOnlyRules, duplicateTitles, stalePublicAssets };
}
