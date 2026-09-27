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

// 规则的技术上下文取值，与 seed-packs/engineering-foundations/schema.md 保持一致。
// 这个字段本身是自由文本，所以这里显式列出来：只有认识的名字才算数，别的不猜。
export const knownTechContexts = [
  "generic",
  "nextjs",
  "supabase",
  "postgres",
  "vercel",
] as const;

export type KnownTechContext = (typeof knownTechContexts)[number];

// 技术栈里常见的写法 → 技术上下文取值。先归一化（小写、去掉空格和 . - _ /），再过这张表；
// 表里没有的就拿归一化后的名字直接比。
const techContextAliases: Record<string, KnownTechContext> = {
  next: "nextjs",
  postgresql: "postgres",
  pg: "postgres",
};

// 一条技术栈的名字能对上哪个技术上下文；对不上返回 null（不报错，只是不参与匹配）
export function readTechContextFromStackName(
  name: string,
): KnownTechContext | null {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[\s.\-_/]/g, "");

  if (!normalized) {
    return null;
  }

  const candidate = techContextAliases[normalized] ?? normalized;

  return (knownTechContexts as readonly string[]).includes(candidate)
    ? (candidate as KnownTechContext)
    : null;
}

// 这个项目的技术上下文集合：从那份活跃技术档案的技术栈清单里读。
// `generic` 不算一种「项目用了的技术」，去掉；认不出来的名字忽略。
// 返回空数组表示「不知道这个项目用了什么技术」——调用方据此决定不筛。
export function listProjectTechContexts(
  assets: AssetData[],
  projectId: string,
): KnownTechContext[] {
  const profile = findProjectTechProfile(assets, projectId);
  const stack =
    profile && profile.assetType === "tech_profile" ? profile.metadata.stack : [];
  const contexts = new Set<KnownTechContext>();

  for (const entry of stack) {
    const context = readTechContextFromStackName(String(entry?.name ?? ""));

    if (context && context !== "generic") {
      contexts.add(context);
    }
  }

  return [...contexts];
}
