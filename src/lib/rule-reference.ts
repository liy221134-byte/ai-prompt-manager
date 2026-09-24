// 规则引用模型（v2.18.0，v2.20.0 收尾）：项目不再各存一份公共规则的副本。
//
// 项目怎么表达「我在用公共库里的这套规则」：项目里有一条 `rule_pack` 资产（装包时生成）。
// 规则正文只保留在**公共资产库**那份，读项目的规则时把引用的包在公共库里的成员一起算上——
// 公共库改一处，所有引用它的项目立刻跟着变。
//
// 两条做减法的口子（v2.20.0）：
//   - 排除清单：项目可以把包里个别规则排除掉，被排除的不进列表、不进规则编译。
//   - 脱钩：项目想把某条改成本项目专用时，另存一份副本出来，改它不影响公共库。
//
// 项目自己写的规则（没有包来源）仍然留在项目里，属于项目专属，脱钩副本也算项目专属。
// 老数据里已经复制进项目的那份副本，如果公共库里还有同一个包内编号的正本，
// 就不再重复显示（正本优先）——这样历史项目和引用模型可以并存。

import {
  createInitialAssetVersionId,
  type AssetData,
  type RuleAssetData,
  type RulePackAssetData,
} from "../data/assets.ts";
import {
  readAssetPackLink,
  readExcludedItemIds,
  readReferencedAssetIds,
} from "./rule-pack.ts";

export type ProjectRuleEntry = {
  rule: RuleAssetData;
  // 来自公共资产库（引用）还是项目自己的
  fromPublic: boolean;
  // 引用来的规则属于哪个包（界面上写来源用），项目自己的规则是空串
  packTitle: string;
};

function isLive(asset: AssetData) {
  return asset.deletedAt === null && asset.status === "active";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export type DetachedFrom = {
  // 脱钩自公共库哪条资产；v2.20.0 之前的老标记没有这一项，是空串
  sourceAssetId: string;
  // 那条资产属于哪个包的哪个编号；不属于任何包（从公共库直接挑进来的）时是空串
  packId: string;
  packItemId: string;
};

// 脱钩标记：这条项目规则是从公共库哪个包的哪条规则「另存为项目规则」出来的。
//
// 它对读取顺序有直接作用：带这个标记的副本顶掉公共库同一编号的正本；
// 没带标记的（老数据里装包时复制进来的那份）仍然被正本顶掉。
export function readDetachedFrom(metadata: unknown): DetachedFrom | null {
  if (!isRecord(metadata) || !isRecord(metadata.detachedFrom)) {
    return null;
  }

  const { sourceAssetId, packId, packItemId } = metadata.detachedFrom;
  const source = typeof sourceAssetId === "string" ? sourceAssetId : "";
  const pack = typeof packId === "string" ? packId : "";
  const item = typeof packItemId === "string" ? packItemId : "";

  // 两套标记认一套就算数：新的认来源资产，老的认包内编号
  if (!source && !(pack && item)) {
    return null;
  }

  return { sourceAssetId: source, packId: pack, packItemId: item };
}

function buildDetachedKey(entry: DetachedFrom) {
  return `${entry.packId}:${entry.packItemId}`;
}

// 项目引用了哪些公共包：项目里的规则包资产就是引用记录
export function listProjectReferencedPacks(
  assets: AssetData[],
  projectId: string,
): RulePackAssetData[] {
  return assets.filter(
    (asset): asset is RulePackAssetData =>
      asset.assetType === "rule_pack" &&
      asset.projectId === projectId &&
      isLive(asset),
  );
}

// 项目当前生效的规则：项目自己的 + 引用包在公共库里的成员，再按两条规则做减法。
//
// 1. 引用的包里被排除掉的编号不生效（排除清单记在项目的引用记录上，一个项目一份）。
// 2. 同一条规则只出现一次：脱钩副本顶掉公共正本；没有脱钩标记的老副本仍被正本顶掉。
export function listProjectRulesForUse(
  assets: AssetData[],
  input: { projectId: string; publicProjectId: string },
): ProjectRuleEntry[] {
  const live = assets.filter(isLive);
  const ownRules = live.filter(
    (asset): asset is RuleAssetData =>
      asset.assetType === "rule" && asset.projectId === input.projectId,
  );
  const referencedPacks = listProjectReferencedPacks(assets, input.projectId);

  if (referencedPacks.length === 0) {
    return ownRules.map((rule) => ({
      rule,
      fromPublic: false,
      packTitle: "",
    }));
  }

  const packTitleById = new Map(
    referencedPacks.map((pack) => [pack.metadata.packId ?? pack.id, pack.title]),
  );
  // 每个被引用的包各带一份排除清单，项目之间互不干扰
  const excludedByPackId = new Map(
    referencedPacks.map((pack) => [
      pack.metadata.packId ?? pack.id,
      new Set(readExcludedItemIds(pack.metadata)),
    ]),
  );
  // 已经脱钩的编号：公共正本要让位
  const detachedEntries = ownRules
    .map((rule) => readDetachedFrom(rule.metadata))
    .filter((entry): entry is DetachedFrom => entry !== null);
  const detachedKeys = new Set(
    detachedEntries
      .filter((entry) => entry.packId && entry.packItemId)
      .map(buildDetachedKey),
  );
  // 已经被本地副本顶掉的点名引用
  const detachedSourceIds = new Set(
    detachedEntries.map((entry) => entry.sourceAssetId).filter(Boolean),
  );
  const publicMembers = live.filter((asset): asset is RuleAssetData => {
    if (asset.assetType !== "rule") {
      return false;
    }

    if (asset.projectId !== input.publicProjectId) {
      return false;
    }

    const link = readAssetPackLink(asset.metadata);

    return link !== null && packTitleById.has(link.packId);
  });
  const publicItemIds = new Set(
    publicMembers
      .map((rule) => readAssetPackLink(rule.metadata)?.packItemId ?? "")
      .filter(Boolean),
  );
  const visiblePublicMembers = publicMembers.filter((rule) => {
    const link = readAssetPackLink(rule.metadata);

    if (!link) {
      return false;
    }

    if (excludedByPackId.get(link.packId)?.has(link.packItemId)) {
      return false;
    }

    return !detachedKeys.has(`${link.packId}:${link.packItemId}`);
  });
  // 引用记录里点名的公共资产（从公共库挑进来的规则）：和包无关，按标识直接取
  const pickedAssetIds = new Set(
    referencedPacks.flatMap((pack) => readReferencedAssetIds(pack.metadata)),
  );
  const visiblePublicMemberIds = new Set(
    visiblePublicMembers.map((rule) => rule.id),
  );
  const visiblePickedRules = live.filter(
    (asset): asset is RuleAssetData =>
      asset.assetType === "rule" &&
      asset.projectId === input.publicProjectId &&
      pickedAssetIds.has(asset.id) &&
      // 同一条既是包成员又被点名时只出现一次；脱钩之后让位给副本
      !visiblePublicMemberIds.has(asset.id) &&
      !detachedSourceIds.has(asset.id),
  );
  // 项目里那份副本跟公共库正本重复时不再显示（正本优先），避免同一条规则出现两次；
  // 主动脱钩的那份是例外——它已经是这个项目自己的规则了。
  const projectRules = ownRules.filter((rule) => {
    const link = readAssetPackLink(rule.metadata);

    if (link === null) {
      return true;
    }

    if (detachedKeys.has(`${link.packId}:${link.packItemId}`)) {
      return true;
    }

    return !publicItemIds.has(link.packItemId);
  });

  return [
    ...projectRules.map((rule) => ({
      rule,
      fromPublic: false,
      packTitle: "",
    })),
    ...visiblePublicMembers.map((rule) => ({
      rule,
      fromPublic: true,
      packTitle:
        packTitleById.get(readAssetPackLink(rule.metadata)?.packId ?? "") ?? "",
    })),
    ...visiblePickedRules.map((rule) => ({
      rule,
      fromPublic: true,
      // 挑进来的不属于某个包，界面上挂「公共库」角标就够了
      packTitle: "",
    })),
  ];
}

// 项目专属规则：没有包来源的那些，加上已经脱钩的副本。
// 用来判断「这条规则只属于这个项目」——沉淀体检读的就是这个口径。
export function listProjectOnlyRules(
  assets: AssetData[],
  projectId: string,
): RuleAssetData[] {
  return assets.filter(
    (asset): asset is RuleAssetData =>
      asset.assetType === "rule" &&
      asset.projectId === projectId &&
      isLive(asset) &&
      (readAssetPackLink(asset.metadata) === null ||
        readDetachedFrom(asset.metadata) !== null),
  );
}

export type DetachPlan =
  | { kind: "detach"; asset: RuleAssetData }
  | { kind: "skipped"; reason: string };

// 另存为项目规则：把一条引用来的规则复制成项目专属副本，之后改它不影响公共库，
// 也不影响别的引用同一个包的项目。
//
// 副本保留包链接（按包筛选、统计「这个项目装了哪些包」还要认它），
// 另加一条脱钩标记，供读取时判断该显示副本还是公共正本。
export function planDetachToProject(input: {
  rule: RuleAssetData;
  projectId: string;
  createId: () => string;
  now: string;
}): DetachPlan {
  if (readDetachedFrom(input.rule.metadata)) {
    return {
      kind: "skipped",
      reason: "这条已经脱钩成项目规则了，直接改就行。",
    };
  }

  // 只有「不在这个项目里」的规则才谈得上脱钩：
  // 它本来就在项目里，说明它就是这条，直接改即可。
  // 引用来的规则（包成员或从公共库挑进来的）都满足这一条。
  if (input.rule.projectId === input.projectId) {
    return {
      kind: "skipped",
      reason: "这条规则本来就是这个项目的，直接改就好，不用另存。",
    };
  }

  const link = readAssetPackLink(input.rule.metadata);
  const id = input.createId();

  return {
    kind: "detach",
    asset: {
      ...input.rule,
      id,
      projectId: input.projectId,
      currentVersionId: createInitialAssetVersionId(id),
      metadata: {
        ...input.rule.metadata,
        // 原关系指向公共库那份的标识，搬过来就是断的：清空，需要时自己重建
        relations: [],
        detachedFrom: {
          // 来源资产标识是主判据：从公共库直接挑进来的规则不一定属于某个包
          sourceAssetId: input.rule.id,
          ...(link
            ? { packId: link.packId, packItemId: link.packItemId }
            : {}),
        },
      },
      source: {
        sourceType: "manual",
        sourceAssetId: input.rule.id,
        importBatchId: null,
        originalFilename: null,
      },
      status: "active",
      archivedAt: null,
      deletedAt: null,
      deletedReason: null,
      createdAt: input.now,
      updatedAt: input.now,
    },
  };
}
