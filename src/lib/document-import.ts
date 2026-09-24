// 把项目里已经写好的 Markdown 文档**原样**导进资产库：
// 标题取文件名、正文就是原文，不走 AI 识别——项目迭代产生的需求、设计、验收文档
// 大多已经有现成文件，逐份让 AI 重写一遍反而更慢也更不确定。

import {
  createInitialAssetVersionId,
  type DocumentAssetData,
} from "../data/assets.ts";
import { createAssetId } from "./asset-draft.ts";

export const DOCUMENT_IMPORT_LIMITS = {
  // 单个文件上限：文档资产是给人看的，超过这个体积多半是误选
  bytesPerFile: 2 * 1024 * 1024,
  // 一次最多导入多少份
  filesPerBatch: 100,
} as const;

export type DocumentImportDraft = {
  fileName: string;
  title: string;
  content: string;
  byteSize: number;
  // 库里已经有同名文档时记下它的标识，默认不勾选
  existingAssetId: string | null;
  tooLarge: boolean;
};

export function readDocumentTitle(fileName: string) {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const withoutExtension = base.replace(/\.(md|markdown|txt)$/i, "").trim();

  return withoutExtension || "未命名文档";
}

export function buildDocumentImportDrafts(input: {
  files: Array<{ fileName: string; content: string; byteSize: number }>;
  existing: Array<{ id: string; title: string }>;
}) {
  const existingByTitle = new Map(
    input.existing.map((asset) => [asset.title.trim(), asset.id]),
  );

  return input.files
    .slice(0, DOCUMENT_IMPORT_LIMITS.filesPerBatch)
    .map<DocumentImportDraft>((file) => {
      const title = readDocumentTitle(file.fileName);

      return {
        fileName: file.fileName,
        title,
        content: file.content,
        byteSize: file.byteSize,
        existingAssetId: existingByTitle.get(title) ?? null,
        tooLarge: file.byteSize > DOCUMENT_IMPORT_LIMITS.bytesPerFile,
      };
    })
    // 空文件没有可导入的内容；超限的留在清单里但标出来，让用户自己看见
    .filter((draft) => draft.content.trim().length > 0);
}

// 生成可以直接写库的文档资产。字段按产品的资产结构补齐，
// 免得出现「先写进库、再读不出来」。（规则包那次踩过这个坑）
export function materializeDocumentAssets(input: {
  drafts: DocumentImportDraft[];
  projectId: string;
  documentType: string;
  batchId: string;
  now: string;
}): DocumentAssetData[] {
  return input.drafts.map((draft) => {
    const id = createAssetId("document");

    return {
      id,
      projectId: input.projectId,
      assetType: "document",
      title: draft.title,
      summary: `${input.documentType} · 从 ${draft.fileName} 导入`,
      content: draft.content,
      metadata: {
        documentType: input.documentType,
        authority: false,
        module: "",
        effectiveVersion: "",
        sourceLocation: draft.fileName,
        updateTrigger: "",
        freshness: "",
        lastVerifiedAt: "",
        relations: [],
      },
      source: {
        sourceType: "import",
        sourceAssetId: null,
        importBatchId: input.batchId,
        originalFilename: draft.fileName,
      },
      currentVersionId: createInitialAssetVersionId(id),
      status: "active",
      archivedAt: null,
      deletedAt: null,
      deletedReason: null,
      createdAt: input.now,
      updatedAt: input.now,
    };
  });
}
