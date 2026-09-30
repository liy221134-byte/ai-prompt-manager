// 线索 3：外部来源资产的采集合规检查（SOP 四硬约束）。
//
// 只读校验，不改任何数据；扫本机库里「外部来源资产」，逐条检查有没有守住：
//   1. 默认候选（未经确认不进入可用状态）
//   2. 初始可信度为假设（hypothesis）
//   3. 必须留来源（能回溯出处）
//   4. 未经人工确认不许升 active
//
// ⚠ 四约束在不同资产类型上的表达不一样（这点很关键，不然 9 个 M0 资产会被误判）：
//   文档资产没有「candidate／hypothesis」这两个规则专有概念（见
//   scripts/import-leads3-docs.ts 顶部注释），它用 role:"source" + authority:false
//   来表达「外部来源、未采信」，用 sourceLocation 表达出处。
//   规则资产才用 status / confidence 表达。
//
// 所以「四约束 → 判据」按类型映射：
//   | 约束            | 文档类判据                  | 规则类判据                        |
//   | 默认候选        | authority === false（未采信）| status 不为 active（无确认记录）  |
//   | 初始假设        | 不适用（并入上一条）        | confidence 取值合法且不为空       |
//   | 必须带来源      | sourceLocation 非空         | sourceExcerpt 或 rationale 非空   |
//   | 不自动升 active | 不适用（文档无 active 语义）| active 必须有确认记录             |
//
// 第四约束在 M2 演进过：M1 判的是「active 且 confidence 不是 verified」，
// 那等于要求先有实战验证才能升活跃——把「人工把关」和「真实项目里用过」压成了一件事。
// 按 SOP 原文，provisional 的语义恰恰是「人工确认过、还没实战验证」，它就该允许 active。
// 现在的判据是「active 且没有确认记录」，确认记录由界面上的确认动作写入（谁、何时、凭什么）。

import {
  readConfirmationRecord,
  ruleConfidences,
  type AssetData,
  type RuleConfidence,
} from "../data/assets.ts";

export const complianceRuleKeys = [
  "candidate",
  "hypothesis",
  "source",
  "no_auto_active",
] as const;
export type ComplianceRuleKey = (typeof complianceRuleKeys)[number];

export const complianceRuleLabels: Record<ComplianceRuleKey, string> = {
  candidate: "默认候选（未经确认不进入可用状态）",
  hypothesis: "初始可信度为假设（hypothesis）",
  source: "必须留来源（可回溯出处）",
  no_auto_active: "未经人工确认不许升 active",
};

export type ComplianceViolation = {
  assetId: string;
  title: string;
  assetType: string;
  rule: ComplianceRuleKey;
  /** 当前值的说明，便于定位问题 */
  detail: string;
};

export type ComplianceReport = {
  checkedCount: number;
  violations: ComplianceViolation[];
};

function readMetadata(asset: AssetData): Record<string, unknown> {
  const metadata = asset.metadata as unknown;
  return typeof metadata === "object" && metadata !== null
    ? (metadata as Record<string, unknown>)
    : {};
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 是否属于「外部来源资产」——合规检查只针对这些。
 * 文档类看 role:"source" 或 authority:false；规则类看可信度标记为假设。
 *
 * ⚠ 2026-09-30 修：`authority: false` 是**文档资产的默认元数据**，不是「外部采来的」标记，
 * 光靠它判会把两类自家东西也扫成外部来源（主库因此误报 3 处）：
 *   ① 规则包成员（种子包／公共库包导入的画像、验证记录，metadata 里有 pack）；
 *   ② 本产品的编译产物（role: "compiled"，例如 START_PROMPT.md）。
 * 它们不是采来的，只是恰好带着这个默认值，先排除掉。
 */
export function isExternalSourceAsset(asset: AssetData): boolean {
  const metadata = readMetadata(asset);

  const fromPack =
    typeof metadata.pack === "object" && metadata.pack !== null;
  const compiledByUs = metadata.role === "compiled";
  if (fromPack || compiledByUs) {
    return false;
  }

  if (metadata.role === "source" || metadata.authority === false) {
    return true;
  }

  return asset.assetType === "rule" && metadata.confidence === "hypothesis";
}

export function evaluateAssetCompliance(asset: AssetData): ComplianceViolation[] {
  const metadata = readMetadata(asset);
  const violations: ComplianceViolation[] = [];

  const report = (rule: ComplianceRuleKey, detail: string) => {
    violations.push({
      assetId: asset.id,
      title: asset.title,
      assetType: asset.assetType,
      rule,
      detail,
    });
  };

  if (asset.assetType === "document") {
    // 文档资产没有 candidate／hypothesis 这对规则概念，两者统一由 authority: false
    // 表达「外部来源、未采信」，所以这里合并成一条检查——不绑死在某个具体标记上
    // （M0 导入时 team-methods 另标了 role:"source"，reference 没标，但都是未采信）。
    if (metadata.authority !== false) {
      report(
        "candidate",
        `外部文档应以未采信状态入库（authority: false），当前 authority=${String(metadata.authority)}`,
      );
    }

    if (!readText(metadata.sourceLocation)) {
      report("source", "缺少来源位置（sourceLocation），无法回溯它从哪来");
    }

    // 「初始假设」「不自动升 active」对文档资产不适用：文档没有可信度与发布语义
    return violations;
  }

  if (asset.assetType === "rule") {
    const confidence = readText(metadata.confidence);

    // 三档可信度都是合法取值：hypothesis 是刚采进来的，provisional 是人工确认过、
    // 还没实战验证的，verified 是验证过的。M1 的判据只放行 hypothesis 与 verified，
    // 把 provisional 误判成违规（它恰恰是「进编译候选」时的典型状态），M2 一并修正。
    if (!ruleConfidences.includes(confidence as RuleConfidence)) {
      report(
        "hypothesis",
        `外部规则的可信度应为 hypothesis／provisional／verified 之一，当前 confidence=${
          confidence || "未设置"
        }`,
      );
    }

    if (asset.status === "active" && !readConfirmationRecord(asset.metadata)) {
      report(
        "no_auto_active",
        "这条外部规则处于 active（会进编译候选），但没有确认记录（谁、何时、凭什么）。" +
          "在资产编辑器里升为活跃时要写确认依据。",
      );
    }

    const hasSource =
      readText(metadata.sourceExcerpt) !== "" ||
      readText(metadata.rationale) !== "";

    if (!hasSource) {
      report("source", "缺少来源摘录（sourceExcerpt／rationale）");
    }

    return violations;
  }

  return violations;
}

/** 扫一批资产，只检查其中的外部来源资产 */
export function checkExternalSourcesCompliance(
  assets: AssetData[],
): ComplianceReport {
  const externalAssets = assets.filter(isExternalSourceAsset);
  const violations = externalAssets.flatMap(evaluateAssetCompliance);

  return { checkedCount: externalAssets.length, violations };
}

/**
 * 挑出「处于 active 但没有确认记录」的外部来源规则，供批量降回待确认用。
 *
 * 为什么需要它：打包器曾经把种子包里的每个成员都写成 active（源文件标的 candidate
 * 从来没生效），于是 SOP 第 4 条「未经人工确认不许升 active」被系统性绕过。打包口径已在
 * v2.29.0 修掉，库里那批存量要单独处理——就是这里。
 *
 * 只挑规则：文档类没有 active 语义，走 role／authority 口径，不参与降级。
 * 已经在资产编辑器里写过确认依据的规则不在名单里（有确认记录就不算违规）。
 */
export function planAutoActiveDowngrade(assets: AssetData[]): AssetData[] {
  return assets.filter(
    (asset) =>
      !asset.deletedAt &&
      asset.assetType === "rule" &&
      isExternalSourceAsset(asset) &&
      asset.status === "active" &&
      !readConfirmationRecord(asset.metadata),
  );
}
