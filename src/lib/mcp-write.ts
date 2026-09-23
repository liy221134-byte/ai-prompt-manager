// MCP 写入：把 AI 传来的参数变成和界面同一条写入路径的保存输入。
// 边界：只做界面上已经有的可恢复操作——新建、编辑（产生新版本）、改状态。
// 没有删除，没有垃圾箱，没有永久删除：AI 能做的永远只是你在界面上能做的。

import {
  type AssetData,
  type AssetStatus,
  type DocumentRole,
  type GraphNodeType,
  type PromptAssetData,
  type RuleLevel,
  type RulePriority,
  type RuleScope,
  type RuleStage,
  type RuleType,
  createInitialAssetVersionId,
} from "../data/assets.ts";
import {
  type AssetDraft,
  assetToDraft,
  buildCreateAssetInput,
  buildUpdateAssetInput,
  validateAssetDraft,
} from "./asset-draft.ts";
import { findNodeWithSameCode, listProjectGraphNodes } from "./graph-node.ts";
import type { AssetSaveInput } from "./prompt-api.ts";

// MCP 能新建／编辑的资产类型；技术档案一个项目一份、结构特殊，先不开
export const mcpWritableAssetTypes = [
  "prompt",
  "rule",
  "document",
  "graph_node",
  "template",
] as const;
export type McpWritableAssetType = (typeof mcpWritableAssetTypes)[number];

export type McpAssetFields = {
  title?: string;
  content?: string;
  summary?: string;
  status?: AssetStatus;
  // 提示词
  category?: string;
  tags?: string[];
  useCase?: string;
  // 规则
  ruleType?: RuleType;
  scope?: RuleScope;
  level?: RuleLevel;
  priority?: RulePriority;
  stage?: RuleStage;
  purpose?: string;
  rationale?: string;
  sourceExcerpt?: string;
  // 文档
  documentType?: string;
  role?: DocumentRole;
  // 图谱节点
  nodeType?: GraphNodeType;
  code?: string;
  parentCode?: string;
  note?: string;
  // 模板
  outputFileName?: string;
};

export type McpAssetCreateInput = McpAssetFields & {
  assetType: McpWritableAssetType;
  projectId: string;
};

function readTitle(fields: McpAssetFields, fallback: string) {
  const title = (fields.title ?? fallback).trim();

  if (!title) {
    // 和编辑器里同一条提示，少一套说法
    throw new Error("请填写标题。");
  }

  return title;
}

// 标识格式和其他写入路径保持一致：<类型>-<uuid>
function createWritableAssetId(assetType: McpWritableAssetType) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${assetType}-${crypto.randomUUID()}`;
  }

  return `${assetType}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// 图谱节点的父节点用编号指定，同一个项目同一类型里找
function resolveParentId(
  assets: AssetData[],
  projectId: string,
  nodeType: GraphNodeType,
  parentCode: string | undefined,
  selfId: string,
) {
  const code = parentCode?.trim();

  if (!code) {
    return null;
  }

  const parent = listProjectGraphNodes(assets, projectId).find(
    (node) =>
      node.metadata.nodeType === nodeType &&
      node.id !== selfId &&
      node.metadata.code.toLocaleUpperCase() === code.toLocaleUpperCase(),
  );

  if (!parent) {
    throw new Error(
      `找不到编号为「${code}」的${nodeType}父节点，先在库里建好它。`,
    );
  }

  return parent.id;
}

// 编号唯一的口径和界面一致：同项目、同类型、忽略大小写
function assertNodeCodeAvailable(
  assets: AssetData[],
  projectId: string,
  input: { id: string; nodeType: GraphNodeType; code: string },
) {
  const conflict = findNodeWithSameCode(
    listProjectGraphNodes(assets, projectId),
    input,
  );

  if (conflict) {
    throw new Error(
      `编号「${conflict.metadata.code}」已经被「${conflict.title}」用了，换一个。`,
    );
  }
}

function buildPromptAsset(
  input: McpAssetCreateInput,
  options: { id: string; now: string },
): PromptAssetData {
  const useCase = (input.useCase ?? input.summary ?? "").trim();

  return {
    id: options.id,
    projectId: input.projectId,
    assetType: "prompt",
    title: readTitle(input, ""),
    summary: useCase,
    content: (input.content ?? "").trim(),
    metadata: {
      category: (input.category ?? "未分类").trim(),
      tags: (input.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
      useCase,
      mergedIntoAssetId: null,
      mergeVersionId: null,
    },
    source: {
      sourceType: "ai",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: null,
    },
    currentVersionId: createInitialAssetVersionId(options.id),
    status: input.status ?? "active",
    archivedAt: (input.status ?? "active") === "archived" ? options.now : null,
    deletedAt: null,
    deletedReason: null,
    createdAt: options.now,
    updatedAt: options.now,
  };
}

function createDraft(input: McpAssetCreateInput): AssetDraft {
  if (input.assetType === "rule") {
    return {
      assetType: "rule",
      title: input.title ?? "",
      summary: input.summary ?? "",
      content: input.content ?? "",
      status: input.status ?? "active",
      ruleType: input.ruleType ?? "must",
      scope: input.scope ?? "project",
      purpose: input.purpose ?? "",
      level: input.level ?? "",
      techContext: "",
      stage: input.stage ?? "",
      priority: input.priority ?? "",
      lifecycle: "",
      overrideScope: "",
      evidence: "",
      verification: "",
      rationale: input.rationale ?? "",
      sourceExcerpt: input.sourceExcerpt ?? "",
      relations: [],
    };
  }

  if (input.assetType === "graph_node") {
    return {
      assetType: "graph_node",
      title: input.title ?? "",
      summary: input.summary ?? "",
      content: input.content ?? "",
      status: input.status ?? "active",
      nodeType: input.nodeType ?? "requirement",
      code: input.code ?? "",
      parentId: "",
      note: input.note ?? "",
      relations: [],
    };
  }

  if (input.assetType === "template") {
    return {
      assetType: "template",
      title: input.title ?? "",
      summary: input.summary ?? "",
      content: input.content ?? "",
      status: input.status ?? "active",
      outputFileName: input.outputFileName ?? "",
      note: input.note ?? "",
      relations: [],
    };
  }

  return {
    assetType: "document",
    title: input.title ?? "",
    summary: input.summary ?? "",
    content: input.content ?? "",
    status: input.status ?? "active",
    documentType: input.documentType ?? "参考资料",
    role: input.role ?? "",
    authority: false,
    module: "",
    effectiveVersion: "",
    sourceLocation: "",
    updateTrigger: "",
    freshness: "",
    lastVerifiedAt: "",
    relations: [],
  };
}

// 只覆盖这次真的传了的字段，没传的一律保持原样
function patchDraft(draft: AssetDraft, patch: McpAssetFields): AssetDraft {
  const title = patch.title?.trim() || draft.title;
  const content = patch.content ?? draft.content;
  const summary = patch.summary ?? draft.summary;
  const status = patch.status ?? draft.status;

  if (draft.assetType === "rule") {
    return {
      ...draft,
      title,
      content,
      summary,
      status,
      ruleType: patch.ruleType ?? draft.ruleType,
      scope: patch.scope ?? draft.scope,
      level: patch.level ?? draft.level,
      priority: patch.priority ?? draft.priority,
      stage: patch.stage ?? draft.stage,
      purpose: patch.purpose ?? draft.purpose,
      rationale: patch.rationale ?? draft.rationale,
      sourceExcerpt: patch.sourceExcerpt ?? draft.sourceExcerpt,
    };
  }

  if (draft.assetType === "graph_node") {
    return {
      ...draft,
      title,
      content,
      summary,
      status,
      nodeType: patch.nodeType ?? draft.nodeType,
      code: patch.code?.trim() || draft.code,
      note: patch.note ?? draft.note,
    };
  }

  if (draft.assetType === "template") {
    return {
      ...draft,
      title,
      content,
      summary,
      status,
      outputFileName: patch.outputFileName ?? draft.outputFileName,
      note: patch.note ?? draft.note,
    };
  }

  if (draft.assetType === "document") {
    return {
      ...draft,
      title,
      content,
      summary,
      status,
      documentType: patch.documentType?.trim() || draft.documentType,
      role: patch.role ?? draft.role,
    };
  }

  return { ...draft, title, content, summary, status };
}

function markAiSource(input: AssetSaveInput): AssetSaveInput {
  return {
    ...input,
    asset: {
      ...input.asset,
      source: {
        sourceType: "ai",
        sourceAssetId: null,
        importBatchId: null,
        originalFilename: null,
      },
    },
  };
}

export function buildMcpCreateAsset(
  input: McpAssetCreateInput,
  options: { now: string; assets: AssetData[]; id?: string },
): AssetSaveInput {
  const id = options.id ?? createWritableAssetId(input.assetType);

  if (input.assetType === "prompt") {
    const asset = buildPromptAsset(input, { id, now: options.now });

    if (!asset.content) {
      throw new Error("提示词正文不能为空。");
    }

    return {
      asset,
      versionId: asset.currentVersionId,
      changeReason: "MCP 新建",
      versionReason: "initial",
    };
  }

  const draft = createDraft(input);
  const error = validateAssetDraft(draft);

  if (error) {
    throw new Error(error);
  }

  if (draft.assetType === "graph_node") {
    assertNodeCodeAvailable(options.assets, input.projectId, {
      id,
      nodeType: draft.nodeType,
      code: draft.code,
    });
    draft.parentId =
      resolveParentId(
        options.assets,
        input.projectId,
        draft.nodeType,
        input.parentCode,
        id,
      ) ?? "";
  }

  return markAiSource(
    buildCreateAssetInput({
      id,
      projectId: input.projectId,
      draft,
      now: options.now,
    }),
  );
}

export function buildMcpUpdateAsset(
  asset: AssetData,
  patch: McpAssetFields,
  options: { versionId: string; now: string; assets: AssetData[] },
): AssetSaveInput {
  if (asset.assetType === "prompt") {
    const useCase = (patch.useCase ?? patch.summary ?? asset.metadata.useCase).trim();
    const next: PromptAssetData = {
      ...asset,
      title: patch.title?.trim() || asset.title,
      summary: useCase,
      content: patch.content ?? asset.content,
      metadata: {
        ...asset.metadata,
        category: patch.category?.trim() || asset.metadata.category,
        tags: patch.tags ?? asset.metadata.tags,
        useCase,
      },
      currentVersionId: options.versionId,
      updatedAt: options.now,
    };

    if (!next.content.trim()) {
      throw new Error("提示词正文不能为空。");
    }

    return {
      asset: next,
      versionId: options.versionId,
      changeReason: "MCP 更新",
      versionReason: "save",
    };
  }

  if (
    asset.assetType !== "rule" &&
    asset.assetType !== "document" &&
    asset.assetType !== "template" &&
    asset.assetType !== "graph_node"
  ) {
    throw new Error("这一类资产还不支持通过 MCP 修改。");
  }

  const draft = patchDraft(assetToDraft(asset), patch);
  const error = validateAssetDraft(draft);

  if (error) {
    throw new Error(error);
  }

  if (draft.assetType === "graph_node") {
    assertNodeCodeAvailable(options.assets, asset.projectId, {
      id: asset.id,
      nodeType: draft.nodeType,
      code: draft.code,
    });

    if (patch.parentCode !== undefined) {
      draft.parentId =
        resolveParentId(
          options.assets,
          asset.projectId,
          draft.nodeType,
          patch.parentCode,
          asset.id,
        ) ?? "";
    }
  }

  return buildUpdateAssetInput(asset, draft, {
    versionId: options.versionId,
    now: options.now,
  });
}

// 改状态和界面上的「归档／重新激活」走同一条路，内容不动，仍然产生新版本
export function buildMcpStatusChange(
  asset: AssetData,
  status: AssetStatus,
  options: { versionId: string; now: string; assets: AssetData[] },
): AssetSaveInput {
  if (asset.assetType === "prompt") {
    const archivedAt =
      status === "archived" ? (asset.archivedAt ?? options.now) : null;

    return {
      asset: {
        ...asset,
        status,
        archivedAt,
        currentVersionId: options.versionId,
        updatedAt: options.now,
      },
      versionId: options.versionId,
      changeReason: status === "archived" ? "MCP 归档" : "MCP 恢复",
      versionReason: "save",
    };
  }

  return buildMcpUpdateAsset(asset, { status }, options);
}
