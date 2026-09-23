// 确认创建：把用户在预览里确认过的草稿落成正式项目和资产。
// 这里是纯逻辑，只负责算出「要创建什么」，写库由接口用一次事务完成。

import type {
  AssetData,
  AssetVersionData,
  DocumentAssetMetadata,
  PromptAssetMetadata,
  RuleAssetMetadata,
} from "../data/assets.ts";
import { defaultDocumentType } from "../data/assets.ts";
import type { ProjectData } from "../data/projects.ts";
import { defaultProjectRiskLevel } from "../data/projects.ts";
import type {
  SourcePackageDraft,
  SourcePackageDraftType,
} from "./source-package-draft.ts";

export const SOURCE_PACKAGE_DEFAULT_CATEGORY = "导入";

export type SourcePackageUploadRef = {
  uploadId: string;
  filename: string;
  storedPath: string;
  byteSize: number;
};

export type SourcePackageProjectChoice =
  | { mode: "new"; name: string; goal: string; stage?: string }
  | { mode: "existing"; projectId: string };

export type SourcePackageCreationPlan = {
  project: ProjectData | null;
  sourcePackages: AssetData[];
  assets: Array<{ asset: AssetData; version: AssetVersionData }>;
};

function createMetadata(
  assetType: SourcePackageDraftType,
  item: SourcePackageDraft["items"][number],
) {
  if (assetType === "prompt") {
    const metadata: PromptAssetMetadata = {
      category: SOURCE_PACKAGE_DEFAULT_CATEGORY,
      tags: [],
      useCase: item.summary,
      mergedIntoAssetId: null,
      mergeVersionId: null,
    };

    return metadata;
  }

  if (assetType === "rule") {
    const metadata: RuleAssetMetadata = {
      // AI 提取的规则先按「建议 + 项目范围」落库，具体类型由用户在编辑器里改
      ruleType: "recommended",
      scope: "project",
    };

    return metadata;
  }

  const metadata: DocumentAssetMetadata = {
    documentType: defaultDocumentType,
  };

  return metadata;
}

// 正式保存的第 1 版：来源指向对应的来源包资产
function createInitialVersion(
  asset: AssetData,
  input: { versionId: string; now: string; sourceAssetIds: string[] },
): AssetVersionData {
  return {
    versionId: input.versionId,
    assetId: asset.id,
    assetType: asset.assetType,
    versionNumber: 1,
    title: asset.title,
    summary: asset.summary,
    content: asset.content,
    metadata: asset.metadata,
    changeReason: "导入文档包",
    versionReason: "initial",
    sourceAssetIds: [...input.sourceAssetIds],
    restoredAt: null,
    expiresAt: null,
    createdAt: input.now,
  } as AssetVersionData;
}

export function planSourcePackageCreation(input: {
  draft: SourcePackageDraft;
  uploads: SourcePackageUploadRef[];
  importBatchId: string;
  project: SourcePackageProjectChoice;
  now?: string;
}): SourcePackageCreationPlan {
  const now = input.now ?? new Date().toISOString();
  const projectId =
    input.project.mode === "existing"
      ? input.project.projectId
      : `project-${input.importBatchId}`;

  const project: ProjectData | null =
    input.project.mode === "new"
      ? {
          id: projectId,
          name: input.project.name.trim() || "导入的项目",
          description: input.project.goal.trim(),
          status: "active",
          stage:
            input.project.stage === "prototype" ||
            input.project.stage === "release" ||
            input.project.stage === "maintenance"
              ? input.project.stage
              : "development",
          // 导入出来的项目还不知道风险多大，先按最低等级，用户在项目设置里改
          riskLevel: defaultProjectRiskLevel,
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
        }
      : null;

  // 每个上传文件留一条只读的来源包资产，正文不进资产内容，只记文件名和相对路径
  const sourcePackages: AssetData[] = input.uploads.map((upload, index) => {
    const id = `pkg-${input.importBatchId}-${index + 1}`;

    return {
      id,
      projectId,
      assetType: "source_package",
      title: upload.filename,
      summary: "导入时保留的原始文件",
      content: "",
      metadata: {
        originalFilename: upload.filename,
        byteSize: upload.byteSize,
        storedPath: upload.storedPath,
        uploadedAt: now,
      },
      source: {
        sourceType: "import",
        sourceAssetId: null,
        importBatchId: input.importBatchId,
        originalFilename: upload.filename,
      },
      currentVersionId: `current-${id}`,
      status: "active",
      archivedAt: null,
      deletedAt: null,
      deletedReason: null,
      createdAt: now,
      updatedAt: now,
    } as AssetData;
  });

  const sourcePackageByFilename = new Map(
    sourcePackages.map((asset) => [asset.title, asset.id]),
  );

  const assets = input.draft.items.map((item, index) => {
    const assetType = item.assetType;
    const id = `${assetType}-${input.importBatchId}-${index + 1}`;
    const sourceAssetIds = sourcePackageByFilename.has(item.sourceFilename)
      ? [sourcePackageByFilename.get(item.sourceFilename) as string]
      : [];

    const asset = {
      id,
      projectId,
      assetType,
      title: item.title,
      summary: item.summary,
      content: item.content,
      metadata: createMetadata(assetType, item),
      source: {
        sourceType: "import",
        sourceAssetId: sourceAssetIds[0] ?? null,
        importBatchId: input.importBatchId,
        originalFilename: item.sourceFilename,
      },
      currentVersionId: `current-${id}`,
      // AI 提取的规则默认是草稿状态，不会直接进入活跃列表
      status: assetType === "rule" ? "draft" : "active",
      archivedAt: null,
      deletedAt: null,
      deletedReason: null,
      createdAt: now,
      updatedAt: now,
    } as AssetData;

    return {
      asset,
      version: createInitialVersion(asset, {
        versionId: `current-${id}`,
        now,
        sourceAssetIds,
      }),
    };
  });

  return { project, sourcePackages, assets };
}
