// 规则编译的纯逻辑：挑候选、找可能打架的规则、生成 AGENTS.md 和 START_PROMPT.md 草稿。
// 不碰数据库、不改外部文件，界面和测试共用这一层。

import type {
  AssetData,
  CompileTarget,
  RuleAssetData,
  RuleCompileDecision,
  RuleConfidence,
  RuleLevel,
  RuleScope,
  RuleType,
} from "../data/assets.ts";
import {
  ruleConfidenceLabels,
  ruleScopeLabels,
  ruleTypeLabels,
} from "./asset-list.ts";
import { readAssetPackLink } from "./rule-pack.ts";

export const COMPILE_GENERATOR_VERSION = "v2.3.0";
export const COMPILE_LARGE_DOCUMENT_NAME = "AGENTS.md";
export const COMPILE_START_PROMPT_NAME = "START_PROMPT.md";

// 生成时的排序和分组口径：层级从全局到代码，类型从必须到技术约束
const levelOrder: Array<RuleLevel | ""> = ["global", "module", "task", "code", ""];
const ruleTypeOrder: RuleType[] = [
  "must",
  "forbidden",
  "recommended",
  "process",
  "acceptance",
  "technology",
];

const levelLabels: Record<string, string> = {
  global: "全局",
  module: "模块",
  task: "任务",
  code: "代码",
  "": "未填层级",
};

export type CompileCandidate = {
  rule: RuleAssetData;
  targets: CompileTarget[];
};

export type CompileCandidates = {
  included: CompileCandidate[];
  excluded: Array<{ rule: RuleAssetData; reason: string }>;
  groups: Array<{ level: string; label: string; rules: RuleAssetData[] }>;
};

export type ConflictCandidate = {
  left: RuleAssetData;
  right: RuleAssetData;
  sharedDimensions: string[];
};

export type CompiledDraft = {
  target: "agents" | "start_prompt";
  fileName: string;
  content: string;
  ruleCount: number;
};

export function readCompileDecision(
  metadata: unknown,
): RuleCompileDecision | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const decision = (metadata as { compileDecision?: unknown }).compileDecision;

  if (
    !decision ||
    typeof decision !== "object" ||
    ((decision as RuleCompileDecision).decision !== "included" &&
      (decision as RuleCompileDecision).decision !== "excluded")
  ) {
    return null;
  }

  return decision as RuleCompileDecision;
}

// 没写编译去向的规则按「进 AGENTS.md」处理
export function readCompileTargets(metadata: unknown): CompileTarget[] {
  const targets = (metadata as { compileTarget?: unknown })?.compileTarget;

  return Array.isArray(targets) && targets.length > 0
    ? (targets as CompileTarget[])
    : ["agents"];
}

function readTechContext(rule: RuleAssetData) {
  return [...(rule.metadata.techContext ?? [])];
}

// 编译候选集：只要活跃、没被裁决排除、没标成「不编译」的规则
export function listCompileCandidates(
  assets: AssetData[],
  projectId: string,
): CompileCandidates {
  const rules = assets.filter(
    (asset): asset is RuleAssetData =>
      asset.assetType === "rule" &&
      asset.projectId === projectId &&
      asset.deletedAt === null,
  );
  const included: CompileCandidate[] = [];
  const excluded: Array<{ rule: RuleAssetData; reason: string }> = [];

  for (const rule of rules) {
    const decision = readCompileDecision(rule.metadata);
    const targets = readCompileTargets(rule.metadata);

    if (rule.status !== "active") {
      excluded.push({ rule, reason: "不是活跃状态" });
      continue;
    }

    if (targets.includes("none")) {
      excluded.push({ rule, reason: "标记为不参与编译" });
      continue;
    }

    if (decision?.decision === "excluded") {
      excluded.push({ rule, reason: "你已裁决不参与编译" });
      continue;
    }

    included.push({ rule, targets });
  }

  included.sort(
    (left, right) =>
      levelOrder.indexOf(left.rule.metadata.level ?? "") -
        levelOrder.indexOf(right.rule.metadata.level ?? "") ||
      ruleTypeOrder.indexOf(left.rule.metadata.ruleType) -
        ruleTypeOrder.indexOf(right.rule.metadata.ruleType) ||
      left.rule.title.localeCompare(right.rule.title, "zh"),
  );

  const groups = levelOrder
    .map((level) => ({
      level: level === "" ? "none" : level,
      label: levelLabels[level] ?? "未填层级",
      rules: included
        .filter((candidate) => (candidate.rule.metadata.level ?? "") === level)
        .map((candidate) => candidate.rule),
    }))
    .filter((group) => group.rules.length > 0);

  return { included, excluded, groups };
}

function overlaps(left: string[], right: string[]) {
  if (left.length === 0 && right.length === 0) {
    return true;
  }

  return left.some((item) => right.includes(item));
}

// 冲突候选：只挑高置信的信号——一条「必须」和一条「禁止」，并且它们至少在一个
// 维度上相关（同层级、同范围，或技术上下文有交集）。判定仍然由人来做：
// 列表要短、每条都值得看，比把所有同层级规则两两摆出来有用。
export function listConflictCandidates(
  rules: RuleAssetData[],
  limit = 30,
): ConflictCandidate[] {
  const candidates: ConflictCandidate[] = [];

  for (let leftIndex = 0; leftIndex < rules.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < rules.length;
      rightIndex += 1
    ) {
      const left = rules[leftIndex];
      const right = rules[rightIndex];
      const leftLevel = left.metadata.level ?? "";
      const rightLevel = right.metadata.level ?? "";
      const leftScope: RuleScope = left.metadata.scope;
      const rightScope: RuleScope = right.metadata.scope;
      const sharedDimensions: string[] = [];

      if (leftLevel === rightLevel) {
        sharedDimensions.push(`作用层级：${levelLabels[leftLevel] ?? leftLevel}`);
      }

      if (leftScope === rightScope) {
        sharedDimensions.push(`作用范围：${ruleScopeLabels[leftScope]}`);
      }

      if (overlaps(readTechContext(left), readTechContext(right))) {
        sharedDimensions.push("技术上下文有交集");
      }

      const oppositePolarity =
        (left.metadata.ruleType === "must" &&
          right.metadata.ruleType === "forbidden") ||
        (left.metadata.ruleType === "forbidden" &&
          right.metadata.ruleType === "must");

      if (oppositePolarity && leftLevel === rightLevel) {
        sharedDimensions.push("同一层级上一条「必须」一条「禁止」");
      }

      if (oppositePolarity && sharedDimensions.length >= 1) {
        candidates.push({ left, right, sharedDimensions });
      }

      if (candidates.length >= limit) {
        return candidates;
      }
    }
  }

  return candidates;
}

function readStatement(rule: RuleAssetData) {
  const firstLine = rule.content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstLine?.replace(/^#+\s*/, "") || rule.summary || rule.title;
}

function readSourceLabel(
  rule: RuleAssetData,
  packTitles: Record<string, string>,
) {
  const link = readAssetPackLink(rule.metadata);

  if (link) {
    return `${packTitles[link.packId] ?? link.packId}（包内编号 ${link.packItemId}）`;
  }

  return rule.metadata.evidence?.split(/\r?\n/)[0]?.replace(/^- /, "") ?? "";
}

function describeConfidence(confidence: RuleConfidence | undefined) {
  return confidence ? `可信度：${ruleConfidenceLabels[confidence]}` : "";
}

function buildRuleBlock(
  rule: RuleAssetData,
  packTitles: Record<string, string>,
) {
  const lines = [
    `- **${rule.title}**：${readStatement(rule)}`,
  ];
  const details: string[] = [];

  if (rule.metadata.rationale) {
    details.push(`理由：${rule.metadata.rationale.replace(/\s+/g, " ").trim()}`);
  }

  const source = readSourceLabel(rule, packTitles);
  const confidence = describeConfidence(rule.metadata.confidence);

  if (source || confidence) {
    details.push([source ? `来源：${source}` : "", confidence].filter(Boolean).join(" · "));
  }

  if (rule.metadata.verification) {
    details.push(`验证方式：${rule.metadata.verification}`);
  }

  return [lines[0], ...details.map((detail) => `  - ${detail}`)].join("\n");
}

function buildHeader(input: {
  projectName: string;
  ruleCount: number;
  excludedCount: number;
  now: string;
  extra?: string;
}) {
  const generatedAt = new Date(input.now);
  const timestamp = Number.isNaN(generatedAt.getTime())
    ? input.now
    : generatedAt.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

  return [
    `> 由 AI 提示词资产管理工具生成（${COMPILE_GENERATOR_VERSION}），${timestamp}`,
    `> 来源项目：${input.projectName} · 参与编译 ${input.ruleCount} 条 · 已排除 ${input.excludedCount} 条${
      input.extra ? ` · ${input.extra}` : ""
    }`,
  ].join("\n");
}

function groupByLevel(rules: RuleAssetData[]) {
  return levelOrder
    .map((level) => ({
      level,
      label: levelLabels[level] ?? "未填层级",
      rules: rules
        .filter((rule) => (rule.metadata.level ?? "") === level)
        .sort(
          (left, right) =>
            ruleTypeOrder.indexOf(left.metadata.ruleType) -
              ruleTypeOrder.indexOf(right.metadata.ruleType) ||
            left.title.localeCompare(right.title, "zh"),
        ),
    }))
    .filter((group) => group.rules.length > 0);
}

function groupByType(rules: RuleAssetData[]) {
  return ruleTypeOrder
    .map((ruleType) => ({
      ruleType,
      rules: rules.filter((rule) => rule.metadata.ruleType === ruleType),
    }))
    .filter((group) => group.rules.length > 0);
}

// 生成两份草稿：AGENTS.md 收标了 agents／readme 或没写去向的规则，
// START_PROMPT.md 只收「必须」和「禁止」。
export function compileRuleDrafts(input: {
  projectName: string;
  rules: RuleAssetData[];
  packTitles: Record<string, string>;
  excludedCount: number;
  profileSummary?: string;
  now: string;
}): { agents: CompiledDraft; startPrompt: CompiledDraft } {
  const agentsRules = input.rules.filter((rule) => {
    const targets = readCompileTargets(rule.metadata);

    return targets.includes("agents") || targets.includes("readme");
  });
  const startPromptRules = input.rules.filter(
    (rule) =>
      rule.metadata.ruleType === "must" ||
      rule.metadata.ruleType === "forbidden",
  );

  const agentsSections = groupByLevel(agentsRules).map((group) => {
    const body = groupByType(group.rules)
      .map((typed) =>
        [
          `### ${ruleTypeLabels[typed.ruleType]}`,
          "",
          typed.rules
            .map((rule) => buildRuleBlock(rule, input.packTitles))
            .join("\n"),
        ].join("\n"),
      )
      .join("\n\n");

    return `## ${group.label}\n\n${body}`;
  });
  const startPromptSections = groupByType(startPromptRules).map((typed) =>
    [
      `## ${ruleTypeLabels[typed.ruleType]}`,
      "",
      typed.rules
        .map((rule) => `- **${rule.title}**：${readStatement(rule)}`)
        .join("\n"),
    ].join("\n"),
  );

  return {
    agents: {
      target: "agents",
      fileName: COMPILE_LARGE_DOCUMENT_NAME,
      ruleCount: agentsRules.length,
      content: [
        `# ${COMPILE_LARGE_DOCUMENT_NAME}`,
        "",
        buildHeader({
          projectName: input.projectName,
          ruleCount: agentsRules.length,
          excludedCount: input.excludedCount,
          now: input.now,
          ...(input.profileSummary ? { extra: input.profileSummary } : {}),
        }),
        "",
        ...agentsSections,
        "",
      ].join("\n"),
    },
    startPrompt: {
      target: "start_prompt",
      fileName: COMPILE_START_PROMPT_NAME,
      ruleCount: startPromptRules.length,
      content: [
        `# ${COMPILE_START_PROMPT_NAME}`,
        "",
        buildHeader({
          projectName: input.projectName,
          ruleCount: startPromptRules.length,
          excludedCount: input.excludedCount,
          now: input.now,
          extra: "只列「必须」和「禁止」",
        }),
        "",
        ...startPromptSections,
        "",
      ].join("\n"),
    },
  };
}
