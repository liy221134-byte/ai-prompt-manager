// 线索 3 M1：外部来源资产的采集合规检查（SOP 四硬约束）。
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
//   | 初始假设        | 不适用（并入上一条）        | confidence === "hypothesis"       |
//   | 必须带来源      | sourceLocation 非空         | sourceExcerpt 或 rationale 非空   |
//   | 不自动升 active | 不适用（文档无 active 语义）| 假设级规则不得 active             |

import type { AssetData } from "../data/assets.ts";

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
 */
export function isExternalSourceAsset(asset: AssetData): boolean {
  const metadata = readMetadata(asset);

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

    if (confidence !== "hypothesis" && confidence !== "verified") {
      report(
        "hypothesis",
        `外部规则的初始可信度应为 hypothesis，当前 confidence=${confidence || "未设置"}`,
      );
    }

    if (asset.status === "active" && confidence !== "verified") {
      report(
        "no_auto_active",
        `假设级外部规则不得处于 active（需人工确认升为 verified 后再说），当前 status=active`,
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
