import type {
  ExtractedRule,
  RuleAssetData,
  RulePriority,
  RuleSourceType,
  RuleStatus,
  RuleType,
} from "../data/rule-assets.ts";

const ruleTypes = new Set<RuleType>([
  "must",
  "must_not",
  "should",
  "workflow",
  "acceptance",
  "technical",
]);
const priorities = new Set<RulePriority>(["P0", "P1", "P2"]);
const statuses = new Set<RuleStatus>(["pending", "approved", "rejected"]);
const sourceTypes = new Set<RuleSourceType>(["paste", "markdown", "text"]);

function isValidDate(value: unknown) {
  return (
    typeof value === "string" && !Number.isNaN(new Date(value).getTime())
  );
}

export function isExtractedRule(value: unknown): value is ExtractedRule {
  if (!value || typeof value !== "object") {
    return false;
  }

  const rule = value as Partial<ExtractedRule>;

  return (
    typeof rule.id === "string" &&
    ruleTypes.has(rule.type as RuleType) &&
    priorities.has(rule.priority as RulePriority) &&
    statuses.has(rule.status as RuleStatus) &&
    typeof rule.statement === "string" &&
    typeof rule.rationale === "string" &&
    typeof rule.sourceExcerpt === "string"
  );
}

export function isRuleAssetData(value: unknown): value is RuleAssetData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const asset = value as Partial<RuleAssetData>;

  return (
    typeof asset.id === "string" &&
    typeof asset.title === "string" &&
    sourceTypes.has(asset.sourceType as RuleSourceType) &&
    typeof asset.content === "string" &&
    typeof asset.category === "string" &&
    Array.isArray(asset.rules) &&
    asset.rules.every(isExtractedRule) &&
    isValidDate(asset.createdAt) &&
    isValidDate(asset.updatedAt)
  );
}
