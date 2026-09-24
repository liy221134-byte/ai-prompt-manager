import type {
  PromptCardData,
  PromptDeletedReason,
} from "./prompts.ts";

export const assetTypes = [
  "prompt",
  "rule",
  "document",
  "template",
  "tech_profile",
  "rule_pack",
  "graph_node",
  "evidence",
  "release_record",
  "source_package",
] as const;
export type AssetType = (typeof assetTypes)[number];

export const assetStatuses = [
  "draft",
  "pending",
  "active",
  "archived",
  "deprecated",
] as const;
export type AssetStatus = (typeof assetStatuses)[number];

export const assetSourceTypes = [
  "manual",
  "import",
  "ai",
  "system",
] as const;
export type AssetSourceType = (typeof assetSourceTypes)[number];

// 资产之间的显式关系：先做这四类，弱关系以后按需要再加
export const assetRelationTypes = [
  "reference",
  "depends_on",
  "replaces",
  "implements",
] as const;
export type AssetRelationType = (typeof assetRelationTypes)[number];

export type AssetRelation = {
  targetAssetId: string;
  relationType: AssetRelationType;
  note: string;
};

export const ruleTypes = [
  "must",
  "forbidden",
  "recommended",
  "process",
  "acceptance",
  "technology",
] as const;
export type RuleType = (typeof ruleTypes)[number];

export const ruleScopes = ["global", "project", "task"] as const;
export type RuleScope = (typeof ruleScopes)[number];

// 规则的可信度：从「假设」到「已验证」，跟着资产包一起走
export const ruleConfidences = [
  "hypothesis",
  "provisional",
  "verified",
] as const;
export type RuleConfidence = (typeof ruleConfidences)[number];

// 规则适用的项目规模，和项目地图里的分级对齐
export const projectScales = [
  "personal",
  "medium",
  "large",
  "regulated",
] as const;
export type ProjectScale = (typeof projectScales)[number];

// 规则的编译去向：现在只存着，供后续版本生成 AGENTS.md 等交付物时用
export const compileTargets = [
  "agents",
  "readme",
  "start_prompt",
  "template",
  "none",
] as const;
export type CompileTarget = (typeof compileTargets)[number];

// 项目图谱的节点类型：需求、模块、数据、接口、测试
export const graphNodeTypes = [
  "requirement",
  "module",
  "data",
  "interface",
  "test",
] as const;
export type GraphNodeType = (typeof graphNodeTypes)[number];

// 验收记录的结论：默认待确认，改成「通过」只能由人在界面上操作
export const evidenceConclusions = [
  "pending",
  "passed",
  "failed",
  "exception",
] as const;
export type EvidenceConclusion = (typeof evidenceConclusions)[number];

// 发布记录的结果：还在发布中、已经发布、回滚了
export const releaseRecordResults = [
  "in_progress",
  "released",
  "rolled_back",
] as const;
export type ReleaseRecordResult = (typeof releaseRecordResults)[number];

// 编译裁决：这条规则在生成 AGENTS.md 这类产物时算不算数
export type RuleCompileDecision = {
  decision: "included" | "excluded";
  note: string;
  decidedAt: string;
};

// 规则的作用层级、执行阶段、优先级、生命周期和覆盖权限。
// 这些都是扩展字段，允许留空；旧数据缺字段按空值处理，不做强制补齐。
export const ruleLevels = ["global", "module", "task", "code"] as const;
export type RuleLevel = (typeof ruleLevels)[number];

export const ruleStages = ["plan", "implement", "verify", "release"] as const;
export type RuleStage = (typeof ruleStages)[number];

export const rulePriorities = ["must", "should", "may"] as const;
export type RulePriority = (typeof rulePriorities)[number];

export const ruleLifecycles = [
  "draft",
  "active",
  "deprecated",
  "archived",
] as const;
export type RuleLifecycle = (typeof ruleLifecycles)[number];

export const ruleOverrideScopes = ["none", "project", "task"] as const;
export type RuleOverrideScope = (typeof ruleOverrideScopes)[number];

// 文档角色：区分来源、工作稿、权威版和编译结果
export const documentRoles = [
  "source",
  "working",
  "authoritative",
  "compiled",
] as const;
export type DocumentRole = (typeof documentRoles)[number];

export const assetVersionReasons = [
  "initial",
  "save",
  "restore",
  "merge_before",
  "optimize_before",
  "restore_before",
  "migration",
] as const;
export type AssetVersionReason = (typeof assetVersionReasons)[number];

export type AssetDeletedReason = PromptDeletedReason;

export type AssetSourceData = {
  sourceType: AssetSourceType;
  sourceAssetId: string | null;
  importBatchId: string | null;
  originalFilename: string | null;
};

export type AssetLifecycleFields = {
  status: AssetStatus;
  archivedAt: string | null;
  deletedAt: string | null;
  deletedReason: AssetDeletedReason | null;
};

export type PromptAssetMetadata = {
  category: string;
  tags: string[];
  useCase: string;
  mergedIntoAssetId: string | null;
  mergeVersionId: string | null;
  relations?: AssetRelation[];
};

// 资产来自哪个规则包：记在成员资产上，包详情反查成员，避免两处各存一份
export type AssetPackLink = {
  packId: string;
  packItemId: string;
  packVersion: string;
  // 包内原始类型：method／playbook／rule／template／case_note 等，保留以便回溯
  packAssetType: string;
  projectScale: ProjectScale[];
};

export type RuleAssetMetadata = {
  ruleType: RuleType;
  scope: RuleScope;
  purpose?: string;
  level?: RuleLevel;
  techContext?: string[];
  stage?: RuleStage;
  priority?: RulePriority;
  lifecycle?: RuleLifecycle;
  overrideScope?: RuleOverrideScope;
  evidence?: string;
  verification?: string;
  // 为什么立这条规则、从原文哪句话来：冲突裁决和回溯时要用
  rationale?: string;
  sourceExcerpt?: string;
  confidence?: RuleConfidence;
  compileTarget?: CompileTarget[];
  compileDecision?: RuleCompileDecision;
  pack?: AssetPackLink;
  // 「另存为项目规则」脱钩出来的副本：记它原来是从哪个包的哪条规则来的。
  // 有它就在项目列表里顶掉公共正本；没它的老副本仍然被正本顶掉。
  // sourceAssetId 是主判据（从公共库直接挑进来的规则不一定属于某个包）；
  // packId/packItemId 只有包成员才有。
  detachedFrom?: {
    sourceAssetId?: string;
    packId?: string;
    packItemId?: string;
  };
  relations?: AssetRelation[];
};

export type DocumentAssetMetadata = {
  documentType: string;
  role?: DocumentRole;
  authority?: boolean;
  module?: string;
  effectiveVersion?: string;
  sourceLocation?: string;
  updateTrigger?: string;
  freshness?: string;
  lastVerifiedAt?: string;
  // 验收记录文档：结论与提交版本；覆盖哪些需求看它指向的需求节点（关系）。
  // 正文写验收条件、步骤、结果，元数据只留能用来算覆盖口径的部分。
  evidence?: DocumentEvidenceMetadata;
  // 发布记录文档：一次上线留一份，版本、结果和回滚目标在这里，门禁清单由人勾。
  release?: DocumentReleaseMetadata;
  pack?: AssetPackLink;
  relations?: AssetRelation[];
};

export type DocumentEvidenceMetadata = {
  conclusion: EvidenceConclusion;
  commitRef: string;
};

export type DocumentReleaseMetadata = {
  version: string;
  releasedAt: string;
  result: ReleaseRecordResult;
  rollbackTarget: string;
  gates: ReleaseGateItem[];
};

// 技术档案：一个项目一份，记录技术栈清单；选型说明写在资产正文里。
// 偏离默认选型的条目必须挂一条 ADR。
export type TechStackEntry = {
  name: string;
  version: string;
  purpose: string;
  isDeviation: boolean;
  adrAssetId: string | null;
};

export type TechProfileAssetMetadata = {
  stack: TechStackEntry[];
  relations?: AssetRelation[];
};

// 模板：产物结构的骨架，正文里的 {{变量}} 由使用方填。
// 变量不单独存，读取时从正文里解析，免得正文改了变量清单还对不上。
export type TemplateAssetMetadata = {
  outputFileName: string;
  note: string;
  relations?: AssetRelation[];
};

// 图谱节点：稳定编号 + 父节点串成树；映射关系继续用通用关系字段
export type GraphNodeAssetMetadata = {
  nodeType: GraphNodeType;
  code: string;
  parentId: string | null;
  note: string;
  relations?: AssetRelation[];
};

// 一条证据：说明 + 链接或文件路径（真传附件以后再说）
export type EvidenceItem = {
  label: string;
  reference: string;
};

// 验收记录：正文写验收条件、测试步骤、实际结果和已知问题；
// 元数据存结构化信息——对应哪个需求节点、结论、提交版本和证据清单。
export type EvidenceAssetMetadata = {
  nodeId: string | null;
  conclusion: EvidenceConclusion;
  commitRef: string;
  evidenceItems: EvidenceItem[];
  relations?: AssetRelation[];
};

// 一条门禁：做什么检查、做了没、证据是什么
export type ReleaseGateItem = {
  key: string;
  label: string;
  done: boolean;
  note: string;
};

// 发布记录：一次上线留一条，门禁项要人勾、要写证据说明
export type ReleaseRecordMetadata = {
  version: string;
  releasedAt: string;
  result: ReleaseRecordResult;
  rollbackTarget: string;
  gates: ReleaseGateItem[];
  relations?: AssetRelation[];
};

// 规则包：可复用的规则集合（一个项目可以装多个包）。
// 包自己的发布状态直接用资产状态，不再另存一份。
export type RulePackAssetMetadata = {
  packVersion: string;
  packConfidence: RuleConfidence;
  projectScale: ProjectScale[];
  sourceNote: string;
  // 这条是项目里的「引用记录」时，记下引用的是公共库哪个包（包资产标识是全局的，
  // 引用记录按项目各存一条，所以要单独记）
  packId?: string;
  // 这个项目从这个包里排除掉的包内编号（不填＝整包都要）。
  // 存「排除」而不是「选中」：公共库以后加规则时，项目默认能拿到新的。
  excludedItemIds?: string[];
  // 从公共资产库直接挑进来的规则（不复制正文、不属于某个包）。
  // 挑资产时写进这条「公共资产库挑入」引用记录。
  referencedAssetIds?: string[];
  relations?: AssetRelation[];
};

export type ReservedAssetMetadata = Record<string, unknown>;

type AssetBase<TType extends AssetType, TMetadata> = {
  id: string;
  projectId: string;
  assetType: TType;
  title: string;
  summary: string;
  content: string;
  metadata: TMetadata;
  source: AssetSourceData;
  currentVersionId: string;
  createdAt: string;
  updatedAt: string;
} & AssetLifecycleFields;

export type PromptAssetData = AssetBase<"prompt", PromptAssetMetadata>;
export type RuleAssetData = AssetBase<"rule", RuleAssetMetadata>;
export type DocumentAssetData = AssetBase<
  "document",
  DocumentAssetMetadata
>;
export type TechProfileAssetData = AssetBase<
  "tech_profile",
  TechProfileAssetMetadata
>;
export type RulePackAssetData = AssetBase<
  "rule_pack",
  RulePackAssetMetadata
>;
export type TemplateAssetData = AssetBase<"template", TemplateAssetMetadata>;
export type GraphNodeAssetData = AssetBase<
  "graph_node",
  GraphNodeAssetMetadata
>;
export type EvidenceAssetData = AssetBase<"evidence", EvidenceAssetMetadata>;
export type ReleaseRecordAssetData = AssetBase<
  "release_record",
  ReleaseRecordMetadata
>;
export type ReservedAssetType = "source_package";
export type ReservedAssetData = AssetBase<
  ReservedAssetType,
  ReservedAssetMetadata
>;

export type AssetData =
  | PromptAssetData
  | RuleAssetData
  | DocumentAssetData
  | TechProfileAssetData
  | RulePackAssetData
  | TemplateAssetData
  | GraphNodeAssetData
  | EvidenceAssetData
  | ReleaseRecordAssetData
  | ReservedAssetData;

type AssetVersionBase<TType extends AssetType, TMetadata> = {
  versionId: string;
  assetId: string;
  assetType: TType;
  versionNumber: number;
  title: string;
  summary: string;
  content: string;
  metadata: TMetadata;
  changeReason: string;
  versionReason: AssetVersionReason;
  sourceAssetIds: string[];
  restoredAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type PromptAssetVersionData = AssetVersionBase<
  "prompt",
  PromptAssetMetadata
>;
export type RuleAssetVersionData = AssetVersionBase<
  "rule",
  RuleAssetMetadata
>;
export type DocumentAssetVersionData = AssetVersionBase<
  "document",
  DocumentAssetMetadata
>;
export type TechProfileAssetVersionData = AssetVersionBase<
  "tech_profile",
  TechProfileAssetMetadata
>;
export type RulePackAssetVersionData = AssetVersionBase<
  "rule_pack",
  RulePackAssetMetadata
>;
export type TemplateAssetVersionData = AssetVersionBase<
  "template",
  TemplateAssetMetadata
>;
export type GraphNodeAssetVersionData = AssetVersionBase<
  "graph_node",
  GraphNodeAssetMetadata
>;
export type EvidenceAssetVersionData = AssetVersionBase<
  "evidence",
  EvidenceAssetMetadata
>;
export type ReleaseRecordAssetVersionData = AssetVersionBase<
  "release_record",
  ReleaseRecordMetadata
>;
export type ReservedAssetVersionData = AssetVersionBase<
  ReservedAssetType,
  ReservedAssetMetadata
>;

export type AssetVersionData =
  | PromptAssetVersionData
  | RuleAssetVersionData
  | DocumentAssetVersionData
  | TechProfileAssetVersionData
  | RulePackAssetVersionData
  | TemplateAssetVersionData
  | GraphNodeAssetVersionData
  | EvidenceAssetVersionData
  | ReleaseRecordAssetVersionData
  | ReservedAssetVersionData;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isValidDateString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    !Number.isNaN(new Date(value).getTime())
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

// 扩展字段都允许缺省；缺省和空值一律按「没填」处理，不拦截保存
function isOptionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function isOptionalEnum<T extends string>(value: unknown, allowed: readonly T[]) {
  return (
    value === undefined ||
    (typeof value === "string" && allowed.includes(value as T))
  );
}

function isOptionalStringList(value: unknown) {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}

function isAssetRelation(value: unknown): value is AssetRelation {
  return (
    isRecord(value) &&
    typeof value.targetAssetId === "string" &&
    Boolean(value.targetAssetId.trim()) &&
    assetRelationTypes.includes(value.relationType as AssetRelationType) &&
    typeof value.note === "string"
  );
}

function isOptionalRelations(value: unknown) {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every((item) => isAssetRelation(item)))
  );
}

function isOptionalEnumList<T extends string>(
  value: unknown,
  options: readonly T[],
) {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every((item) => options.includes(item as T)))
  );
}

function isAssetPackLink(value: unknown): value is AssetPackLink {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.packId === "string" &&
    Boolean(value.packId.trim()) &&
    typeof value.packItemId === "string" &&
    Boolean(value.packItemId.trim()) &&
    typeof value.packVersion === "string" &&
    typeof value.packAssetType === "string" &&
    Array.isArray(value.projectScale) &&
    value.projectScale.every((item) =>
      projectScales.includes(item as ProjectScale),
    )
  );
}

function isOptionalPackLink(value: unknown) {
  return value === undefined || isAssetPackLink(value);
}

function isOptionalCompileDecision(value: unknown) {
  if (value === undefined) {
    return true;
  }

  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.decision === "included" || value.decision === "excluded") &&
    typeof value.note === "string" &&
    isValidDateString(value.decidedAt)
  );
}

function isTechStackEntry(value: unknown): value is TechStackEntry {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    Boolean(value.name.trim()) &&
    typeof value.version === "string" &&
    typeof value.purpose === "string" &&
    typeof value.isDeviation === "boolean" &&
    isNullableString(value.adrAssetId)
  );
}

function isTechProfileAssetMetadata(
  value: unknown,
): value is TechProfileAssetMetadata {
  return (
    isRecord(value) &&
    Array.isArray(value.stack) &&
    value.stack.every((entry) => isTechStackEntry(entry)) &&
    isOptionalRelations(value.relations)
  );
}

function isAssetSourceData(value: unknown): value is AssetSourceData {
  if (!isRecord(value)) {
    return false;
  }

  return (
    assetSourceTypes.includes(value.sourceType as AssetSourceType) &&
    isNullableString(value.sourceAssetId) &&
    isNullableString(value.importBatchId) &&
    isNullableString(value.originalFilename)
  );
}

function isAssetLifecycleFields(
  value: Record<string, unknown>,
): value is AssetLifecycleFields {
  if (
    !assetStatuses.includes(value.status as AssetStatus) ||
    !isNullableString(value.archivedAt) ||
    !isNullableString(value.deletedAt)
  ) {
    return false;
  }

  if (value.archivedAt !== null && !isValidDateString(value.archivedAt)) {
    return false;
  }

  if (value.deletedAt !== null && !isValidDateString(value.deletedAt)) {
    return false;
  }

  if (value.deletedAt === null) {
    return value.deletedReason === null;
  }

  return value.deletedReason === "manual" || value.deletedReason === "merge";
}

function isPromptAssetMetadata(
  value: unknown,
): value is PromptAssetMetadata {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.category === "string" &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === "string") &&
    typeof value.useCase === "string" &&
    isNullableString(value.mergedIntoAssetId) &&
    isNullableString(value.mergeVersionId) &&
    isOptionalRelations(value.relations)
  );
}

function isRuleAssetMetadata(value: unknown): value is RuleAssetMetadata {
  if (!isRecord(value)) {
    return false;
  }

  return (
    ruleTypes.includes(value.ruleType as RuleType) &&
    ruleScopes.includes(value.scope as RuleScope) &&
    isOptionalString(value.purpose) &&
    isOptionalEnum(value.level, ruleLevels) &&
    isOptionalEnum(value.stage, ruleStages) &&
    isOptionalEnum(value.priority, rulePriorities) &&
    isOptionalEnum(value.lifecycle, ruleLifecycles) &&
    isOptionalEnum(value.overrideScope, ruleOverrideScopes) &&
    isOptionalString(value.evidence) &&
    isOptionalString(value.verification) &&
    isOptionalString(value.rationale) &&
    isOptionalString(value.sourceExcerpt) &&
    isOptionalEnum(value.confidence, ruleConfidences) &&
    isOptionalEnumList(value.compileTarget, compileTargets) &&
    isOptionalCompileDecision(value.compileDecision) &&
    isOptionalPackLink(value.pack) &&
    isOptionalStringList(value.techContext) &&
    isOptionalRelations(value.relations)
  );
}

// 给导入报错用：指出第一个不对的字段。
// 只报「数据无法识别」的话，手写或外部生成的包根本不知道改哪里。
export function findAssetDataProblem(value: unknown): string | null {
  if (isAssetData(value)) {
    return null;
  }

  if (!isRecord(value)) {
    return "资产内容不是对象";
  }

  if (!isAssetBase(value)) {
    return "缺少资产的基础字段（标识、项目、类型、标题、正文或时间）";
  }

  if (!assetTypes.includes(value.assetType as AssetType)) {
    return `不认识这种资产类型：${String(value.assetType)}`;
  }

  if (value.assetType === "rule") {
    return findRuleMetadataProblem(value.metadata);
  }

  return "资产的元数据不符合当前版本的结构";
}

function findRuleMetadataProblem(value: unknown): string | null {
  if (!isRecord(value)) {
    return "规则元数据不是对象";
  }

  if (!ruleTypes.includes(value.ruleType as RuleType)) {
    return `规则类型（ruleType）取值不认识：${String(value.ruleType)}`;
  }

  if (!ruleScopes.includes(value.scope as RuleScope)) {
    return `适用范围（scope）取值不认识：${String(value.scope)}`;
  }

  if (!isOptionalEnum(value.level, ruleLevels)) {
    return `作用层级（level）取值不认识：${String(value.level)}`;
  }

  if (!isOptionalEnum(value.stage, ruleStages)) {
    return `执行阶段（stage）取值不认识：${String(value.stage)}（可选值：${ruleStages.join("、")}）`;
  }

  if (!isOptionalEnum(value.priority, rulePriorities)) {
    return `优先级（priority）取值不认识：${String(value.priority)}`;
  }

  if (!isOptionalEnum(value.lifecycle, ruleLifecycles)) {
    return `生命周期（lifecycle）取值不认识：${String(value.lifecycle)}`;
  }

  if (!isOptionalEnum(value.overrideScope, ruleOverrideScopes)) {
    return `覆盖权限（overrideScope）取值不认识：${String(value.overrideScope)}`;
  }

  if (!isOptionalEnum(value.confidence, ruleConfidences)) {
    return `可信度（confidence）取值不认识：${String(value.confidence)}`;
  }

  if (!isOptionalEnumList(value.compileTarget, compileTargets)) {
    return "编译去向（compileTarget）里有不认识的取值";
  }

  if (!isOptionalCompileDecision(value.compileDecision)) {
    return "编译裁决（compileDecision）结构不正确";
  }

  if (!isOptionalPackLink(value.pack)) {
    return "来源包信息（pack）不完整";
  }

  if (!isOptionalStringList(value.techContext)) {
    return "技术上下文（techContext）应该是字符串数组";
  }

  if (!isOptionalRelations(value.relations)) {
    return "关系（relations）结构不正确";
  }

  return "规则元数据不符合当前版本的结构";
}

function isRulePackAssetMetadata(
  value: unknown,
): value is RulePackAssetMetadata {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.packVersion === "string" &&
    ruleConfidences.includes(value.packConfidence as RuleConfidence) &&
    Array.isArray(value.projectScale) &&
    value.projectScale.every((item) =>
      projectScales.includes(item as ProjectScale),
    ) &&
    typeof value.sourceNote === "string" &&
    isOptionalRelations(value.relations)
  );
}

function isTemplateAssetMetadata(
  value: unknown,
): value is TemplateAssetMetadata {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.outputFileName === "string" &&
    typeof value.note === "string" &&
    isOptionalRelations(value.relations)
  );
}

function isGraphNodeAssetMetadata(
  value: unknown,
): value is GraphNodeAssetMetadata {
  if (!isRecord(value)) {
    return false;
  }

  return (
    graphNodeTypes.includes(value.nodeType as GraphNodeType) &&
    typeof value.code === "string" &&
    isNullableString(value.parentId) &&
    typeof value.note === "string" &&
    isOptionalRelations(value.relations)
  );
}

function isEvidenceItem(value: unknown): value is EvidenceItem {
  return (
    isRecord(value) &&
    typeof value.label === "string" &&
    typeof value.reference === "string"
  );
}

function isEvidenceAssetMetadata(
  value: unknown,
): value is EvidenceAssetMetadata {
  return (
    isRecord(value) &&
    isNullableString(value.nodeId) &&
    evidenceConclusions.includes(value.conclusion as EvidenceConclusion) &&
    typeof value.commitRef === "string" &&
    Array.isArray(value.evidenceItems) &&
    value.evidenceItems.every((item) => isEvidenceItem(item)) &&
    isOptionalRelations(value.relations)
  );
}

function isReleaseGateItem(value: unknown): value is ReleaseGateItem {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    typeof value.label === "string" &&
    Boolean(value.label.trim()) &&
    typeof value.done === "boolean" &&
    typeof value.note === "string"
  );
}

function isReleaseRecordMetadata(
  value: unknown,
): value is ReleaseRecordMetadata {
  return (
    isRecord(value) &&
    typeof value.version === "string" &&
    typeof value.releasedAt === "string" &&
    releaseRecordResults.includes(value.result as ReleaseRecordResult) &&
    typeof value.rollbackTarget === "string" &&
    Array.isArray(value.gates) &&
    value.gates.every((item) => isReleaseGateItem(item)) &&
    isOptionalRelations(value.relations)
  );
}

function isDocumentAssetMetadata(
  value: unknown,
): value is DocumentAssetMetadata {
  return (
    isRecord(value) &&
    typeof value.documentType === "string" &&
    Boolean(value.documentType.trim()) &&
    isOptionalEnum(value.role, documentRoles) &&
    (value.authority === undefined || typeof value.authority === "boolean") &&
    isOptionalString(value.module) &&
    isOptionalString(value.effectiveVersion) &&
    isOptionalString(value.sourceLocation) &&
    isOptionalString(value.updateTrigger) &&
    isOptionalString(value.freshness) &&
    isOptionalString(value.lastVerifiedAt) &&
    (value.evidence === undefined || isDocumentEvidence(value.evidence)) &&
    (value.release === undefined || isDocumentRelease(value.release)) &&
    isOptionalPackLink(value.pack) &&
    isOptionalRelations(value.relations)
  );
}

// 验收记录文档的元数据块：结论只能取固定几种，提交版本可以留空
function isDocumentEvidence(value: unknown): value is DocumentEvidenceMetadata {
  return (
    isRecord(value) &&
    evidenceConclusions.includes(value.conclusion as EvidenceConclusion) &&
    typeof value.commitRef === "string"
  );
}

// 发布记录文档的元数据块：版本号必填，门禁清单可以为空数组
function isDocumentRelease(value: unknown): value is DocumentReleaseMetadata {
  return (
    isRecord(value) &&
    typeof value.version === "string" &&
    typeof value.releasedAt === "string" &&
    releaseRecordResults.includes(value.result as ReleaseRecordResult) &&
    typeof value.rollbackTarget === "string" &&
    Array.isArray(value.gates) &&
    value.gates.every((item) => isReleaseGateItem(item))
  );
}

function isAssetBase(
  value: unknown,
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    Boolean(value.id.trim()) &&
    typeof value.projectId === "string" &&
    Boolean(value.projectId.trim()) &&
    typeof value.title === "string" &&
    Boolean(value.title.trim()) &&
    typeof value.summary === "string" &&
    typeof value.content === "string" &&
    isAssetSourceData(value.source) &&
    typeof value.currentVersionId === "string" &&
    Boolean(value.currentVersionId.trim()) &&
    isValidDateString(value.createdAt) &&
    isValidDateString(value.updatedAt) &&
    isAssetLifecycleFields(value)
  );
}

export function isAssetData(value: unknown): value is AssetData {
  if (!isAssetBase(value) || !assetTypes.includes(value.assetType as AssetType)) {
    return false;
  }

  if (value.assetType === "prompt") {
    return isPromptAssetMetadata(value.metadata);
  }

  if (value.assetType === "rule") {
    return isRuleAssetMetadata(value.metadata);
  }

  if (value.assetType === "document") {
    return isDocumentAssetMetadata(value.metadata);
  }

  if (value.assetType === "tech_profile") {
    return isTechProfileAssetMetadata(value.metadata);
  }

  if (value.assetType === "rule_pack") {
    return isRulePackAssetMetadata(value.metadata);
  }

  if (value.assetType === "template") {
    return isTemplateAssetMetadata(value.metadata);
  }

  if (value.assetType === "graph_node") {
    return isGraphNodeAssetMetadata(value.metadata);
  }

  if (value.assetType === "evidence") {
    return isEvidenceAssetMetadata(value.metadata);
  }

  if (value.assetType === "release_record") {
    return isReleaseRecordMetadata(value.metadata);
  }

  return isRecord(value.metadata);
}

export function isAssetVersionData(
  value: unknown,
): value is AssetVersionData {
  if (!isRecord(value)) {
    return false;
  }

  if (
    typeof value.versionId !== "string" ||
    !value.versionId.trim() ||
    typeof value.assetId !== "string" ||
    !value.assetId.trim() ||
    !assetTypes.includes(value.assetType as AssetType) ||
    !Number.isInteger(value.versionNumber) ||
    Number(value.versionNumber) < 1 ||
    typeof value.title !== "string" ||
    typeof value.summary !== "string" ||
    typeof value.content !== "string" ||
    typeof value.changeReason !== "string" ||
    !value.changeReason.trim() ||
    !assetVersionReasons.includes(
      value.versionReason as AssetVersionReason,
    ) ||
    !Array.isArray(value.sourceAssetIds) ||
    !value.sourceAssetIds.every((item) => typeof item === "string") ||
    !isNullableString(value.restoredAt) ||
    !isNullableString(value.expiresAt) ||
    !isValidDateString(value.createdAt)
  ) {
    return false;
  }

  if (value.restoredAt !== null && !isValidDateString(value.restoredAt)) {
    return false;
  }

  if (value.expiresAt !== null && !isValidDateString(value.expiresAt)) {
    return false;
  }

  if (value.assetType === "prompt") {
    return isPromptAssetMetadata(value.metadata);
  }

  if (value.assetType === "rule") {
    return isRuleAssetMetadata(value.metadata);
  }

  if (value.assetType === "document") {
    return isDocumentAssetMetadata(value.metadata);
  }

  if (value.assetType === "tech_profile") {
    return isTechProfileAssetMetadata(value.metadata);
  }

  if (value.assetType === "rule_pack") {
    return isRulePackAssetMetadata(value.metadata);
  }

  if (value.assetType === "template") {
    return isTemplateAssetMetadata(value.metadata);
  }

  if (value.assetType === "graph_node") {
    return isGraphNodeAssetMetadata(value.metadata);
  }

  if (value.assetType === "evidence") {
    return isEvidenceAssetMetadata(value.metadata);
  }

  if (value.assetType === "release_record") {
    return isReleaseRecordMetadata(value.metadata);
  }

  return isRecord(value.metadata);
}

export function createInitialAssetVersionId(assetId: string) {
  return `current-${assetId}`;
}

// 迁移时保留原提示词标识和生命周期字段，确保旧恢复关系不断裂。
export function promptToAsset(
  prompt: PromptCardData,
  projectId: string,
): PromptAssetData {
  return {
    id: prompt.id,
    projectId,
    assetType: "prompt",
    title: prompt.title,
    summary: prompt.useCase,
    content: prompt.content,
    metadata: {
      category: prompt.category,
      tags: [...prompt.tags],
      useCase: prompt.useCase,
      mergedIntoAssetId: prompt.mergedIntoPromptId,
      mergeVersionId: prompt.mergeVersionId,
      ...(prompt.relations && prompt.relations.length > 0
        ? { relations: prompt.relations }
        : {}),
    },
    source: {
      sourceType: "system",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: createInitialAssetVersionId(prompt.id),
    status: "active",
    archivedAt: null,
    deletedAt: prompt.deletedAt,
    deletedReason: prompt.deletedReason,
    createdAt: prompt.createdAt,
    updatedAt: prompt.updatedAt,
  };
}

export function assetToPrompt(asset: PromptAssetData): PromptCardData {
  return {
    id: asset.id,
    title: asset.title,
    category: asset.metadata.category,
    tags: [...asset.metadata.tags],
    content: asset.content,
    useCase: asset.metadata.useCase,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    deletedAt: asset.deletedAt,
    deletedReason: asset.deletedReason,
    mergedIntoPromptId: asset.metadata.mergedIntoAssetId,
    mergeVersionId: asset.metadata.mergeVersionId,
    ...(asset.metadata.relations && asset.metadata.relations.length > 0
      ? { relations: asset.metadata.relations }
      : {}),
  };
}

export function createAssetVersion(
  asset: AssetData,
  input: {
    versionId: string;
    versionNumber: number;
    changeReason: string;
    createdAt: string;
    versionReason?: AssetVersionReason;
    sourceAssetIds?: string[];
    restoredAt?: string | null;
    expiresAt?: string | null;
  },
): AssetVersionData {
  return {
    versionId: input.versionId,
    assetId: asset.id,
    assetType: asset.assetType,
    versionNumber: input.versionNumber,
    title: asset.title,
    summary: asset.summary,
    content: asset.content,
    metadata: asset.metadata,
    changeReason: input.changeReason,
    versionReason: input.versionReason ?? "save",
    sourceAssetIds: [...(input.sourceAssetIds ?? [])],
    restoredAt: input.restoredAt ?? null,
    expiresAt: input.expiresAt ?? null,
    createdAt: input.createdAt,
  } as AssetVersionData;
}

// 文档类型的默认值：导入时先按参考资料归类，用户可以在编辑器里改
export const defaultDocumentType = "参考资料";

// 编辑器里用的完整形态：扩展字段缺省时补成空值，界面不需要自己兜底
export type RuleMetadataForm = {
  ruleType: RuleType;
  scope: RuleScope;
  purpose: string;
  level: RuleLevel | "";
  techContext: string[];
  stage: RuleStage | "";
  priority: RulePriority | "";
  lifecycle: RuleLifecycle | "";
  overrideScope: RuleOverrideScope | "";
  evidence: string;
  verification: string;
  rationale: string;
  sourceExcerpt: string;
  confidence: RuleConfidence | "";
  compileTarget: CompileTarget[];
};

// 规则包编辑器用的表单形状：包级字段单独一组，成员不在这里维护
export type RulePackMetadataForm = {
  packVersion: string;
  packConfidence: RuleConfidence;
  projectScale: ProjectScale[];
  sourceNote: string;
};

// 模板编辑器用的表单形状：产物文件名和备注都可以留空
export type TemplateMetadataForm = {
  outputFileName: string;
  note: string;
};

// 图谱节点编辑器用的表单形状：编号可以为空，父节点用空串表示根
export type GraphNodeMetadataForm = {
  nodeType: GraphNodeType;
  code: string;
  parentId: string;
  note: string;
};

// 验收记录编辑器用的表单形状：需求节点用空串表示还没挂
export type EvidenceMetadataForm = {
  nodeId: string;
  conclusion: EvidenceConclusion;
  commitRef: string;
  evidenceItems: EvidenceItem[];
};

// 发布记录编辑器用的表单形状
export type ReleaseRecordMetadataForm = {
  version: string;
  releasedAt: string;
  result: ReleaseRecordResult;
  rollbackTarget: string;
  gates: ReleaseGateItem[];
};

export type DocumentMetadataForm = {
  documentType: string;
  role: DocumentRole | "";
  authority: boolean;
  module: string;
  effectiveVersion: string;
  sourceLocation: string;
  updateTrigger: string;
  freshness: string;
  lastVerifiedAt: string;
};

// 文档里的验收记录块（文档类型为「验收记录」时用）
export type DocumentEvidenceForm = {
  conclusion: EvidenceConclusion;
  commitRef: string;
};

// 文档里的发布记录块（文档类型为「发布记录」时用）
export type DocumentReleaseForm = {
  version: string;
  releasedAt: string;
  result: ReleaseRecordResult;
  rollbackTarget: string;
  gates: ReleaseGateItem[];
};

function readEnum<T extends string>(value: unknown, allowed: readonly T[]): T | "" {
  return typeof value === "string" && allowed.includes(value as T)
    ? (value as T)
    : "";
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readStringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readEnumList<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T[] {
  return Array.isArray(value)
    ? value.filter((item): item is T => allowed.includes(item as T))
    : [];
}

export function normalizeRuleMetadata(value: unknown): RuleMetadataForm {
  const source = isRecord(value) ? value : {};

  return {
    ruleType: ruleTypes.includes(source.ruleType as RuleType)
      ? (source.ruleType as RuleType)
      : "recommended",
    scope: ruleScopes.includes(source.scope as RuleScope)
      ? (source.scope as RuleScope)
      : "project",
    purpose: readString(source.purpose),
    level: readEnum(source.level, ruleLevels),
    techContext: readStringList(source.techContext),
    stage: readEnum(source.stage, ruleStages),
    priority: readEnum(source.priority, rulePriorities),
    lifecycle: readEnum(source.lifecycle, ruleLifecycles),
    overrideScope: readEnum(source.overrideScope, ruleOverrideScopes),
    evidence: readString(source.evidence),
    verification: readString(source.verification),
    rationale: readString(source.rationale),
    sourceExcerpt: readString(source.sourceExcerpt),
    confidence: readEnum(source.confidence, ruleConfidences),
    compileTarget: readEnumList(source.compileTarget, compileTargets),
  };
}

export function normalizeRulePackMetadata(
  value: unknown,
): RulePackMetadataForm {
  const source = isRecord(value) ? value : {};

  return {
    packVersion: readString(source.packVersion),
    packConfidence: ruleConfidences.includes(
      source.packConfidence as RuleConfidence,
    )
      ? (source.packConfidence as RuleConfidence)
      : "provisional",
    projectScale: readEnumList(source.projectScale, projectScales),
    sourceNote: readString(source.sourceNote),
  };
}

export function normalizeTemplateMetadata(
  value: unknown,
): TemplateMetadataForm {
  const source = isRecord(value) ? value : {};

  return {
    outputFileName: readString(source.outputFileName),
    note: readString(source.note),
  };
}

export function normalizeGraphNodeMetadata(
  value: unknown,
): GraphNodeMetadataForm {
  const source = isRecord(value) ? value : {};

  return {
    nodeType: graphNodeTypes.includes(source.nodeType as GraphNodeType)
      ? (source.nodeType as GraphNodeType)
      : "requirement",
    code: readString(source.code),
    parentId: readString(source.parentId),
    note: readString(source.note),
  };
}

export function normalizeEvidenceMetadata(
  value: unknown,
): EvidenceMetadataForm {
  const source = isRecord(value) ? value : {};

  return {
    nodeId: readString(source.nodeId),
    conclusion: evidenceConclusions.includes(
      source.conclusion as EvidenceConclusion,
    )
      ? (source.conclusion as EvidenceConclusion)
      : "pending",
    commitRef: readString(source.commitRef),
    evidenceItems: Array.isArray(source.evidenceItems)
      ? source.evidenceItems
          .filter((item) => isEvidenceItem(item))
          .map((item) => ({ ...item }))
      : [],
  };
}

export function normalizeReleaseRecordMetadata(
  value: unknown,
): ReleaseRecordMetadataForm {
  const source = isRecord(value) ? value : {};

  return {
    version: readString(source.version),
    releasedAt: readString(source.releasedAt),
    result: releaseRecordResults.includes(source.result as ReleaseRecordResult)
      ? (source.result as ReleaseRecordResult)
      : "in_progress",
    rollbackTarget: readString(source.rollbackTarget),
    gates: Array.isArray(source.gates)
      ? source.gates
          .filter((item) => isReleaseGateItem(item))
          .map((item) => ({ ...item }))
      : [],
  };
}

export function normalizeDocumentMetadata(value: unknown): DocumentMetadataForm {
  const source = isRecord(value) ? value : {};

  return {
    documentType: readString(source.documentType) || defaultDocumentType,
    role: readEnum(source.role, documentRoles),
    authority: source.authority === true,
    module: readString(source.module),
    effectiveVersion: readString(source.effectiveVersion),
    sourceLocation: readString(source.sourceLocation),
    updateTrigger: readString(source.updateTrigger),
    freshness: readString(source.freshness),
    lastVerifiedAt: readString(source.lastVerifiedAt),
  };
}

// 文档里的验收记录块：没写过的按默认值兜底，界面上不用自己判空
export function normalizeDocumentEvidenceMetadata(
  value: unknown,
): DocumentEvidenceForm {
  const source = isRecord(value) ? value : {};

  return {
    conclusion: evidenceConclusions.includes(
      source.conclusion as EvidenceConclusion,
    )
      ? (source.conclusion as EvidenceConclusion)
      : "pending",
    commitRef: readString(source.commitRef),
  };
}

export function normalizeDocumentReleaseMetadata(
  value: unknown,
): DocumentReleaseForm {
  const source = isRecord(value) ? value : {};

  return {
    version: readString(source.version),
    releasedAt: readString(source.releasedAt),
    result: releaseRecordResults.includes(source.result as ReleaseRecordResult)
      ? (source.result as ReleaseRecordResult)
      : "in_progress",
    rollbackTarget: readString(source.rollbackTarget),
    gates: Array.isArray(source.gates)
      ? source.gates
          .filter((item) => isReleaseGateItem(item))
          .map((item) => ({ ...item }))
      : [],
  };
}

// 读文档元数据里的验收／发布块：只有对应文档类型才认，别的类型返回 null，
// 免得「参考资料」这种文档带着半截字段进统计口径
export function readDocumentEvidenceMetadata(metadata: unknown) {
  if (!isDocumentAssetMetadata(metadata) || !metadata.evidence) {
    return null;
  }

  return normalizeDocumentEvidenceMetadata(metadata.evidence);
}

export function readDocumentReleaseMetadata(metadata: unknown) {
  if (!isDocumentAssetMetadata(metadata) || !metadata.release) {
    return null;
  }

  return normalizeDocumentReleaseMetadata(metadata.release);
}

export function normalizeAssetRelations(value: unknown): AssetRelation[] {
  return Array.isArray(value)
    ? value.filter((item) => isAssetRelation(item)).map((item) => ({ ...item }))
    : [];
}

// 关系挂在各类资产的元数据上，读取统一走这里，免得每处都判断资产类型
export function readAssetRelations(metadata: unknown): AssetRelation[] {
  const source = isRecord(metadata) ? metadata : {};

  return normalizeAssetRelations(source.relations);
}

export function isAssetRelationList(value: unknown) {
  return isOptionalRelations(value);
}

export type TechProfileMetadataForm = {
  stack: TechStackEntry[];
  relations: AssetRelation[];
};

export function normalizeTechProfileMetadata(
  value: unknown,
): TechProfileMetadataForm {
  const source = isRecord(value) ? value : {};

  return {
    stack: Array.isArray(source.stack)
      ? source.stack
          .filter((entry) => isTechStackEntry(entry))
          .map((entry) => ({ ...entry }))
      : [],
    relations: normalizeAssetRelations(source.relations),
  };
}
