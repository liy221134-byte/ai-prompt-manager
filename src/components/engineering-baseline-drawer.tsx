"use client";

import { CircleCheck, CircleDashed, ShieldCheck, X } from "lucide-react";

import type { AssetData } from "@/data/assets";
import {
  projectRiskLevelOptions,
  type ProjectData,
  type ProjectRiskLevel,
} from "@/data/projects";
import { useModalBehavior } from "@/hooks/use-modal-behavior";
import { rankRequirementsByEvidence } from "@/lib/acceptance-evidence";
import { findLatestReleaseRecord, summarizeReleaseGates } from "@/lib/release-record";
import {
  normalizeReleaseRecordMetadata,
} from "@/data/assets";
import { releaseRecordResultLabels } from "@/lib/asset-list";
import {
  listDocumentGaps,
  readQualityProfile,
  summarizeDocumentGaps,
} from "@/lib/quality-level";
import { readProjectChain, type ChainCheck } from "@/lib/document-flow";

type EngineeringBaselineDrawerProps = {
  project: ProjectData;
  assets: AssetData[];
  onChangeLevel: (level: ProjectRiskLevel) => Promise<void>;
  onCreateDocument: (input: { title: string; documentType: string }) => void;
  onCreateEvidence: (input: { nodeId: string; title: string }) => void;
  onCreateRelease: () => void;
  onOpenAsset: (assetId: string) => void;
  // 把已有文档标记成缺的那个文档类型（工程基线关联已有文档，不重复建）
  onAssignDocumentType?: (input: {
    assetId: string;
    documentType: string;
  }) => Promise<void>;
  onClose: () => void;
};

// 工程基线：按项目质量等级列出该有的文档、该关注的规则方向和发布前检查。
// 只做对照和跳转，不自动创建任何东西。
export function EngineeringBaselineDrawer({
  project,
  assets,
  onChangeLevel,
  onCreateDocument,
  onCreateEvidence,
  onCreateRelease,
  onOpenAsset,
  onAssignDocumentType,
  onClose,
}: EngineeringBaselineDrawerProps) {
  const profile = readQualityProfile(project.riskLevel);
  const gaps = listDocumentGaps({
    level: project.riskLevel,
    assets,
    projectId: project.id,
  });
  const summary = summarizeDocumentGaps(gaps);
  const chain = readProjectChain({
    assets,
    projectId: project.id,
  });
  const requirementEvidence = rankRequirementsByEvidence(assets, project.id);
  const unverifiedCount = requirementEvidence.filter(
    (item) => item.summary.passed === 0,
  ).length;
  const latestRelease = findLatestReleaseRecord(assets, project.id);
  const latestReleaseGates = latestRelease
    ? summarizeReleaseGates(latestRelease)
    : null;
  const latestReleaseMetadata = latestRelease
    ? normalizeReleaseRecordMetadata(latestRelease.metadata)
    : null;

  // 已经被缺口认领过的文档不重复出现；剩下这些是「游离文档」，
  // 缺哪类文档时可以拿它们去顶，而不是再新建一份。
  const matchedDocumentIds = new Set(
    gaps.map((gap) => gap.assetId).filter((id): id is string => Boolean(id)),
  );
  const looseDocuments = assets.filter(
    (asset) =>
      asset.projectId === project.id &&
      asset.assetType === "document" &&
      asset.status === "active" &&
      asset.deletedAt === null &&
      !matchedDocumentIds.has(asset.id),
  );

  // 链路里缺的那一环：文档类走新建文档，验收走验收覆盖，发布走新建发布记录
  function handleCreateChainItem(item: ChainCheck) {
    if (item.key === "release") {
      onCreateRelease();
      return;
    }

    if (item.key === "evidence") {
      const first = requirementEvidence.find(
        (entry) => entry.summary.passed === 0,
      );

      if (first) {
        onCreateEvidence({
          nodeId: first.node.id,
          title: `验收：${first.node.title}`,
        });
      }

      return;
    }

    onCreateDocument({
      title: item.label,
      documentType: item.key === "prd" ? "PRD" : "实现规格",
    });
  }

  useModalBehavior(onClose);

  return (
    // 外层固定覆盖层不能省：只写内层 absolute 会相对页面原点定位，页面一滚动浮层就跑到可视区外
    <div className="fixed inset-0 z-50">
      <button
        aria-label="关闭工程基线"
        className="absolute inset-0 cursor-default bg-slate-950/35 backdrop-blur-[2px]"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-labelledby="engineering-baseline-title"
        aria-modal="true"
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl sm:max-w-3xl"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
              <ShieldCheck aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">工程基线</p>
              <h2
                className="mt-1 break-words text-lg font-semibold text-slate-950"
                id="engineering-baseline-title"
              >
                {project.name}
              </h2>
            </div>
          </div>

          <button
            aria-label="关闭工程基线"
            className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3 sm:px-6">
          {projectRiskLevelOptions.map((option) => (
            <button
              aria-pressed={project.riskLevel === option.value}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                project.riskLevel === option.value
                  ? "bg-sky-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              key={option.value}
              onClick={() => {
                if (project.riskLevel !== option.value) {
                  void onChangeLevel(option.value);
                }
              }}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <p className="text-sm leading-6 text-slate-600">{profile.summary}</p>

          <section className="mt-5 rounded-xl border border-slate-200 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-700">
                链路完整性
              </h3>
              <span className="text-xs text-slate-500">
                需求 → 规格 → 验收 → 发布，缺哪环就补哪环
              </span>
            </div>
            <ul className="mt-2 flex flex-col divide-y divide-slate-100">
              {chain.map((item) => (
                <li className="flex items-start gap-3 py-2" key={item.key}>
                  {item.satisfied ? (
                    <CircleCheck
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-emerald-600"
                    />
                  ) : (
                    <CircleDashed
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-slate-400"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">
                      {item.label}
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500">
                      {item.hint}
                    </p>
                  </div>
                  {item.satisfied ? (
                    <button
                      className="shrink-0 text-xs font-semibold text-sky-700 hover:underline"
                      onClick={() => onOpenAsset(item.assetId ?? "")}
                      type="button"
                    >
                      打开
                    </button>
                  ) : (
                    <button
                      className="shrink-0 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 transition-colors hover:border-sky-300 hover:bg-sky-100"
                      onClick={() => handleCreateChainItem(item)}
                      type="button"
                    >
                      {item.key === "release" ? "新建发布记录" : `新建${item.label}`}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-5 rounded-xl border border-slate-200 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-700">
                这个等级必须有的工程文档
              </h3>
              <span className="text-xs text-slate-500">
                已有 {summary.satisfied}／{summary.total}
                {summary.missing > 0 ? `，还缺 ${summary.missing}` : ""}
              </span>
            </div>

            <ul className="mt-2 divide-y divide-slate-100">
              {gaps.map((gap) => (
                <li
                  className="flex items-start gap-3 py-2"
                  key={gap.document.key}
                >
                  {gap.satisfied ? (
                    <CircleCheck
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-emerald-600"
                    />
                  ) : (
                    <CircleDashed
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-slate-400"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">
                        {gap.document.title}
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                        {gap.document.documentType}
                      </span>
                      {gap.satisfied && (
                        <span className="text-[11px] text-emerald-700">
                          已有：{gap.assetTitle}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500">
                      {gap.document.reason}
                    </p>
                  </div>
                  {gap.satisfied ? (
                    <button
                      className="shrink-0 text-xs font-semibold text-sky-700 hover:underline"
                      onClick={() => onOpenAsset(gap.assetId ?? "")}
                      type="button"
                    >
                      打开
                    </button>
                  ) : (
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <button
                        className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 transition-colors hover:border-sky-300 hover:bg-sky-100"
                        onClick={() =>
                          onCreateDocument({
                            title: gap.document.title,
                            documentType: gap.document.documentType,
                          })
                        }
                        type="button"
                      >
                        新建文档
                      </button>
                      {onAssignDocumentType && looseDocuments.length > 0 && (
                        <label className="flex items-center gap-1 text-[11px] text-slate-500">
                          或用已有
                          <select
                            aria-label={`用已有文档当作${gap.document.title}`}
                            className="max-w-40 rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px] text-slate-700"
                            onChange={(event) => {
                              const assetId = event.target.value;

                              event.target.value = "";

                              if (assetId) {
                                void onAssignDocumentType({
                                  assetId,
                                  documentType: gap.document.documentType,
                                });
                              }
                            }}
                            value=""
                          >
                            <option value="">挑一份…</option>
                            {looseDocuments.map((document) => (
                              <option key={document.id} value={document.id}>
                                {document.title}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <p className="mt-2 text-xs leading-5 text-slate-500">
              判定口径：同一个项目里「活跃、没进垃圾箱」的文档资产，
              文档类型对得上或标题一样就算有；草稿和归档不算。
              新建时已经帮你填好标题和文档类型，正文可以从
              `templates/engineering` 里对应模板复制。
            </p>
          </section>

          <section className="mt-4 rounded-xl border border-slate-200 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-700">
                验收覆盖
              </h3>
              <span className="text-xs text-slate-500">
                需求 {requirementEvidence.length} 个
                {unverifiedCount > 0
                  ? `，其中 ${unverifiedCount} 个还没有通过验收`
                  : "，全部有通过的验收记录"}
              </span>
            </div>

            {requirementEvidence.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                这个项目还没有需求节点。先去「项目图谱」建需求，再回来做验收。
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100">
                {requirementEvidence.map(({ node, summary: evidence }) => (
                  <li className="flex items-start gap-3 py-2" key={node.id}>
                    {evidence.passed > 0 ? (
                      <CircleCheck
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-emerald-600"
                      />
                    ) : (
                      <CircleDashed
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-slate-400"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-slate-500">
                          {node.metadata.code}
                        </span>
                        <span className="truncate text-sm text-slate-800">
                          {node.title}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        验收 {evidence.total} 条：通过 {evidence.passed}、未通过{" "}
                        {evidence.failed}、待确认 {evidence.pending}、例外{" "}
                        {evidence.exception}
                      </p>
                    </div>
                    {evidence.total > 0 && (
                      <button
                        className="shrink-0 text-xs font-semibold text-sky-700 hover:underline"
                        onClick={() => onOpenAsset(node.id)}
                        type="button"
                      >
                        打开需求
                      </button>
                    )}
                    <button
                      className="shrink-0 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 transition-colors hover:border-sky-300 hover:bg-sky-100"
                      onClick={() =>
                        onCreateEvidence({
                          nodeId: node.id,
                          // 标题里不再重复编号：编号和标题在面板上本来就挨着显示
                          title: `${node.title} 验收记录`,
                        })
                      }
                      type="button"
                    >
                      新建验收记录
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-2 text-xs leading-5 text-slate-500">
              口径：需求节点里还没有「通过」的验收记录就算未覆盖；
              结论默认「待确认」，改成「通过」要你看过证据自己点。
            </p>
          </section>

          <section className="mt-4 rounded-xl border border-slate-200 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-700">
                最近一次发布
              </h3>
              <button
                className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 transition-colors hover:border-sky-300 hover:bg-sky-100"
                onClick={onCreateRelease}
                type="button"
              >
                新建发布记录
              </button>
            </div>

            {!latestRelease || !latestReleaseGates || !latestReleaseMetadata ? (
              <p className="mt-2 text-sm text-slate-500">
                还没有发布记录。下次上线前建一条，把「迁移跑过没有、备份做了没有、
                回滚退到哪个版本」这些逐项勾上，出事时不用现场回忆。
              </p>
            ) : (
              <>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-700">
                  <span className="font-semibold">
                    {latestReleaseMetadata.version}
                  </span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                    {releaseRecordResultLabels[latestReleaseMetadata.result]}
                  </span>
                  {latestReleaseMetadata.releasedAt && (
                    <span className="text-xs text-slate-500">
                      {latestReleaseMetadata.releasedAt}
                    </span>
                  )}
                  <span className="text-xs text-slate-500">
                    门禁 {latestReleaseGates.done}／{latestReleaseGates.total} 项完成
                  </span>
                  <button
                    className="text-xs font-semibold text-sky-700 hover:underline"
                    onClick={() => onOpenAsset(latestRelease.id)}
                    type="button"
                  >
                    打开记录
                  </button>
                </p>
                {latestReleaseGates.pending.length > 0 && (
                  <p className="mt-1 text-xs leading-5 text-amber-700">
                    还没完成：{latestReleaseGates.pending.join("、")}
                  </p>
                )}
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  回滚目标：{latestReleaseMetadata.rollbackTarget || "还没定"}
                </p>
              </>
            )}
          </section>

          <section className="mt-4 rounded-xl border border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-700">
              这个等级建议关注的规则方向
            </h3>
            <ul className="mt-2 flex flex-col gap-1">
              {profile.ruleFocus.map((item) => (
                <li className="text-sm leading-6 text-slate-600" key={item}>
                  · {item}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              这里只提示方向，装不装规则包、立不立规则由你定。
            </p>
          </section>

          <section className="mt-4 rounded-xl border border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-700">
              这个等级发布前必须完成的检查
            </h3>
            <ul className="mt-2 flex flex-col gap-1">
              {profile.releaseChecks.map((item) => (
                <li className="text-sm leading-6 text-slate-600" key={item}>
                  □ {item}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              这一版只列要求，不记录「这次做没做」；发布门禁与演练记录排在下一个版本。
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
}
