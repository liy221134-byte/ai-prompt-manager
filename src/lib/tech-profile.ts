// 技术档案的项目级规则：一个项目一份，偏离默认选型必须挂 ADR。

import type { AssetData, TechStackEntry } from "../data/assets.ts";

export const ADR_DOCUMENT_TYPE = "ADR";

export function validateTechStack(stack: TechStackEntry[]) {
  const named = stack.filter((entry) => entry.name.trim());

  if (named.length === 0) {
    return "请至少填写一项技术栈。";
  }

  const missingAdr = named.find(
    (entry) => entry.isDeviation && !entry.adrAssetId,
  );

  if (missingAdr) {
    return `「${missingAdr.name}」偏离了默认选型，需要先选一条 ADR 说明原因。`;
  }

  return null;
}

// 可以拿来关联的 ADR：同一项目里的、没进垃圾箱的 ADR 文档
export function listAdrCandidates(assets: AssetData[], projectId: string) {
  return assets.filter(
    (asset) =>
      asset.assetType === "document" &&
      asset.projectId === projectId &&
      !asset.deletedAt &&
      asset.metadata.documentType === ADR_DOCUMENT_TYPE,
  );
}

// 一个项目最多一份技术档案
export function findProjectTechProfile(assets: AssetData[], projectId: string) {
  return (
    assets.find(
      (asset) =>
        asset.assetType === "tech_profile" &&
        asset.projectId === projectId &&
        !asset.deletedAt,
    ) ?? null
  );
}
