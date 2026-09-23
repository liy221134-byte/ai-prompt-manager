// 规则包相关的纯逻辑：成员反查、按包筛选、安装计划、导出成包文件。
// 不碰数据库，方便测试，也方便本地和云端共用。

import {
  createInitialAssetVersionId,
  isAssetRelationList,
  type AssetData,
  type AssetPackLink,
  type RulePackAssetData,
} from "../data/assets.ts";
import {
  createRulePackFile,
  type RulePackFile,
  type RulePackFileMember,
  type RulePackFilePack,
} from "./seed-pack-import.ts";

export type ProjectPackOption = {
  packId: string;
  title: string;
  memberCount: number;
};

export type RulePackInstallPlan = {
  assetsToCreate: AssetData[];
  skipped: Array<{ packItemId: string; title: string }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// 成员的「来自哪个包」记在元数据上，读取统一走这里
export function readAssetPackLink(metadata: unknown): AssetPackLink | null {
  if (!isRecord(metadata)) {
    return null;
  }

  const pack = metadata.pack;

  if (
    !isRecord(pack) ||
    typeof pack.packId !== "string" ||
    !pack.packId ||
    typeof pack.packItemId !== "string" ||
    !pack.packItemId
  ) {
    return null;
  }

  return {
    packId: pack.packId,
    packItemId: pack.packItemId,
    packVersion: typeof pack.packVersion === "string" ? pack.packVersion : "",
    packAssetType:
      typeof pack.packAssetType === "string" ? pack.packAssetType : "",
    projectScale: Array.isArray(pack.projectScale)
      ? pack.projectScale.filter((item): item is AssetPackLink["projectScale"][number] =>
          typeof item === "string",
        )
      : [],
  };
}

// 包的全部成员（跨项目），垃圾箱里的不算
export function listPackMembers(assets: AssetData[], packId: string) {
  return assets.filter((asset) => {
    if (asset.deletedAt !== null) {
      return false;
    }

    return readAssetPackLink(asset.metadata)?.packId === packId;
  });
}

// 安装用成员：同一个包内编号只留一份，优先取包所在项目里的那本，
// 免得装到第三个项目时把同一个编号算成好几条。
export function listPackMembersForInstall(
  assets: AssetData[],
  packId: string,
  preferredProjectId: string,
) {
  const byItemId = new Map<string, AssetData>();

  for (const asset of listPackMembers(assets, packId)) {
    const link = readAssetPackLink(asset.metadata);

    if (!link) {
      continue;
    }

    const current = byItemId.get(link.packItemId);
    const isPreferred = asset.projectId === preferredProjectId;
    const currentIsPreferred = current?.projectId === preferredProjectId;

    if (!current || (isPreferred && !currentIsPreferred)) {
      byItemId.set(link.packItemId, asset);
    }
  }

  return [...byItemId.values()];
}

// 当前项目里装过哪些包，供筛选下拉使用
export function listProjectPacks(assets: AssetData[], projectId: string) {
  const counts = new Map<string, number>();

  for (const asset of assets) {
    if (asset.projectId !== projectId || asset.deletedAt !== null) {
      continue;
    }

    const link = readAssetPackLink(asset.metadata);

    if (!link) {
      continue;
    }

    counts.set(link.packId, (counts.get(link.packId) ?? 0) + 1);
  }

  const options: ProjectPackOption[] = [];

  for (const [packId, memberCount] of counts) {
    const pack = assets.find(
      (asset) => asset.id === packId && asset.assetType === "rule_pack",
    );

    options.push({
      packId,
      title: pack?.title ?? packId,
      memberCount,
    });
  }

  return options.sort((left, right) => left.title.localeCompare(right.title, "zh"));
}

// 库里的资产转成规则包成员（导出和安装计划共用）
export function toRulePackMember(asset: AssetData): RulePackFileMember {
  return {
    id: asset.id,
    assetType: asset.assetType,
    title: asset.title,
    summary: asset.summary,
    content: asset.content,
    metadata: asset.metadata,
    status: asset.status,
  };
}

// 导出：把库里的包和成员整理成可再导入的包文件。
// 同一个包内编号只导出一次（装到多个项目时成员会有多份）。
export function createRulePackFileFromAssets(input: {
  pack: RulePackAssetData;
  members: AssetData[];
  exportedAt: string;
}): RulePackFile {
  const seen = new Set<string>();
  const members: RulePackFileMember[] = [];

  for (const asset of input.members) {
    const link = readAssetPackLink(asset.metadata);

    if (!link || seen.has(link.packItemId)) {
      continue;
    }

    seen.add(link.packItemId);
    members.push(toRulePackMember(asset));
  }

  const pack: RulePackFilePack = {
    id: input.pack.id,
    title: input.pack.title,
    summary: input.pack.summary,
    content: input.pack.content,
    metadata: {
      packVersion: input.pack.metadata.packVersion,
      packConfidence: input.pack.metadata.packConfidence,
      projectScale: [...input.pack.metadata.projectScale],
      sourceNote: input.pack.metadata.sourceNote,
    },
    status: input.pack.status,
  };

  return createRulePackFile({
    pack,
    members,
    exportedAt: input.exportedAt,
  });
}

// 安装到项目：按「项目 + 包 + 包内编号」去重；成员标识被别的项目占用时加序号后缀。
// 一条成员都没新增时返回空计划，界面只需要提示「已装过」。
export function planRulePackInstall(input: {
  pack: RulePackAssetData;
  members: RulePackFileMember[];
  existingAssets: AssetData[];
  targetProjectId: string;
  now: string;
}): RulePackInstallPlan {
  const installedKeys = new Set(
    input.existingAssets
      .map((asset) => ({
        asset,
        link: readAssetPackLink(asset.metadata),
      }))
      .filter((item) => item.link !== null)
      .map(
        (item) =>
          `${item.asset.projectId}:${item.link!.packId}:${item.link!.packItemId}`,
      ),
  );
  const usedIds = new Set(input.existingAssets.map((asset) => asset.id));
  const idMap = new Map<string, string>();
  const skipped: Array<{ packItemId: string; title: string }> = [];
  const planned: Array<{ member: RulePackFileMember; id: string }> = [];
  const seenItemIds = new Set<string>();

  for (const member of input.members) {
    const link = readAssetPackLink(member.metadata);

    if (!link) {
      skipped.push({ packItemId: member.id, title: member.title });
      continue;
    }

    // 同一个包内编号只处理一次（成员可能已经装在多个项目里）
    if (seenItemIds.has(link.packItemId)) {
      continue;
    }

    seenItemIds.add(link.packItemId);

    const key = `${input.targetProjectId}:${input.pack.id}:${link.packItemId}`;

    if (installedKeys.has(key)) {
      skipped.push({ packItemId: link.packItemId, title: member.title });
      continue;
    }

    let id = member.id;
    let suffix = 2;

    while (usedIds.has(id)) {
      id = `${member.id}-${suffix}`;
      suffix += 1;
    }

    usedIds.add(id);
    idMap.set(member.id, id);
    planned.push({ member, id });
  }

  const assetsToCreate = planned.map(({ member, id }) => {
    const link = readAssetPackLink(member.metadata)!;
    const metadata: Record<string, unknown> = {
      ...(member.metadata as Record<string, unknown>),
      pack: {
        ...link,
        packId: input.pack.id,
        packVersion: input.pack.metadata.packVersion,
      },
    };
    const relations = metadata.relations;

    if (relations !== undefined && isAssetRelationList(relations)) {
      // 成员内部的关系要跟着新标识走，否则换项目后就断了
      metadata.relations = relations.map((relation) => ({
        ...relation,
        targetAssetId: idMap.get(relation.targetAssetId) ?? relation.targetAssetId,
      }));
    }

    return {
      id,
      projectId: input.targetProjectId,
      assetType: member.assetType,
      title: member.title,
      summary: member.summary,
      content: member.content,
      metadata,
      source: {
        sourceType: "import" as const,
        sourceAssetId: input.pack.id,
        importBatchId: null,
        originalFilename: null,
      },
      currentVersionId: createInitialAssetVersionId(id),
      status: member.status,
      archivedAt: null,
      deletedAt: null,
      deletedReason: null,
      createdAt: input.now,
      updatedAt: input.now,
    } as AssetData;
  });

  return { assetsToCreate, skipped };
}
