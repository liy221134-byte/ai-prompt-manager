// 规则引用模型（v2.18.0）：项目不再各存一份公共规则的副本。
//
// 项目怎么表达「我在用公共库里的这套规则」：项目里有一条 `rule_pack` 资产（装包时生成）。
// 规则正文只保留在**公共资产库**那份，读项目的规则时把引用的包在公共库里的成员一起算上——
// 公共库改一处，所有引用它的项目立刻跟着变。
//
// 项目自己写的规则（没有包来源）仍然留在项目里，属于项目专属。
// 老数据里已经复制进项目的那份副本，如果公共库里还有同一个包内编号的正本，
// 就不再重复显示（正本优先）——这样历史项目和引用模型可以并存。

import type {
  AssetData,
  RuleAssetData,
  RulePackAssetData,
} from "../data/assets.ts";
import { readAssetPackLink } from "./rule-pack.ts";

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

// 项目当前生效的规则：项目自己的 + 引用包在公共库里的成员。
// 同一份规则（同一个包内编号）只出现一次，公共库那份优先。
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
  // 项目里那份副本跟公共库正本重复时不再显示（正本优先），避免同一条规则出现两次
  const projectOnlyRules = ownRules.filter((rule) => {
    const link = readAssetPackLink(rule.metadata);

    return link === null || !publicItemIds.has(link.packItemId);
  });

  return [
    ...projectOnlyRules.map((rule) => ({
      rule,
      fromPublic: false,
      packTitle: "",
    })),
    ...publicMembers.map((rule) => ({
      rule,
      fromPublic: true,
      packTitle:
        packTitleById.get(readAssetPackLink(rule.metadata)?.packId ?? "") ?? "",
    })),
  ];
}

// 项目专属规则：没有包来源的那些，用来判断「这条规则只属于这个项目」
export function listProjectOnlyRules(
  assets: AssetData[],
  projectId: string,
): RuleAssetData[] {
  return assets.filter(
    (asset): asset is RuleAssetData =>
      asset.assetType === "rule" &&
      asset.projectId === projectId &&
      isLive(asset) &&
      readAssetPackLink(asset.metadata) === null,
  );
}
