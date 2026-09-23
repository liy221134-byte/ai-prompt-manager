// 项目质量等级：等级决定这个项目该有哪些工程文档、该关注哪些规则方向、发布前要做哪些检查。
// 这一层只算「该有什么」和「还缺什么」，不自动创建任何东西。

import type { AssetData } from "../data/assets.ts";
import {
  defaultProjectRiskLevel,
  projectRiskLevelLabels,
  projectRiskLevels,
  type ProjectRiskLevel,
} from "../data/projects.ts";

export const engineeringDocumentKeys = [
  "architecture",
  "data_flow",
  "environment_variables",
  "release_rollback",
  "backup_restore",
  "security",
  "incident_runbook",
  "cost_performance",
] as const;
export type EngineeringDocumentKey = (typeof engineeringDocumentKeys)[number];

export type EngineeringDocument = {
  key: EngineeringDocumentKey;
  // 标题和仓库里 templates/engineering 的文件一级标题保持一致，测试守着这个对应关系
  title: string;
  documentType: string;
  templateFile: string;
  reason: string;
};

export const engineeringDocuments: Record<
  EngineeringDocumentKey,
  EngineeringDocument
> = {
  architecture: {
    key: "architecture",
    title: "架构与请求链路",
    documentType: "架构说明",
    templateFile: "architecture.md",
    reason: "换了谁接手都能知道请求从哪进、经过谁，出事不用先读代码。",
  },
  data_flow: {
    key: "data_flow",
    title: "数据流",
    documentType: "数据流说明",
    templateFile: "data-flow.md",
    reason: "数据从哪来、存哪、能不能删，出问题时能顺着走回去。",
  },
  environment_variables: {
    key: "environment_variables",
    title: "环境变量清单",
    documentType: "环境变量清单",
    templateFile: "environment-variables.md",
    reason: "换机器、换环境、怀疑配置错的时候有东西可对照。",
  },
  release_rollback: {
    key: "release_rollback",
    title: "发布与回滚",
    documentType: "发布手册",
    templateFile: "release-rollback.md",
    reason: "上线前知道要做什么，出事时知道回到哪个版本。",
  },
  backup_restore: {
    key: "backup_restore",
    title: "备份与恢复",
    documentType: "备份说明",
    templateFile: "backup-restore.md",
    reason: "数据丢了要多久能回来，靠文档说清，不靠记忆。",
  },
  security: {
    key: "security",
    title: "安全检查",
    documentType: "安全检查",
    templateFile: "security-checklist.md",
    reason: "密钥、权限和敏感数据每上线一次就核对一遍。",
  },
  incident_runbook: {
    key: "incident_runbook",
    title: "故障处理手册",
    documentType: "故障手册",
    templateFile: "incident-runbook.md",
    reason: "出事的时候照着做，不在慌乱里现场发明流程。",
  },
  cost_performance: {
    key: "cost_performance",
    title: "成本与性能基线",
    documentType: "成本与性能",
    templateFile: "cost-performance-baseline.md",
    reason: "知道正常长什么样，才知道什么时候不正常。",
  },
};

export type QualityLevelProfile = {
  level: ProjectRiskLevel;
  label: string;
  summary: string;
  documents: EngineeringDocumentKey[];
  ruleFocus: string[];
  releaseChecks: string[];
};

export const qualityLevelProfiles: Record<
  ProjectRiskLevel,
  QualityLevelProfile
> = {
  personal: {
    level: "personal",
    label: projectRiskLevelLabels.personal,
    summary: "自己用的工具，数据丢了只是麻烦，不会伤到别人。",
    documents: ["architecture", "environment_variables"],
    ruleFocus: [
      "提交前跑一次自动化测试",
      "密钥只放环境变量，不写进代码和仓库",
    ],
    releaseChecks: ["工程检查通过", "确认数据有备份"],
  },
  low_risk: {
    level: "low_risk",
    label: projectRiskLevelLabels.low_risk,
    summary: "有真实用户在使用的生产环境，出问题会影响别人干活。",
    documents: [
      "architecture",
      "data_flow",
      "environment_variables",
      "release_rollback",
      "backup_restore",
    ],
    ruleFocus: [
      "提交前跑一次自动化测试",
      "密钥只放环境变量，不写进代码和仓库",
      "每次发布留变更记录",
      "改数据结构必须带迁移和回滚方案",
    ],
    releaseChecks: [
      "工程检查通过",
      "迁移在隔离环境跑通过",
      "备份已生成并确认能打开",
      "回滚目标版本已确定",
      "发布后基础验证已做",
    ],
  },
  user_data: {
    level: "user_data",
    label: projectRiskLevelLabels.user_data,
    summary: "库里存着别人的数据，出问题不只是不好用，还会伤到人。",
    documents: [
      "architecture",
      "data_flow",
      "environment_variables",
      "release_rollback",
      "backup_restore",
      "security",
    ],
    ruleFocus: [
      "密钥只放环境变量，不写进代码和仓库",
      "每条数据都要能回答「别人拿到标识能不能读到」",
      "服务端接口逐个确认权限，不靠界面隐藏",
      "日志里不能有口令和完整敏感内容",
      "删除要有回收路径，不做不可恢复的删除",
    ],
    releaseChecks: [
      "工程检查通过",
      "数据隔离策略逐条核对过",
      "删除和恢复路径验证过",
      "备份已生成并在隔离环境恢复验证过",
      "回滚目标版本已确定",
      "发布后基础验证已做",
    ],
  },
  high_sensitive: {
    level: "high_sensitive",
    label: projectRiskLevelLabels.high_sensitive,
    summary: "涉及高敏感数据或强监管要求，出事代价最高，按最严的一套走。",
    documents: [...engineeringDocumentKeys],
    ruleFocus: [
      "密钥只放环境变量，不写进代码和仓库",
      "每条数据都要能回答「别人拿到标识能不能读到」",
      "服务端接口逐个确认权限，不靠界面隐藏",
      "日志里不能有口令和完整敏感内容",
      "删除要有回收路径，不做不可恢复的删除",
      "故障有人管、有手册、有演练记录",
      "成本和用量有预警线",
    ],
    releaseChecks: [
      "工程检查通过",
      "数据隔离策略逐条核对过",
      "删除和恢复路径验证过",
      "恢复演练做过至少一次并留记录",
      "高危变更有人复核或留档",
      "回滚目标版本已确定",
      "发布后基础验证已做",
    ],
  },
};

// 等级值不认识时按最低档处理，不拦也不炸
export function readQualityProfile(level: unknown): QualityLevelProfile {
  return projectRiskLevels.includes(level as ProjectRiskLevel)
    ? qualityLevelProfiles[level as ProjectRiskLevel]
    : qualityLevelProfiles[defaultProjectRiskLevel];
}

export function listRequiredDocuments(level: unknown) {
  return readQualityProfile(level).documents.map(
    (key) => engineeringDocuments[key],
  );
}

export type DocumentGap = {
  document: EngineeringDocument;
  satisfied: boolean;
  // 已经满足时指向那条文档资产
  assetId: string | null;
  assetTitle: string | null;
};

// 已有文档的判定：同一个项目里「活跃、没进垃圾箱」的文档资产，
// 文档类型对得上或标题完全一样就算有。
// 草稿还不算成文，归档和废弃表示不再维护，都不算。
export function listDocumentGaps(input: {
  level: unknown;
  assets: AssetData[];
  projectId: string;
}): DocumentGap[] {
  const documents = input.assets.filter(
    (asset) =>
      asset.projectId === input.projectId &&
      asset.status === "active" &&
      asset.deletedAt === null &&
      asset.assetType === "document",
  );

  return listRequiredDocuments(input.level).map((document) => {
    const matched = documents.find((asset) => {
      const documentType =
        "documentType" in asset.metadata
          ? String(asset.metadata.documentType ?? "")
          : "";

      return documentType === document.documentType || asset.title === document.title;
    });

    return {
      document,
      satisfied: Boolean(matched),
      assetId: matched?.id ?? null,
      assetTitle: matched?.title ?? null,
    };
  });
}

export function summarizeDocumentGaps(gaps: DocumentGap[]) {
  const missing = gaps.filter((gap) => !gap.satisfied);

  return {
    total: gaps.length,
    satisfied: gaps.length - missing.length,
    missing: missing.length,
  };
}
