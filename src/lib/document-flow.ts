// 项目文档按「链路阶段」分组：需求 → 规格与计划 → 交付 → 验收与发布。
// 这条链来自一次真实讨论（2026-09-24）：PRD 讲做什么，Spec 讲这次具体怎么改，
// 中间缺了 Spec 就会「PRD → 直接写代码」，产品里要能一眼看出缺哪一环。

import type { AssetData } from "../data/assets.ts";

export const documentFlowStages = [
  "requirement",
  "spec",
  "delivery",
  "acceptance",
  "other",
] as const;
export type DocumentFlowStage = (typeof documentFlowStages)[number];

export const documentFlowStageLabels: Record<DocumentFlowStage, string> = {
  requirement: "需求",
  spec: "规格与计划",
  delivery: "交付",
  acceptance: "验收与发布",
  other: "其他",
};

// 每个阶段的一句话说明：空着的时候也要告诉人这一格该放什么
export const documentFlowStageHints: Record<DocumentFlowStage, string> = {
  requirement: "为什么做、做什么、成功标准——你拍板的那份",
  spec: "这次具体怎么改：动哪些文件、数据怎么变、边界在哪——AI 起草、你确认",
  delivery: "架构、数据流、接口、环境变量、安全与故障处理",
  acceptance: "验收条件与证据、发布门禁与回滚",
  other: "参考资料和其他没归类的文档",
};

const stageByDocumentType: Record<string, DocumentFlowStage> = {
  PRD: "requirement",
  实现规格: "spec",
  架构说明: "delivery",
  数据流说明: "delivery",
  数据库说明: "delivery",
  环境变量清单: "delivery",
  安全检查: "delivery",
  故障手册: "delivery",
  备份说明: "delivery",
  ADR: "delivery",
  成本与性能: "delivery",
  验收记录: "acceptance",
  发布手册: "acceptance",
  参考资料: "other",
  其他: "other",
};

export function readDocumentStage(documentType: string): DocumentFlowStage {
  return stageByDocumentType[documentType.trim()] ?? "other";
}

export type DocumentFlowGroup = {
  stage: DocumentFlowStage;
  label: string;
  hint: string;
  documents: AssetData[];
};

// 按阶段分组，阶段顺序固定；空组也返回，方便界面提示「这一格还没有东西」
export function groupDocumentsByStage(assets: AssetData[]) {
  const documents = assets.filter((asset) => asset.assetType === "document");

  return documentFlowStages.map<DocumentFlowGroup>((stage) => ({
    stage,
    label: documentFlowStageLabels[stage],
    hint: documentFlowStageHints[stage],
    documents: documents.filter(
      (asset) => readDocumentStage(asset.metadata.documentType) === stage,
    ),
  }));
}

export type ChainCheck = {
  key: "prd" | "spec" | "evidence" | "release";
  label: string;
  hint: string;
  satisfied: boolean;
  // 已经满足时指向那条资产，界面用它做「打开」
  assetId: string | null;
};

// 链路完整性：这个项目有没有 需求(PRD) → 规格(Spec) → 验收 → 发布 这四环。
// 缺哪一环，界面上就给哪一环的入口。
export function readProjectChain(input: {
  assets: AssetData[];
  projectId: string;
}): ChainCheck[] {
  const live = input.assets.filter(
    (asset) =>
      asset.projectId === input.projectId &&
      asset.deletedAt === null &&
      asset.status === "active",
  );
  const findDocument = (documentType: string) =>
    live.find(
      (asset) =>
        asset.assetType === "document" &&
        asset.metadata.documentType === documentType,
    ) ?? null;
  const findFirst = (assetType: AssetData["assetType"]) =>
    live.find((asset) => asset.assetType === assetType) ?? null;

  const prd = findDocument("PRD");
  const spec = findDocument("实现规格");
  const evidence = findFirst("evidence");
  const release = findFirst("release_record");

  return [
    {
      key: "prd",
      label: "需求（PRD）",
      hint: "为什么做、做什么、成功标准",
      satisfied: Boolean(prd),
      assetId: prd?.id ?? null,
    },
    {
      key: "spec",
      label: "实现规格（Spec）",
      hint: "这次具体怎么改：动哪些文件、数据怎么变、边界在哪",
      satisfied: Boolean(spec),
      assetId: spec?.id ?? null,
    },
    {
      key: "evidence",
      label: "验收记录",
      hint: "每条需求的条件、步骤、结果和证据",
      satisfied: Boolean(evidence),
      assetId: evidence?.id ?? null,
    },
    {
      key: "release",
      label: "发布记录",
      hint: "上线门禁和结果",
      satisfied: Boolean(release),
      assetId: release?.id ?? null,
    },
  ];
}
