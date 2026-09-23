"use client";

import {
  Archive,
  ChevronDown,
  ChevronUp,
  FileText,
  History,
  ListChecks,
  LoaderCircle,
  Pencil,
  RotateCcw,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { MarkdownContent } from "@/components/markdown-content";
import type {
  AssetData,
  AssetStatus,
  AssetVersionData,
  GraphNodeAssetData,
} from "@/data/assets";
import { readAssetRelations } from "@/data/assets";
import { assetRelationLabels } from "@/lib/asset-list";
import { describeNodeEvidence } from "@/lib/acceptance-evidence";
import { summarizeGates } from "@/lib/release-record";
import { readTemplateVariables } from "@/lib/template-asset";
import { buildNodePath } from "@/lib/graph-node";
import { useModalBehavior } from "@/hooks/use-modal-behavior";
import type { EditableAssetData } from "@/lib/asset-draft";
import {
  assetStatusLabels,
  describeAssetSummary,
  evidenceConclusionLabels,
  graphNodeTypeLabels,
  releaseRecordResultLabels,
  ruleConfidenceLabels,
  ruleScopeLabels,
  ruleTypeLabels,
} from "@/lib/asset-list";
import {
  assetVersionReasonLabels,
  canRestoreAssetVersion,
  isCurrentAssetVersion,
  sortAssetVersionsNewestFirst,
} from "@/lib/asset-versions";
import type { PromptDataSource } from "@/lib/prompt-source";

type AssetDetailDrawerProps = {
  asset: EditableAssetData;
  // 用来把关系目标解析成标题，以及算「被谁引用」
  allAssets?: AssetData[];
  dataSource: PromptDataSource;
  onClose: () => void;
  onEdit: (asset: EditableAssetData) => void;
  onRestore: (
    asset: EditableAssetData,
    version: AssetVersionData,
  ) => Promise<void>;
  onUpdateStatus: (
    asset: EditableAssetData,
    status: AssetStatus,
  ) => Promise<void>;
  onNotify: (message: string) => void;
};

const statusStyles: Record<AssetStatus, string> = {
  draft: "bg-slate-100 text-slate-700 ring-slate-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  archived: "bg-slate-100 text-slate-600 ring-slate-200",
  deprecated: "bg-rose-50 text-rose-700 ring-rose-200",
};

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function describeAssetMetadata(
  asset: EditableAssetData,
  allAssets: AssetData[],
) {
  if (asset.assetType === "rule") {
    return [
      `规则类型：${ruleTypeLabels[asset.metadata.ruleType]}`,
      `适用范围：${ruleScopeLabels[asset.metadata.scope]}`,
      ...(asset.metadata.confidence
        ? [`可信度：${ruleConfidenceLabels[asset.metadata.confidence]}`]
        : []),
    ];
  }

  if (asset.assetType === "tech_profile") {
    const entries = asset.metadata.stack;
    const deviations = entries.filter((entry) => entry.isDeviation).length;

    return [
      `技术栈：${entries.length} 项${
        deviations > 0 ? `，其中 ${deviations} 项偏离默认选型` : ""
      }`,
    ];
  }

  if (asset.assetType === "template") {
    const variables = readTemplateVariables(asset.content);

    return [
      ...(asset.metadata.outputFileName
        ? [`产物文件名：${asset.metadata.outputFileName}`]
        : []),
      `变量：${variables.length} 个`,
    ];
  }

  if (asset.assetType === "graph_node") {
    const nodes = allAssets.filter(
      (item): item is GraphNodeAssetData =>
        item.assetType === "graph_node" && item.deletedAt === null,
    );
    const path = buildNodePath(nodes, asset.id)
      .map((node) => node.title)
      .join(" → ");
    // 需求节点顺带把验收情况亮出来：几条通过、几条没过
    const evidence =
      asset.metadata.nodeType === "requirement"
        ? describeNodeEvidence(allAssets, asset.projectId, asset.id)
        : null;

    return [
      `节点类型：${graphNodeTypeLabels[asset.metadata.nodeType]}`,
      ...(asset.metadata.code ? [`编号：${asset.metadata.code}`] : []),
      ...(path ? [`路径：${path}`] : []),
      ...(evidence && evidence.total > 0
        ? [
            `验收记录：${evidence.total} 条，通过 ${evidence.passed} 条${
              evidence.failed > 0 ? `，未通过 ${evidence.failed} 条` : ""
            }${evidence.pending > 0 ? `，待确认 ${evidence.pending} 条` : ""}`,
          ]
        : asset.metadata.nodeType === "requirement"
          ? ["验收记录：还没有，去「工程基线」里的验收覆盖建一条"]
          : []),
    ];
  }

  if (asset.assetType === "evidence") {
    const requirement = allAssets.find(
      (item) => item.id === asset.metadata.nodeId,
    );
    const requirementLabel = requirement
      ? `${requirement.title}${
          "code" in requirement.metadata && requirement.metadata.code
            ? `（${requirement.metadata.code}）`
            : ""
        }`
      : "还没挂到需求节点上";

    return [
      `结论：${evidenceConclusionLabels[asset.metadata.conclusion]}`,
      `对应需求：${requirementLabel}`,
      ...(asset.metadata.commitRef
        ? [`提交版本：${asset.metadata.commitRef}`]
        : []),
      `证据：${asset.metadata.evidenceItems.length} 条`,
    ];
  }

  if (asset.assetType === "release_record") {
    const summary = summarizeGates(asset.metadata.gates);

    return [
      `版本：${asset.metadata.version}`,
      `结果：${releaseRecordResultLabels[asset.metadata.result]}`,
      ...(asset.metadata.releasedAt
        ? [`发布日期：${asset.metadata.releasedAt}`]
        : []),
      `回滚目标：${asset.metadata.rollbackTarget || "还没定"}`,
      `门禁：${summary.done}／${summary.total} 项完成${
        summary.pending.length > 0
          ? `，还差：${summary.pending.join("、")}`
          : ""
      }`,
    ];
  }

  return [`文档类型：${asset.metadata.documentType}`];
}

export function AssetDetailDrawer({
  asset,
  allAssets = [],
  dataSource,
  onClose,
  onEdit,
  onRestore,
  onUpdateStatus,
  onNotify,
}: AssetDetailDrawerProps) {
  // 版本按「资产 + 当前版本」缓存，切换版本后 key 变化，界面自动回到加载状态。
  const versionsKey = `${asset.id}:${asset.currentVersionId}`;
  // 正向关系写在自己身上；反向关系要从别的资产里找谁指向我
  const relations = readAssetRelations(asset.metadata);
  const incomingRelations = allAssets
    .filter((item) => item.id !== asset.id && !item.deletedAt)
    .flatMap((item) =>
      readAssetRelations(item.metadata)
        .filter((relation) => relation.targetAssetId === asset.id)
        .map((relation) => ({ asset: item, relation })),
    );
  const [versionState, setVersionState] = useState<{
    key: string;
    versions: AssetVersionData[];
    error: string | null;
  } | null>(null);
  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(
    null,
  );
  const [restoreVersionId, setRestoreVersionId] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isConfirmingArchive, setIsConfirmingArchive] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // 详情抽屉支持的类型比编辑器多，标签按类型给全，别都落到「文档」
  const typeLabel =
    asset.assetType === "rule"
      ? "规则"
      : asset.assetType === "graph_node"
        ? "图谱节点"
        : asset.assetType === "evidence"
          ? "验收记录"
          : asset.assetType === "release_record"
            ? "发布记录"
            : asset.assetType === "template"
              ? "模板"
              : "文档";
  const isBusy = isRestoring || isUpdatingStatus;
  const isLoadingVersions = versionState?.key !== versionsKey;
  const versionsError =
    versionState?.key === versionsKey ? versionState.error : null;
  const sortedVersions = useMemo(
    () =>
      versionState?.key === versionsKey
        ? sortAssetVersionsNewestFirst(versionState.versions)
        : [],
    [versionState, versionsKey],
  );

  useModalBehavior(isBusy ? () => undefined : onClose, isBusy);

  // 版本号会随着保存和恢复变化，这里跟着当前版本重新拉一次，避免显示旧列表。
  useEffect(() => {
    let cancelled = false;

    dataSource
      .fetchAssetVersions(asset.id)
      .then((nextVersions) => {
        if (!cancelled) {
          setVersionState({
            key: versionsKey,
            versions: nextVersions,
            error: null,
          });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setVersionState({
            key: versionsKey,
            versions: [],
            error:
              error instanceof Error
                ? error.message
                : "读取版本记录失败。",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [asset.id, dataSource, versionsKey]);

  async function handleRestore(version: AssetVersionData) {
    setIsRestoring(true);

    try {
      await onRestore(asset, version);
      setRestoreVersionId(null);
      onNotify(`已恢复到第 ${version.versionNumber} 版`);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "恢复版本失败");
    } finally {
      setIsRestoring(false);
    }
  }

  async function handleStatusChange(status: AssetStatus) {
    setIsUpdatingStatus(true);

    try {
      await onUpdateStatus(asset, status);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "更新状态失败");
    } finally {
      setIsUpdatingStatus(false);
      setIsConfirmingArchive(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label={`关闭${typeLabel}详情`}
        className="absolute inset-0 cursor-default bg-slate-950/35 backdrop-blur-[2px]"
        onClick={isBusy ? undefined : onClose}
        type="button"
      />

      <aside
        aria-labelledby="asset-detail-title"
        aria-modal="true"
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl sm:max-w-2xl"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              {asset.assetType === "rule" ? (
                <ListChecks aria-hidden="true" className="size-5" />
              ) : (
                <FileText aria-hidden="true" className="size-5" />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">{typeLabel}</p>
              <h2
                className="mt-1 break-words text-lg font-semibold text-slate-950"
                id="asset-detail-title"
              >
                {asset.title}
              </h2>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              aria-label={`编辑${typeLabel}`}
              className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isBusy}
              onClick={() => onEdit(asset)}
              title={`编辑${typeLabel}`}
              type="button"
            >
              <Pencil aria-hidden="true" className="size-5" />
            </button>
            {asset.status === "archived" ? (
              <button
                aria-label={`重新激活${typeLabel}`}
                className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isBusy}
                onClick={() => void handleStatusChange("active")}
                title="重新激活"
                type="button"
              >
                <RotateCcw aria-hidden="true" className="size-5" />
              </button>
            ) : (
              <button
                aria-label={`归档${typeLabel}`}
                className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isBusy}
                onClick={() => setIsConfirmingArchive(true)}
                title="归档"
                type="button"
              >
                <Archive aria-hidden="true" className="size-5" />
              </button>
            )}
            <button
              aria-label={`关闭${typeLabel}详情`}
              className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
              onClick={onClose}
              type="button"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyles[asset.status]}`}
            >
              {assetStatusLabels[asset.status]}
            </span>
            {describeAssetMetadata(asset, allAssets).map((item) => (
              <span
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                key={item}
              >
                {item}
              </span>
            ))}
          </div>

          {asset.assetType === "rule" &&
            (asset.metadata.rationale || asset.metadata.sourceExcerpt) && (
              <section className="mt-5 rounded-xl border border-slate-200 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-700">
                  为什么立这条规则
                </h3>
                {asset.metadata.rationale && (
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {asset.metadata.rationale}
                  </p>
                )}
                {asset.metadata.sourceExcerpt && (
                  <p className="mt-2 border-l-2 border-slate-200 pl-3 text-sm leading-6 text-slate-500">
                    来源片段：{asset.metadata.sourceExcerpt}
                  </p>
                )}
              </section>
            )}

          {asset.assetType === "template" &&
            readTemplateVariables(asset.content).length > 0 && (
              <section className="mt-5 rounded-xl border border-slate-200 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-700">
                  模板变量（{readTemplateVariables(asset.content).length} 个）
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  套模板编译时，项目名称、项目说明和技术栈会自动填，其余保留占位符等人工填。
                </p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {readTemplateVariables(asset.content).map((name) => (
                    <li
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
                      key={name}
                    >
                      {name}
                    </li>
                  ))}
                </ul>
              </section>
            )}

          {(relations.length > 0 || incomingRelations.length > 0) && (
            <section className="mt-5 rounded-xl border border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-700">资产关系</h3>

              {relations.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 text-sm text-slate-700">
                  {relations.map((relation) => {
                    const target = allAssets.find(
                      (item) => item.id === relation.targetAssetId,
                    );
                    const suffix = !target
                      ? "（目标已不存在）"
                      : target.deletedAt || target.status === "archived"
                        ? "（目标已归档）"
                        : "";

                    return (
                      <li
                        key={`${relation.targetAssetId}-${relation.relationType}`}
                      >
                        {assetRelationLabels[relation.relationType]}：
                        {target ? target.title : relation.targetAssetId}
                        {suffix}
                        {relation.note ? ` —— ${relation.note}` : ""}
                      </li>
                    );
                  })}
                </ul>
              )}

              {incomingRelations.length > 0 && (
                <>
                  <h4 className="mt-3 text-xs font-semibold text-slate-600">
                    被谁引用
                  </h4>
                  <ul className="mt-1 flex flex-col gap-1 text-sm text-slate-700">
                    {incomingRelations.map(({ asset: source, relation }) => (
                      <li key={`${source.id}-${relation.relationType}`}>
                        {source.title}（
                        {assetRelationLabels[relation.relationType]}）
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          {isConfirmingArchive && (
            <section className="mt-5 rounded-xl border border-slate-300 bg-slate-50 px-4 py-3">
              <p className="text-sm text-slate-800">
                归档后这条{typeLabel}不再出现在默认列表里，历史版本和内容都会保留。
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={isUpdatingStatus}
                  onClick={() => void handleStatusChange("archived")}
                  type="button"
                >
                  {isUpdatingStatus && (
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                  )}
                  确认归档
                </button>
                <button
                  className="h-9 rounded-lg px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
                  disabled={isUpdatingStatus}
                  onClick={() => setIsConfirmingArchive(false)}
                  type="button"
                >
                  取消
                </button>
              </div>
            </section>
          )}

          <section className="mt-7">
            <h3 className="text-sm font-semibold text-slate-900">说明</h3>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              {describeAssetSummary(asset) || "还没有填写说明。"}
            </p>
          </section>

          <section className="mt-8 border-t border-slate-200 pt-7">
            <h3 className="text-sm font-semibold text-slate-900">
              {asset.assetType === "rule"
                ? "规则正文"
                : asset.assetType === "evidence"
                  ? "验收条件、步骤与实际结果"
                  : asset.assetType === "release_record"
                    ? "这次发布改了什么、异常和后续"
                    : "文档正文"}
            </h3>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-5 sm:px-5">
              <MarkdownContent content={asset.content} />
            </div>
          </section>

          <section className="mt-8 border-t border-slate-200 pt-7">
            <div className="flex items-center gap-2">
              <History aria-hidden="true" className="size-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-slate-900">
                版本记录
              </h3>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              每次正式保存都会留下一个不可变版本，恢复历史版本会生成新版本，不会覆盖旧记录。
            </p>

            {isLoadingVersions ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 animate-spin"
                />
                正在读取版本记录
              </div>
            ) : versionsError ? (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                {versionsError}
              </p>
            ) : sortedVersions.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                还没有版本记录。
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {sortedVersions.map((version) => {
                  const isCurrent = isCurrentAssetVersion(asset, version);
                  const isExpanded = expandedVersionId === version.versionId;
                  const isConfirmingRestore =
                    restoreVersionId === version.versionId;

                  return (
                    <li
                      className="rounded-lg border border-slate-200 px-4 py-3"
                      key={version.versionId}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <button
                          className="flex flex-wrap items-center gap-2 text-left"
                          onClick={() =>
                            setExpandedVersionId(
                              isExpanded ? null : version.versionId,
                            )
                          }
                          type="button"
                        >
                          <span className="text-sm font-semibold text-slate-900">
                            第 {version.versionNumber} 版
                          </span>
                          <span className="text-xs text-slate-500">
                            {formatDateTime(version.createdAt)}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                            {version.changeReason ||
                              assetVersionReasonLabels[version.versionReason]}
                          </span>
                          {isExpanded ? (
                            <ChevronUp
                              aria-hidden="true"
                              className="size-4 text-slate-400"
                            />
                          ) : (
                            <ChevronDown
                              aria-hidden="true"
                              className="size-4 text-slate-400"
                            />
                          )}
                        </button>

                        {isCurrent ? (
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                            当前版本
                          </span>
                        ) : (
                          <button
                            className="h-9 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isBusy}
                            onClick={() =>
                              setRestoreVersionId(
                                isConfirmingRestore
                                  ? null
                                  : version.versionId,
                              )
                            }
                            type="button"
                          >
                            恢复这一版
                          </button>
                        )}
                      </div>

                      {isExpanded && (
                        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
                          <p className="text-xs font-semibold text-slate-500">
                            {version.title}
                          </p>
                          <div className="mt-2">
                            <MarkdownContent content={version.content} />
                          </div>
                        </div>
                      )}

                      {isConfirmingRestore && (
                        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                          <p className="text-sm text-slate-800">
                            恢复到第 {version.versionNumber} 版会用当时的标题、说明和正文覆盖当前内容，
                            并生成一个新版本；现有历史记录不会被删除。
                          </p>
                          <div className="mt-3 flex items-center gap-2">
                            <button
                              className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                              disabled={!canRestoreAssetVersion(asset, version) || isBusy}
                              onClick={() => void handleRestore(version)}
                              type="button"
                            >
                              {isRestoring && (
                                <LoaderCircle
                                  aria-hidden="true"
                                  className="size-4 animate-spin"
                                />
                              )}
                              确认恢复
                            </button>
                            <button
                              className="h-9 rounded-lg px-3 text-sm font-medium text-slate-600 transition hover:bg-white"
                              disabled={isRestoring}
                              onClick={() => setRestoreVersionId(null)}
                              type="button"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
