// 自动分流建议：这条资产看着像「法则级」（该升到公共库）还是「项目专属」（留在项目里）。
// 只给建议和理由，不替人搬东西——批量提升也要人点一下。

import type { AssetData } from "../data/assets.ts";

export type SedimentScopeSuggestion = {
  scope: "public" | "project";
  reason: string;
};

// 法则级信号：讲的是"任何时候都该这样"
const universalSignals = [
  "必须",
  "禁止",
  "不得",
  "一律",
  "统一",
  "原则",
  "规范",
  "任何项目",
  "通用",
  "每次都",
];

// 项目专属信号：带具体项目、版本或本机路径
const projectSignals = [
  "v0.",
  "v1.",
  "v2.",
  "E:\\",
  "C:\\",
  "本机",
  "本次",
  "这个项目",
];

function searchText(asset: AssetData) {
  return `${asset.title}\n${asset.summary}\n${asset.content}`;
}

export function suggestSedimentScope(input: {
  asset: AssetData;
  projectName: string;
}): SedimentScopeSuggestion {
  const text = searchText(input.asset);
  const projectName = input.projectName.trim();

  if (projectName && text.includes(projectName)) {
    return {
      scope: "project",
      reason: `正文里点名了「${projectName}」，看着是项目专属`,
    };
  }

  const projectSignal = projectSignals.find((signal) => text.includes(signal));

  if (projectSignal) {
    return {
      scope: "project",
      reason: `出现了「${projectSignal}」这类具体信息，先留在项目里`,
    };
  }

  const universalSignal = universalSignals.find((signal) =>
    text.includes(signal),
  );

  if (universalSignal) {
    return {
      scope: "public",
      reason: `讲的是「${universalSignal}」这类通用约束，值得升到公共库`,
    };
  }

  return {
    scope: "project",
    reason: "看不出通用性，先留在项目里；以后在别的项目又用到，再升也不迟",
  };
}

// 批量分流：只挑建议升公共的那几条
export function listPromoteSuggestions(input: {
  assets: AssetData[];
  projectName: string;
}) {
  return input.assets
    .map((asset) => ({
      asset,
      suggestion: suggestSedimentScope({
        asset,
        projectName: input.projectName,
      }),
    }))
    .filter((entry) => entry.suggestion.scope === "public");
}
