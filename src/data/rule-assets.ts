export type RuleType =
  | "must"
  | "must_not"
  | "should"
  | "workflow"
  | "acceptance"
  | "technical";

export type RulePriority = "P0" | "P1" | "P2";
export type RuleStatus = "pending" | "approved" | "rejected";
export type RuleSourceType = "paste" | "markdown" | "text";

export type ExtractedRule = {
  id: string;
  type: RuleType;
  priority: RulePriority;
  statement: string;
  rationale: string;
  sourceExcerpt: string;
  status: RuleStatus;
};

export type RuleAssetData = {
  id: string;
  title: string;
  sourceType: RuleSourceType;
  content: string;
  category: string;
  rules: ExtractedRule[];
  createdAt: string;
  updatedAt: string;
};

export type RuleExtractionDraft = {
  title: string;
  category: string;
  rules: ExtractedRule[];
};

export const ruleTypeLabels: Record<RuleType, string> = {
  must: "必须",
  must_not: "禁止",
  should: "建议",
  workflow: "流程",
  acceptance: "验收",
  technical: "技术约束",
};

export const rulePriorityLabels: Record<RulePriority, string> = {
  P0: "必须",
  P1: "重要",
  P2: "可选",
};

export function createRuleId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `rule-${crypto.randomUUID()}`;
  }

  return `rule-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createRuleAssetId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `asset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
