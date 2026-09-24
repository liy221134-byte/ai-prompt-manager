"use client";

import { Download, Layers3, LoaderCircle, X } from "lucide-react";
import { useState } from "react";

import type { AssetData, RulePackAssetData } from "@/data/assets";
import type { ProjectData } from "@/data/projects";
import { assetTypeLabels, projectScaleLabels, ruleConfidenceLabels } from "@/lib/asset-list";
import { readAssetPackLink } from "@/lib/rule-pack";
import { useModalBehavior } from "@/hooks/use-modal-behavior";

type RulePackDetailDrawerProps = {
  pack: RulePackAssetData;
  // 包的全部成员（装到多个项目时会有多份，清单里标注所在项目）
  members: AssetData[];
  projects: ProjectData[];
  activeProjectId: string | null;
  onClose: () => void;
  onExport: () => void;
  onInstall: (projectId: string) => Promise<void>;
  onOpenMember: (asset: AssetData) => void;
};

export function RulePackDetailDrawer({
  pack,
  members,
  projects,
  activeProjectId,
  onClose,
  onExport,
  onInstall,
  onOpenMember,
}: RulePackDetailDrawerProps) {
  const [targetProjectId, setTargetProjectId] = useState(
    activeProjectId ?? projects[0]?.id ?? "",
  );
  const [isInstalling, setIsInstalling] = useState(false);

  useModalBehavior(onClose);

  function readProjectName(projectId: string) {
    return (
      projects.find((project) => project.id === projectId)?.name ?? projectId
    );
  }

  async function handleInstall() {
    if (!targetProjectId) {
      return;
    }

    setIsInstalling(true);

    try {
      await onInstall(targetProjectId);
    } finally {
      setIsInstalling(false);
    }
  }

  return (
    // 外层固定覆盖层不能省：只写内层 absolute 会相对页面原点定位，页面一滚动浮层就跑到可视区外
    <div className="fixed inset-0 z-50">
      <button
        aria-label="关闭规则包详情"
        className="absolute inset-0 cursor-default bg-slate-950/35 backdrop-blur-[2px]"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-labelledby="rule-pack-detail-title"
        aria-modal="true"
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl sm:max-w-2xl"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
              <Layers3 aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">规则包</p>
              <h2
                className="mt-1 break-words text-lg font-semibold text-slate-950"
                id="rule-pack-detail-title"
              >
                {pack.title}
              </h2>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              aria-label="导出这个规则包"
              className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
              onClick={onExport}
              title="导出这个规则包"
              type="button"
            >
              <Download aria-hidden="true" className="size-5" />
            </button>
            <button
              aria-label="关闭规则包详情"
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
            {[
              ...(pack.metadata.packVersion
                ? [`包版本：${pack.metadata.packVersion}`]
                : []),
              `可信度：${ruleConfidenceLabels[pack.metadata.packConfidence]}`,
              ...(pack.metadata.projectScale.length > 0
                ? [
                    `适用规模：${pack.metadata.projectScale
                      .map((scale) => projectScaleLabels[scale])
                      .join("、")}`,
                  ]
                : []),
              `成员：${members.length} 条`,
            ].map((item) => (
              <span
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                key={item}
              >
                {item}
              </span>
            ))}
          </div>

          <section className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-4">
            <h3 className="text-sm font-semibold text-indigo-900">安装到项目</h3>
            <p className="mt-1 text-xs leading-5 text-indigo-900/80">
              装到「公共资产库」＝把包和成员复制过去，作为正本；装到「项目」＝只记一条引用，
              规则正文留在公共资产库——公共库改一处，所有引用它的项目跟着变。
              已经装过的会跳过，不会重复，也不会覆盖你改过的内容。
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <select
                aria-label="选择要安装到的项目"
                className="h-10 flex-1 rounded-lg border border-indigo-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none"
                onChange={(event) => setTargetProjectId(event.target.value)}
                value={targetProjectId}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                    {project.id === activeProjectId ? "（当前项目）" : ""}
                  </option>
                ))}
              </select>
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={isInstalling || !targetProjectId || members.length === 0}
                onClick={() => void handleInstall()}
                type="button"
              >
                {isInstalling ? (
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <Layers3 aria-hidden="true" className="size-4" />
                )}
                安装到项目
              </button>
            </div>
          </section>

          {pack.content && (
            <section className="mt-5 rounded-xl border border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-700">包说明</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                {pack.content}
              </p>
            </section>
          )}

          <section className="mt-5 rounded-xl border border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-700">
              成员清单（{members.length} 条）
            </h3>
            {members.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                这个包还没有成员，安装之后成员会出现在这里。
              </p>
            ) : (
              <ul className="mt-3 flex flex-col divide-y divide-slate-100">
                {members.map((member) => {
                  const link = readAssetPackLink(member.metadata);

                  return (
                    <li key={member.id}>
                      <button
                        className="flex w-full items-start justify-between gap-3 py-2.5 text-left transition-colors hover:text-indigo-700"
                        onClick={() => onOpenMember(member)}
                        type="button"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-800">
                            {member.title}
                          </span>
                          <span className="mt-0.5 block text-xs text-slate-500">
                            {assetTypeLabels[member.assetType]} ·{" "}
                            {readProjectName(member.projectId)}
                            {link?.packAssetType
                              ? ` · 包内类型：${link.packAssetType}`
                              : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-slate-400">
                          {link?.packItemId ?? member.id}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {pack.metadata.sourceNote && (
            <p className="mt-4 text-xs leading-5 text-slate-500">
              来源：{pack.metadata.sourceNote}
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
