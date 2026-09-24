import {
  type AssetData,
  type AssetRelation,
  type AssetRelationType,
  type AssetStatus,
  type DocumentAssetData,
  type DocumentAssetMetadata,
  type DocumentRole,
  type EvidenceConclusion,
  type EvidenceAssetData,
  type EvidenceAssetMetadata,
  type ReleaseGateItem,
  type ReleaseRecordAssetData,
  type ReleaseRecordMetadata,
  type ReleaseRecordResult,
  type GraphNodeAssetData,
  type GraphNodeAssetMetadata,
  type GraphNodeType,
  type RuleAssetMetadata,
  type RuleAssetData,
  type RuleLevel,
  type RuleLifecycle,
  type RuleOverrideScope,
  type RulePriority,
  type RuleScope,
  type RuleStage,
  type RuleType,
  createInitialAssetVersionId,
  defaultDocumentType,
  normalizeDocumentMetadata,
  normalizeEvidenceMetadata,
  normalizeReleaseRecordMetadata,
  readDocumentEvidenceMetadata,
  readDocumentReleaseMetadata,
  normalizeGraphNodeMetadata,
  normalizeRuleMetadata,
  normalizeTemplateMetadata,
  normalizeTechProfileMetadata,
  readAssetRelations,
  type TechProfileAssetData,
  type TechProfileAssetMetadata,
  type TemplateAssetData,
  type TemplateAssetMetadata,
} from "../data/assets.ts";
import type { AssetSaveInput } from "./prompt-api.ts";
import { assetStatusLabels } from "./asset-list.ts";
import { validateTechStack } from "./tech-profile.ts";

export const editableAssetTypes = [
  "rule",
  "document",
  "tech_profile",
  "template",
  "graph_node",
  "evidence",
  "release_record",
] as const;
export type EditableAssetType = (typeof editableAssetTypes)[number];

// 新建时能选的类型：验收记录和发布记录已经归位成文档的两种类型，
// 不再单独新建（老资产还能打开和编辑，所以它们仍留在 editableAssetTypes 里）。
export const creatableAssetTypes = [
  "rule",
  "document",
  "tech_profile",
  "template",
  "graph_node",
] as const satisfies readonly EditableAssetType[];
export type EditableAssetData =
  | RuleAssetData
  | DocumentAssetData
  | TechProfileAssetData
  | TemplateAssetData
  | GraphNodeAssetData
  | EvidenceAssetData
  | ReleaseRecordAssetData;

export const ASSET_TITLE_MAX_LENGTH = 60;

// 手动编辑只开放这四个状态，「待确认」留给后续 AI 和导入流程。
export const editableAssetStatuses: AssetStatus[] = [
  "draft",
  "active",
  "deprecated",
  "archived",
];

// 关系一行：界面上用 key 做稳定标识，保存时转成元数据里的数组
export type AssetRelationDraft = {
  key: string;
  targetAssetId: string;
  relationType: AssetRelationType;
  note: string;
};

export type RuleAssetDraft = {
  assetType: "rule";
  title: string;
  summary: string;
  content: string;
  status: AssetStatus;
  ruleType: RuleType;
  scope: RuleScope;
  // 扩展元数据都可以留空，界面不因为没填而拦截保存
  purpose: string;
  level: RuleLevel | "";
  techContext: string;
  stage: RuleStage | "";
  priority: RulePriority | "";
  lifecycle: RuleLifecycle | "";
  overrideScope: RuleOverrideScope | "";
  evidence: string;
  verification: string;
  // 这条规则为什么立、从原文哪句话来：导入的规则会带上，手写也可以补
  rationale: string;
  sourceExcerpt: string;
  relations: AssetRelationDraft[];
};

export type DocumentAssetDraft = {
  assetType: "document";
  title: string;
  summary: string;
  content: string;
  status: AssetStatus;
  documentType: string;
  role: DocumentRole | "";
  authority: boolean;
  module: string;
  effectiveVersion: string;
  sourceLocation: string;
  updateTrigger: string;
  freshness: string;
  lastVerifiedAt: string;
  // 文档类型是「验收记录」时用：结论与提交版本（覆盖哪些需求看关系）
  conclusion: EvidenceConclusion;
  commitRef: string;
  // 文档类型是「发布记录」时用：版本、日期、结果、回滚目标和人工门禁
  version: string;
  releasedAt: string;
  result: ReleaseRecordResult;
  rollbackTarget: string;
  gates: ReleaseGateItem[];
  relations: AssetRelationDraft[];
};

// 技术栈一行：界面上用 key 做稳定标识，保存时转成元数据里的数组
export type TechStackEntryDraft = {
  key: string;
  name: string;
  version: string;
  purpose: string;
  isDeviation: boolean;
  adrAssetId: string;
};

export type TechProfileAssetDraft = {
  assetType: "tech_profile";
  title: string;
  summary: string;
  content: string;
  status: AssetStatus;
  stack: TechStackEntryDraft[];
  relations: AssetRelationDraft[];
};

// 模板：正文就是产物骨架，产物文件名决定生成时默认叫什么
export type TemplateAssetDraft = {
  assetType: "template";
  title: string;
  summary: string;
  content: string;
  status: AssetStatus;
  outputFileName: string;
  note: string;
  relations: AssetRelationDraft[];
};

// 图谱节点：编号是给人看的稳定标识，父节点限定同类型
export type GraphNodeAssetDraft = {
  assetType: "graph_node";
  title: string;
  summary: string;
  content: string;
  status: AssetStatus;
  nodeType: GraphNodeType;
  code: string;
  parentId: string;
  note: string;
  relations: AssetRelationDraft[];
};

// 证据一行：说明 + 链接或文件路径，界面上用 key 做稳定标识
export type EvidenceItemDraft = {
  key: string;
  label: string;
  reference: string;
};

// 验收记录：正文写验收条件和结果，元数据放结构化的部分；
// 结论默认待确认，改成「通过」只能由人在界面上操作。
export type EvidenceAssetDraft = {
  assetType: "evidence";
  title: string;
  summary: string;
  content: string;
  status: AssetStatus;
  nodeId: string;
  conclusion: EvidenceConclusion;
  commitRef: string;
  evidenceItems: EvidenceItemDraft[];
  relations: AssetRelationDraft[];
};

// 发布记录：门禁项要人勾、要写证据，所以门禁清单是草稿的一部分
export type ReleaseRecordAssetDraft = {
  assetType: "release_record";
  title: string;
  summary: string;
  content: string;
  status: AssetStatus;
  version: string;
  releasedAt: string;
  result: ReleaseRecordResult;
  rollbackTarget: string;
  gates: ReleaseGateItem[];
  relations: AssetRelationDraft[];
};

export type AssetDraft =
  | RuleAssetDraft
  | DocumentAssetDraft
  | TechProfileAssetDraft
  | TemplateAssetDraft
  | GraphNodeAssetDraft
  | EvidenceAssetDraft
  | ReleaseRecordAssetDraft;

// 新建时的预填：只补标题和文档类型，其他字段保持空草稿的默认值。
// 从「工程基线」缺口点进来时用，让用户少填两个字段。
export function withInitialFields(
  draft: AssetDraft,
  input: {
    title?: string;
    documentType?: string;
    content?: string;
    // 从工程基线缺口进来时预挂一条关系：验收记录先指向对应的需求节点
    relationTargetId?: string;
    relationNote?: string;
  },
): AssetDraft {
  const title = input.title?.trim();
  const documentType = input.documentType?.trim();
  const content = input.content?.trim();
  const titled = {
    ...(title ? { ...draft, title } : draft),
    // 从模板新建文档时把模板正文带进来，省得重新贴一遍
    ...(content ? { content } : {}),
  };

  if (titled.assetType === "document" && documentType) {
    return linkInitialRelation({ ...titled, documentType }, input);
  }

  return linkInitialRelation(titled, input);
}

// 预挂一条「引用」关系。关系是通用字段，各类资产都有，所以在这里统一加。
function linkInitialRelation(
  draft: AssetDraft,
  input: { relationTargetId?: string; relationNote?: string },
): AssetDraft {
  if (!input.relationTargetId) {
    return draft;
  }

  return {
    ...draft,
    relations: [
      ...draft.relations,
      {
        key: `relation-initial-${input.relationTargetId}`,
        targetAssetId: input.relationTargetId,
        relationType: "reference",
        note: input.relationNote ?? "",
      },
    ],
  };
}

// 有编辑入口的资产类型：规则、文档和技术档案；提示词继续走既有流程，
// 规则包由导入和打包生成，不做手工编辑。
export function isEditableAssetData(value: AssetData): value is EditableAssetData {
  return editableAssetTypes.includes(value.assetType as EditableAssetType);
}

export function createAssetId(assetType: EditableAssetType) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${assetType}-${crypto.randomUUID()}`;
  }

  return `${assetType}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createEmptyAssetDraft(
  assetType: EditableAssetType,
  options: {
    nodeType?: GraphNodeType;
    nodeId?: string;
    // 发布记录的门禁项：按项目质量等级预填进来
    gates?: ReleaseGateItem[];
    // 技术档案的技术栈预填（例如从 package.json 推断出来的草稿）
    stack?: Array<{ name: string; version?: string }>;
  } = {},
): AssetDraft {
  if (assetType === "rule") {
    return {
      assetType: "rule",
      title: "",
      summary: "",
      content: "",
      status: "active",
      ruleType: "must",
      scope: "project",
      purpose: "",
      level: "",
      techContext: "",
      stage: "",
      priority: "",
      lifecycle: "",
      overrideScope: "",
      evidence: "",
      verification: "",
      rationale: "",
      sourceExcerpt: "",
      relations: [],
    };
  }

  if (assetType === "tech_profile") {
    return {
      assetType: "tech_profile",
      title: "",
      summary: "",
      content: "",
      status: "active",
      stack: (options.stack ?? []).map((entry, index) => ({
        key: `stack-${index + 1}`,
        name: entry.name,
        version: entry.version ?? "",
        purpose: "",
        isDeviation: false,
        adrAssetId: "",
      })),
      relations: [],
    };
  }

  if (assetType === "template") {
    return {
      assetType: "template",
      title: "",
      summary: "",
      content: "",
      status: "active",
      outputFileName: "",
      note: "",
      relations: [],
    };
  }

  if (assetType === "graph_node") {
    return {
      assetType: "graph_node",
      title: "",
      summary: "",
      content: "",
      status: "active",
      nodeType: options.nodeType ?? "requirement",
      code: "",
      parentId: "",
      note: "",
      relations: [],
    };
  }

  if (assetType === "evidence") {
    return {
      assetType: "evidence",
      title: "",
      summary: "",
      content: "",
      status: "active",
      nodeId: options.nodeId ?? "",
      // 新建时一律待确认：结论要人看过才算数
      conclusion: "pending",
      commitRef: "",
      evidenceItems: [],
      relations: [],
    };
  }

  if (assetType === "release_record") {
    return {
      assetType: "release_record",
      title: "",
      summary: "",
      content: "",
      status: "active",
      version: "",
      releasedAt: "",
      result: "in_progress",
      rollbackTarget: "",
      gates: (options.gates ?? []).map((gate) => ({ ...gate })),
      relations: [],
    };
  }

  return createEmptyDocumentDraft({ gates: options.gates });
}

// 文档草稿：验收记录和发布记录现在是它的两种文档类型，
// 所以这两个块的结构化字段也挂在文档草稿上，保存时按文档类型决定写不写。
export function createEmptyDocumentDraft(options: {
  gates?: ReleaseGateItem[];
} = {}): DocumentAssetDraft {
  return {
    assetType: "document",
    title: "",
    summary: "",
    content: "",
    status: "active",
    documentType: "PRD",
    role: "",
    authority: false,
    module: "",
    effectiveVersion: "",
    sourceLocation: "",
    updateTrigger: "",
    freshness: "",
    lastVerifiedAt: "",
    // 结论默认待确认：改成「通过」由人在界面上操作
    conclusion: "pending",
    commitRef: "",
    version: "",
    releasedAt: "",
    result: "in_progress",
    rollbackTarget: "",
    gates: (options.gates ?? []).map((gate) => ({ ...gate })),
    relations: [],
  };
}

function relationsToDraft(relations: AssetRelation[]): AssetRelationDraft[] {
  return relations.map((relation, index) => ({
    key: `relation-${index + 1}`,
    targetAssetId: relation.targetAssetId,
    relationType: relation.relationType,
    note: relation.note,
  }));
}

// 没选目标的行直接丢掉，不让半截关系进元数据
function draftRelationsToMetadata(
  relations: AssetRelationDraft[],
): AssetRelation[] {
  return relations
    .filter((relation) => relation.targetAssetId)
    .map((relation) => ({
      targetAssetId: relation.targetAssetId,
      relationType: relation.relationType,
      note: relation.note.trim(),
    }));
}

export function assetToDraft(asset: EditableAssetData): AssetDraft {
  if (asset.assetType === "tech_profile") {
    return techProfileToDraft(asset);
  }

  if (asset.assetType === "template") {
    const metadata = normalizeTemplateMetadata(asset.metadata);

    return {
      assetType: "template",
      title: asset.title,
      summary: asset.summary,
      content: asset.content,
      status: asset.status,
      outputFileName: metadata.outputFileName,
      note: metadata.note,
      relations: relationsToDraft(readAssetRelations(asset.metadata)),
    };
  }

  if (asset.assetType === "graph_node") {
    const metadata = normalizeGraphNodeMetadata(asset.metadata);

    return {
      assetType: "graph_node",
      title: asset.title,
      summary: asset.summary,
      content: asset.content,
      status: asset.status,
      nodeType: metadata.nodeType,
      code: metadata.code,
      parentId: metadata.parentId,
      note: metadata.note,
      relations: relationsToDraft(readAssetRelations(asset.metadata)),
    };
  }

  if (asset.assetType === "evidence") {
    const metadata = normalizeEvidenceMetadata(asset.metadata);

    return {
      assetType: "evidence",
      title: asset.title,
      summary: asset.summary,
      content: asset.content,
      status: asset.status,
      nodeId: metadata.nodeId,
      conclusion: metadata.conclusion,
      commitRef: metadata.commitRef,
      evidenceItems: metadata.evidenceItems.map((item, index) => ({
        key: `evidence-item-${index + 1}`,
        label: item.label,
        reference: item.reference,
      })),
      relations: relationsToDraft(readAssetRelations(asset.metadata)),
    };
  }

  if (asset.assetType === "release_record") {
    const metadata = normalizeReleaseRecordMetadata(asset.metadata);

    return {
      assetType: "release_record",
      title: asset.title,
      summary: asset.summary,
      content: asset.content,
      status: asset.status,
      version: metadata.version,
      releasedAt: metadata.releasedAt,
      result: metadata.result,
      rollbackTarget: metadata.rollbackTarget,
      gates: metadata.gates.map((gate) => ({ ...gate })),
      relations: relationsToDraft(readAssetRelations(asset.metadata)),
    };
  }

  if (asset.assetType === "rule") {
    // 旧数据只有核心字段，这里统一补成空值，编辑器不用自己兜底
    const metadata = normalizeRuleMetadata(asset.metadata);

    return {
      assetType: "rule",
      title: asset.title,
      summary: asset.summary,
      content: asset.content,
      status: asset.status,
      ruleType: metadata.ruleType,
      scope: metadata.scope,
      purpose: metadata.purpose,
      level: metadata.level,
      techContext: metadata.techContext.join("，"),
      stage: metadata.stage,
      priority: metadata.priority,
      lifecycle: metadata.lifecycle,
      overrideScope: metadata.overrideScope,
      evidence: metadata.evidence,
      verification: metadata.verification,
      rationale: metadata.rationale,
      sourceExcerpt: metadata.sourceExcerpt,
      relations: relationsToDraft(readAssetRelations(asset.metadata)),
    };
  }

  const metadata = normalizeDocumentMetadata(asset.metadata);
  const evidence = readDocumentEvidenceMetadata(asset.metadata);
  const release = readDocumentReleaseMetadata(asset.metadata);

  return {
    assetType: "document",
    title: asset.title,
    summary: asset.summary,
    content: asset.content,
    status: asset.status,
    documentType: metadata.documentType,
    role: metadata.role,
    authority: metadata.authority,
    module: metadata.module,
    effectiveVersion: metadata.effectiveVersion,
    sourceLocation: metadata.sourceLocation,
    updateTrigger: metadata.updateTrigger,
    freshness: metadata.freshness,
    lastVerifiedAt: metadata.lastVerifiedAt,
    conclusion: evidence?.conclusion ?? "pending",
    commitRef: evidence?.commitRef ?? "",
    version: release?.version ?? "",
    releasedAt: release?.releasedAt ?? "",
    result: release?.result ?? "in_progress",
    rollbackTarget: release?.rollbackTarget ?? "",
    gates: release?.gates ?? [],
    relations: relationsToDraft(readAssetRelations(asset.metadata)),
  };
}

export function techProfileToDraft(
  asset: TechProfileAssetData,
): TechProfileAssetDraft {
  const metadata = normalizeTechProfileMetadata(asset.metadata);

  return {
    assetType: "tech_profile",
    title: asset.title,
    summary: asset.summary,
    content: asset.content,
    status: asset.status,
    stack: metadata.stack.map((entry, index) => ({
      key: `stack-${index + 1}`,
      name: entry.name,
      version: entry.version,
      purpose: entry.purpose,
      isDeviation: entry.isDeviation,
      adrAssetId: entry.adrAssetId ?? "",
    })),
    relations: relationsToDraft(readAssetRelations(asset.metadata)),
  };
}

// 缺字段的旧数据补成空值，界面不因为扩展字段为空而拦截保存
function normalizeDraftStack(stack: TechStackEntryDraft[]) {
  return stack.map((entry) => ({
    name: entry.name.trim(),
    version: entry.version.trim(),
    purpose: entry.purpose.trim(),
    isDeviation: entry.isDeviation,
    adrAssetId: entry.isDeviation && entry.adrAssetId ? entry.adrAssetId : null,
  }));
}

export function validateAssetDraft(draft: AssetDraft) {
  // 发布记录的标题由版本号生成，不单独要求填
  if (draft.assetType !== "release_record" && !draft.title.trim()) {
    return "请填写标题。";
  }

  if (draft.title.trim().length > ASSET_TITLE_MAX_LENGTH) {
    return `标题最多 ${ASSET_TITLE_MAX_LENGTH} 个字。`;
  }

  // 技术档案的正文是选型说明，允许先留空，技术栈清单才是必填
  if (draft.assetType !== "tech_profile" && !draft.content.trim()) {
    if (draft.assetType === "rule") {
      return "请填写规则正文。";
    }

    return draft.assetType === "template"
      ? "请填写模板正文。"
      : draft.assetType === "graph_node"
        ? "请填写节点说明。"
        : "请填写文档正文。";
  }

  if (draft.assetType === "graph_node" && !draft.code.trim()) {
    return "请填写节点编号，例如 REQ-001。";
  }

  // 验收记录必须挂在一条需求上，否则覆盖统计算不出来
  if (draft.assetType === "evidence" && !draft.nodeId.trim()) {
    return "请选择这条验收记录对应的需求节点。";
  }

  // 版本号是发布记录的标识，没有它没法对应到一次真实发布
  if (draft.assetType === "release_record" && !draft.version.trim()) {
    return "请填写版本号或标签，例如 v2.10.0。";
  }

  if (draft.assetType === "document" && !draft.documentType.trim()) {
    return "请填写文档类型。";
  }

  // 发布记录文档的版本号对应一次真实发布，没有它没法回退到具体版本
  if (
    draft.assetType === "document" &&
    draft.documentType.trim() === "发布记录" &&
    !draft.version.trim()
  ) {
    return "请填写版本号或标签，例如 v2.17.0。";
  }

  if (draft.assetType === "tech_profile") {
    return validateTechStack(normalizeDraftStack(draft.stack));
  }

  return null;
}

// 编辑器里改不到的元数据（可信度、编译去向、编译裁决、来自哪个包）
// 要在保存时原样带回来，否则编辑一次导入的规则就把这些信息抹掉了
function keepRuleMetadata(metadata: RuleAssetMetadata | null) {
  if (!metadata) {
    return {};
  }

  return {
    ...(metadata.confidence ? { confidence: metadata.confidence } : {}),
    ...(metadata.compileTarget?.length
      ? { compileTarget: metadata.compileTarget }
      : {}),
    ...(metadata.compileDecision
      ? { compileDecision: metadata.compileDecision }
      : {}),
    ...(metadata.pack ? { pack: metadata.pack } : {}),
  };
}

function keepDocumentMetadata(metadata: DocumentAssetMetadata | null) {
  return metadata?.pack ? { pack: metadata.pack } : {};
}

function buildAsset(
  draft: AssetDraft,
  base: {
    id: string;
    projectId: string;
    versionId: string;
    status: AssetStatus;
    archivedAt: string | null;
    deletedAt: string | null;
    deletedReason: AssetData["deletedReason"];
    source: AssetData["source"];
    createdAt: string;
    updatedAt: string;
    // 更新时把编辑器改不到的字段带回来
    previousMetadata?: AssetData["metadata"] | null;
  },
): AssetData {
  const common = {
    id: base.id,
    projectId: base.projectId,
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    content: draft.content.trim(),
    source: base.source,
    currentVersionId: base.versionId,
    status: base.status,
    archivedAt: base.archivedAt,
    deletedAt: base.deletedAt,
    deletedReason: base.deletedReason,
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
  };

  if (draft.assetType === "rule") {
    const previousRuleMetadata =
      base.previousMetadata && "ruleType" in base.previousMetadata
        ? (base.previousMetadata as RuleAssetMetadata)
        : null;
    const ruleMetadata: RuleAssetMetadata = {
      ...keepRuleMetadata(previousRuleMetadata),
      ruleType: draft.ruleType,
      scope: draft.scope,
      purpose: draft.purpose.trim(),
      // 枚举留空时不写进元数据，避免出现空字符串这种非法取值
      ...(draft.level ? { level: draft.level } : {}),
      techContext: draft.techContext
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
      ...(draft.stage ? { stage: draft.stage } : {}),
      ...(draft.priority ? { priority: draft.priority } : {}),
      ...(draft.lifecycle ? { lifecycle: draft.lifecycle } : {}),
      ...(draft.overrideScope ? { overrideScope: draft.overrideScope } : {}),
      evidence: draft.evidence.trim(),
      verification: draft.verification.trim(),
      ...(draft.rationale.trim() ? { rationale: draft.rationale.trim() } : {}),
      ...(draft.sourceExcerpt.trim()
        ? { sourceExcerpt: draft.sourceExcerpt.trim() }
        : {}),
      ...(draft.relations.length
        ? { relations: draftRelationsToMetadata(draft.relations) }
        : {}),
    };

    return {
      ...common,
      assetType: "rule",
      metadata: ruleMetadata,
    };
  }

  if (draft.assetType === "tech_profile") {
    const techMetadata: TechProfileAssetMetadata = {
      stack: normalizeDraftStack(draft.stack).filter((entry) => entry.name),
      ...(draft.relations.length
        ? { relations: draftRelationsToMetadata(draft.relations) }
        : {}),
    };

    return {
      ...common,
      assetType: "tech_profile",
      metadata: techMetadata,
    };
  }

  if (draft.assetType === "template") {
    const templateMetadata: TemplateAssetMetadata = {
      outputFileName: draft.outputFileName.trim(),
      note: draft.note.trim(),
      ...(draft.relations.length
        ? { relations: draftRelationsToMetadata(draft.relations) }
        : {}),
    };

    return {
      ...common,
      assetType: "template",
      metadata: templateMetadata,
    };
  }

  if (draft.assetType === "graph_node") {
    const nodeMetadata: GraphNodeAssetMetadata = {
      nodeType: draft.nodeType,
      code: draft.code.trim(),
      parentId: draft.parentId.trim() ? draft.parentId : null,
      note: draft.note.trim(),
      ...(draft.relations.length
        ? { relations: draftRelationsToMetadata(draft.relations) }
        : {}),
    };

    return {
      ...common,
      assetType: "graph_node",
      metadata: nodeMetadata,
    };
  }

  if (draft.assetType === "evidence") {
    const evidenceMetadata: EvidenceAssetMetadata = {
      nodeId: draft.nodeId.trim() ? draft.nodeId : null,
      conclusion: draft.conclusion,
      commitRef: draft.commitRef.trim(),
      // 空行丢掉：说明和链接都空的证据不算一条
      evidenceItems: draft.evidenceItems
        .map((item) => ({
          label: item.label.trim(),
          reference: item.reference.trim(),
        }))
        .filter((item) => item.label || item.reference),
      ...(draft.relations.length
        ? { relations: draftRelationsToMetadata(draft.relations) }
        : {}),
    };

    return {
      ...common,
      assetType: "evidence",
      metadata: evidenceMetadata,
    };
  }

  if (draft.assetType === "release_record") {
    const releaseMetadata: ReleaseRecordMetadata = {
      version: draft.version.trim(),
      releasedAt: draft.releasedAt.trim(),
      result: draft.result,
      rollbackTarget: draft.rollbackTarget.trim(),
      // 空白的门禁行丢掉：没写检查内容的行不算一项
      gates: draft.gates
        .map((gate) => ({
          key: gate.key,
          label: gate.label.trim(),
          done: gate.done,
          note: gate.note.trim(),
        }))
        .filter((gate) => gate.label),
      ...(draft.relations.length
        ? { relations: draftRelationsToMetadata(draft.relations) }
        : {}),
    };

    return {
      ...common,
      // 标题没填就用版本号生成：一次发布只有一个版本号，不用再想名字
      title: common.title || `${releaseMetadata.version} 发布记录`,
      assetType: "release_record",
      metadata: releaseMetadata,
    };
  }

  // 文档类型决定要不要带上验收／发布这两个结构化块：
  // 换了文档类型就自然丢掉，避免「参考资料」带着半截字段进统计口径
  const documentType = draft.documentType.trim() || defaultDocumentType;
  const documentMetadata: DocumentAssetMetadata = {
    ...keepDocumentMetadata(
      base.previousMetadata && "documentType" in base.previousMetadata
        ? (base.previousMetadata as DocumentAssetMetadata)
        : null,
    ),
    documentType,
    ...(draft.role ? { role: draft.role } : {}),
    authority: draft.authority,
    module: draft.module.trim(),
    effectiveVersion: draft.effectiveVersion.trim(),
    sourceLocation: draft.sourceLocation.trim(),
    updateTrigger: draft.updateTrigger.trim(),
    freshness: draft.freshness.trim(),
    lastVerifiedAt: draft.lastVerifiedAt.trim(),
    ...(documentType === "验收记录"
      ? {
          evidence: {
            conclusion: draft.conclusion,
            commitRef: draft.commitRef.trim(),
          },
        }
      : {}),
    ...(documentType === "发布记录"
      ? {
          release: {
            version: draft.version.trim(),
            releasedAt: draft.releasedAt.trim(),
            result: draft.result,
            rollbackTarget: draft.rollbackTarget.trim(),
            gates: draft.gates
              .map((gate) => ({
                key: gate.key,
                label: gate.label.trim(),
                done: gate.done,
                note: gate.note.trim(),
              }))
              .filter((gate) => gate.label),
          },
        }
      : {}),
    ...(draft.relations.length
      ? { relations: draftRelationsToMetadata(draft.relations) }
      : {}),
  };

  return {
    ...common,
    assetType: "document",
    metadata: documentMetadata,
  };
}

// 归档状态与归档时间必须同时设置，避免出现有归档时间却仍活跃的资产。
function resolveArchivedAt(
  status: AssetStatus,
  previousArchivedAt: string | null,
  now: string,
) {
  if (status !== "archived") {
    return null;
  }

  return previousArchivedAt ?? now;
}

export function buildCreateAssetInput(input: {
  id: string;
  projectId: string;
  draft: AssetDraft;
  now: string;
}): AssetSaveInput {
  const versionId = createInitialAssetVersionId(input.id);
  const asset = buildAsset(input.draft, {
    id: input.id,
    projectId: input.projectId,
    versionId,
    status: input.draft.status,
    archivedAt: resolveArchivedAt(input.draft.status, null, input.now),
    deletedAt: null,
    deletedReason: null,
    source: {
      sourceType: "manual",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    createdAt: input.now,
    updatedAt: input.now,
  });

  return {
    asset,
    versionId,
    changeReason: "创建资产",
    versionReason: "initial",
  };
}

function describeSaveReason(asset: EditableAssetData, draft: AssetDraft) {
  if (asset.status !== draft.status) {
    if (draft.status === "archived") {
      return "归档资产";
    }

    if (asset.status === "archived") {
      return "重新激活资产";
    }

    return `状态改为${assetStatusLabels[draft.status]}`;
  }

  return "保存资产";
}

export function buildUpdateAssetInput(
  asset: EditableAssetData,
  draft: AssetDraft,
  options: { versionId: string; now: string },
): AssetSaveInput {
  const nextAsset = buildAsset(draft, {
    id: asset.id,
    projectId: asset.projectId,
    versionId: options.versionId,
    status: draft.status,
    archivedAt: resolveArchivedAt(
      draft.status,
      asset.archivedAt,
      options.now,
    ),
    deletedAt: asset.deletedAt,
    deletedReason: asset.deletedReason,
    source: asset.source,
    createdAt: asset.createdAt,
    updatedAt: options.now,
    previousMetadata: asset.metadata,
  });

  return {
    asset: nextAsset,
    versionId: options.versionId,
    changeReason: describeSaveReason(asset, draft),
    versionReason: "save",
  };
}

// 只改编译裁决：内容和其它元数据原样不动，仍然产生一个新版本。
// 恢复到「参与编译」且没有备注时，把裁决字段清掉，回到默认状态。
export function buildCompileDecisionInput(
  asset: RuleAssetData,
  decision: "included" | "excluded",
  note: string,
  options: { versionId: string; now: string },
): AssetSaveInput {
  const metadata: RuleAssetMetadata = { ...asset.metadata };

  if (decision === "excluded" || note.trim()) {
    metadata.compileDecision = {
      decision,
      note: note.trim(),
      decidedAt: options.now,
    };
  } else {
    delete metadata.compileDecision;
  }

  return {
    asset: {
      ...asset,
      metadata,
      currentVersionId: options.versionId,
      updatedAt: options.now,
    },
    versionId: options.versionId,
    changeReason:
      decision === "excluded" ? "排除参与编译" : "恢复到参与编译",
    versionReason: "save",
  };
}
