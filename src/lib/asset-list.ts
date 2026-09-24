import type {
  AssetData,
  AssetStatus,
  AssetType,
  ProjectScale,
  RuleConfidence,
  AssetRelationType,
  EvidenceConclusion,
  ReleaseRecordResult,
  GraphNodeType,
  RuleScope,
  RuleType,
} from "../data/assets.ts";
import { readAssetRelations } from "../data/assets.ts";
import type { PromptCardData } from "../data/prompts.ts";
import { readAssetPackLink } from "./rule-pack.ts";

export const assetTypeLabels: Record<AssetType, string> = {
  prompt: "提示词",
  rule: "规则",
  document: "文档",
  template: "模板",
  tech_profile: "技术档案",
  rule_pack: "规则包",
  graph_node: "图谱节点",
  evidence: "验收记录",
  release_record: "发布记录",
  source_package: "来源包",
};

export const evidenceConclusionLabels: Record<EvidenceConclusion, string> = {
  pending: "待确认",
  passed: "通过",
  failed: "未通过",
  exception: "例外",
};

export const releaseRecordResultLabels: Record<ReleaseRecordResult, string> = {
  in_progress: "进行中",
  released: "已发布",
  rolled_back: "已回滚",
};

export const graphNodeTypeLabels: Record<GraphNodeType, string> = {
  requirement: "需求",
  module: "模块",
  data: "数据",
  interface: "接口",
  test: "测试",
};

// 2.0.0 只开放提示词、规则和文档三种筛选，模板和技术档案由后续版本接入。
export const assetTypeFilterOptions = [
  "all",
  "prompt",
  "rule",
  "document",
  "tech_profile",
  "template",
  "rule_pack",
  "graph_node",
  "evidence",
  "release_record",
] as const;
export type AssetTypeFilter = (typeof assetTypeFilterOptions)[number];

// 首屏分成三个视图：公共资产（账号共享的方法库，也就是原来的默认项目）、
// 项目文档（这个项目要做什么、怎么定、验过没有）和代码（代码和数据结构长什么样）。
// 视图决定列表里出现哪些资产类型——提示词只属于公共资产；
// 图谱节点按节点类型分两条链路，见 readGraphNodeLane。
export const workspaceViews = ["public", "project", "code"] as const;
export type WorkspaceView = (typeof workspaceViews)[number];

export const workspaceViewLabels: Record<WorkspaceView, string> = {
  public: "公共资产",
  project: "文档",
  code: "代码",
};

// 每个视图里的类型标签，顺序就是界面顺序
export const workspaceViewTypeOptions: Record<
  WorkspaceView,
  AssetTypeFilter[]
> = {
  public: ["all", "prompt", "rule", "document", "template", "rule_pack"],
  project: ["all", "rule", "document", "template", "graph_node"],
  code: ["all", "graph_node"],
};

// 视图里能出现的资产类型。技术档案两个视图都不列：一个项目只有一份，
// 它是项目属性，入口放在「项目设置」里。
// 验收记录和发布记录这两种老类型仍然列在文档视图里，只为了让老数据还能看到；
// 界面上不再提供新建入口，它们已经归位成文档类型。
export const workspaceViewAssetTypes: Record<WorkspaceView, AssetType[]> = {
  public: ["prompt", "rule", "document", "template", "rule_pack"],
  project: [
    "rule",
    "document",
    "template",
    "graph_node",
    "evidence",
    "release_record",
  ],
  code: ["graph_node"],
};

// 每类资产回答什么问题。界面上直接用这句话消除「这到底是什么」的疑问。
export const assetTypeDescriptions: Record<AssetType, string> = {
  prompt: "可以直接复制去用的提示词模板",
  rule: "约束 AI 怎么做事的规则，可以编译成 AGENTS.md",
  document: "项目过程产出的文档，例如 PRD、ADR、架构说明、验收清单",
  template: "产物的结构模板，规则编译时可以套用",
  tech_profile: "这个项目用什么技术，一个项目只有一份",
  rule_pack: "一组规则和文档的打包，装进项目就有一整套",
  graph_node: "需求、模块、数据、接口、测试的编号节点",
  evidence: "一条需求的验收条件、步骤、结果和证据",
  release_record: "一次上线的门禁清单和结果",
  source_package: "导入时保留的原始文件",
};

// 图谱节点分两条链路：需求节点跟着文档走（需求树），
// 模块／数据／接口／测试节点是代码那一侧的东西。
export type GraphNodeLane = "document" | "code";

export function readGraphNodeLane(nodeType: GraphNodeType): GraphNodeLane {
  return nodeType === "requirement" ? "document" : "code";
}

export function matchesWorkspaceViewAsset(
  view: WorkspaceView,
  asset: AssetData,
) {
  if (asset.assetType === "graph_node") {
    const lane = readGraphNodeLane(asset.metadata.nodeType);

    return view === (lane === "document" ? "project" : "code");
  }

  return workspaceViewAssetTypes[view].includes(asset.assetType);
}

// 同一个类型在两个视图里叫法不同：公共库里的「文档」是方法级参考，
// 项目里的「文档」才是这次做的事。类型不变，说法和说明按视图给。
export function readTypeFilterLabel(
  view: WorkspaceView,
  option: AssetTypeFilter,
) {
  if (option === "document" && view === "public") {
    return "参考文档";
  }

  if (option === "graph_node") {
    return view === "code" ? "代码节点" : "需求节点";
  }

  return assetTypeFilterLabels[option];
}

export function readTypeFilterDescription(
  view: WorkspaceView,
  option: AssetTypeFilter,
) {
  if (option === "document") {
    return view === "public"
      ? "方法级参考资料：项目画像、案例、方法说明。项目自己的文档放项目里，别往这里堆。"
      : "这个项目这次做的事：需求、规格、交付说明、验收、发布";
  }

  if (option === "graph_node") {
    return view === "code"
      ? "代码和数据结构那一侧的节点：模块、数据、接口、测试。看改动会波及谁。"
      : "需求节点：这个项目要做的事，按编号串成树。模块和数据表在代码视图里。";
  }

  return option === "all" ? "" : assetTypeDescriptions[option];
}

// 提示词是一次性取用的东西：复制给智能体之后，关系对它没有实际用处。
// 2026-09-24 产品负责人决定在提示词界面隐藏关系区——数据保留，只是不显示；
// 以后要恢复，把这个开关改回 true 即可。
export const showPromptRelations = false;

// 切换视图后，原来停着的标签可能不属于新视图，统一退回「全部」
export function resolveWorkspaceTypeFilter(
  view: WorkspaceView,
  current: AssetTypeFilter,
): AssetTypeFilter {
  return workspaceViewTypeOptions[view].includes(current) ? current : "all";
}

export const assetTypeFilterLabels: Record<AssetTypeFilter, string> = {
  all: "全部",
  prompt: "提示词",
  rule: "规则",
  document: "文档",
  tech_profile: "技术档案",
  template: "模板",
  rule_pack: "规则包",
  graph_node: "图谱节点",
  evidence: "验收记录",
  release_record: "发布记录",
};

export const assetRelationLabels: Record<AssetRelationType, string> = {
  reference: "引用",
  depends_on: "依赖",
  replaces: "替代",
  implements: "实现",
};

export const assetStatusLabels: Record<AssetStatus, string> = {
  draft: "草稿",
  pending: "待确认",
  active: "活跃",
  archived: "已归档",
  deprecated: "已废弃",
};

// 状态筛选把活跃放在第一位，因为它是列表默认口径。
export const assetStatusFilterOptions: AssetStatus[] = [
  "active",
  "draft",
  "pending",
  "deprecated",
  "archived",
];

export const ruleTypeLabels: Record<RuleType, string> = {
  must: "必须",
  forbidden: "禁止",
  recommended: "建议",
  process: "流程",
  acceptance: "验收",
  technology: "技术约束",
};

export const ruleConfidenceLabels: Record<RuleConfidence, string> = {
  hypothesis: "假设",
  provisional: "暂时验证",
  verified: "已验证",
};

export const projectScaleLabels: Record<ProjectScale, string> = {
  personal: "个人工具",
  medium: "中型云端产品",
  large: "大型平台",
  regulated: "受监管项目",
};

export const ruleScopeLabels: Record<RuleScope, string> = {
  global: "全局",
  project: "项目",
  task: "任务临时",
};

// 文档类型的顺序就是链路顺序：需求 → 规格与计划 → 交付 → 验收 → 发布 → 其他。
// 新建文档时下拉里按这个顺序排，和项目文档页签的分组对得上。
export const documentTypeOptions = [
  "PRD",
  "实现规格",
  "ADR",
  "架构说明",
  "数据流说明",
  "数据库说明",
  "环境变量清单",
  "备份说明",
  "安全检查",
  "故障手册",
  "成本与性能",
  "验收记录",
  "发布记录",
  "发布手册",
  "参考资料",
  "其他",
] as const;

// 列表默认只显示活跃资产，草稿、归档和垃圾箱内容不进入列表。
export function isActiveAsset(asset: AssetData) {
  return (
    asset.status === "active" &&
    asset.archivedAt === null &&
    asset.deletedAt === null
  );
}

export function isTrashedAsset(asset: AssetData) {
  return asset.deletedAt !== null;
}

// 资产是不是某个规则包带来的
export function isAssetFromPack(asset: AssetData, packId: string) {
  return readAssetPackLink(asset.metadata)?.packId === packId;
}

export function filterProjectAssets(
  assets: AssetData[],
  options: {
    projectId: string;
    assetType?: AssetType;
    status?: AssetStatus;
    // 组合筛选：标签和关系目标
    tag?: string;
    relationTargetId?: string;
    // 按规则包筛选：只看某个包带来的资产
    packId?: string;
  },
) {
  return assets.filter((asset) => {
    if (asset.projectId !== options.projectId || isTrashedAsset(asset)) {
      return false;
    }

    if (options.assetType && asset.assetType !== options.assetType) {
      return false;
    }

    if (options.tag && !readAssetTags(asset).includes(options.tag)) {
      return false;
    }

    if (options.packId && !isAssetFromPack(asset, options.packId)) {
      return false;
    }

    if (
      options.relationTargetId &&
      !readAssetRelations(asset.metadata).some(
        (relation) => relation.targetAssetId === options.relationTargetId,
      )
    ) {
      return false;
    }

    return asset.status === (options.status ?? "active");
  });
}

export function matchesAssetTypeFilter(
  asset: AssetData,
  filter: AssetTypeFilter,
) {
  return filter === "all" || asset.assetType === filter;
}

export function matchesAssetStatusFilter(
  asset: AssetData,
  status: AssetStatus,
) {
  return asset.status === status;
}

// 没有填写说明时用正文首行代替，保证列表卡片始终有可读的简介。
export function describeAssetSummary(asset: AssetData) {
  const summary = asset.summary.trim();

  if (summary) {
    return summary;
  }

  const firstLine = asset.content
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstLine ?? "";
}

// 各类型的「标签」来源不同：提示词用标签，规则用技术上下文，技术档案用技术栈名称
export function readAssetTags(asset: AssetData) {
  if (asset.assetType === "prompt") {
    return [...asset.metadata.tags];
  }

  if (asset.assetType === "rule") {
    return [...(asset.metadata.techContext ?? [])];
  }

  if (asset.assetType === "tech_profile") {
    return asset.metadata.stack
      .map((entry) => entry.name.trim())
      .filter(Boolean);
  }

  return [];
}

// 搜索范围：标题、说明、正文、类型、标签、技术栈名称和关系说明
function readRelationNotes(asset: AssetData) {
  return readAssetRelations(asset.metadata).map((relation) => relation.note);
}

export function buildAssetSearchText(asset: AssetData) {
  return [
    asset.title,
    asset.summary,
    asset.content,
    assetTypeLabels[asset.assetType],
    ...readAssetTags(asset),
    ...readRelationNotes(asset),
  ]
    .join(" ")
    .toLocaleLowerCase();
}

// 当前项目里出现过的标签，供筛选下拉使用
export function listProjectTags(assets: AssetData[], projectId: string) {
  const tags = new Set<string>();

  for (const asset of assets) {
    if (asset.projectId !== projectId || isTrashedAsset(asset)) {
      continue;
    }

    for (const tag of readAssetTags(asset)) {
      tags.add(tag);
    }
  }

  return [...tags].sort((left, right) => left.localeCompare(right, "zh"));
}

// 当前项目里被指向过的关系目标，供筛选下拉使用
export function listRelationTargets(assets: AssetData[], projectId: string) {
  const ids = new Set<string>();

  for (const asset of assets) {
    if (asset.projectId !== projectId) {
      continue;
    }

    for (const relation of readAssetRelations(asset.metadata)) {
      ids.add(relation.targetAssetId);
    }
  }

  return assets.filter(
    (asset) =>
      ids.has(asset.id) && asset.projectId === projectId && !asset.deletedAt,
  );
}

// 关系目标候选：同项目、没进垃圾箱、去掉正在编辑的那条，
// 否则编辑器里会建出「指向自己」的关系。
export function listRelationTargetOptions(
  assets: AssetData[],
  options: { projectId: string; excludeAssetIds?: string[] },
) {
  const excludedIds = new Set(options.excludeAssetIds ?? []);

  return assets
    .filter(
      (asset) =>
        asset.projectId === options.projectId &&
        !isTrashedAsset(asset) &&
        !excludedIds.has(asset.id),
    )
    .map((asset) => ({ id: asset.id, title: asset.title }));
}

// 筛选目标被删除或归档后，下拉里就没有这个选项了。
// 这时把筛选复位，避免列表变成空的、又看不出是哪个条件造成的。
export function resetMissingFilter(current: string, available: string[]) {
  return current !== "" && !available.includes(current) ? "" : current;
}

// 默认项目里的提示词走的是老列表（不走 filterProjectAssets），
// 所以标签和关系目标这两个筛选要在这里再判一次。
export function matchesPromptLibraryFilters(
  prompt: PromptCardData,
  options: { tag?: string; relationTargetId?: string },
) {
  if (options.tag && !prompt.tags.includes(options.tag)) {
    return false;
  }

  if (
    options.relationTargetId &&
    !(prompt.relations ?? []).some(
      (relation) => relation.targetAssetId === options.relationTargetId,
    )
  ) {
    return false;
  }

  return true;
}
