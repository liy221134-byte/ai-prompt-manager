"use client";

import { CircleDashed, Sparkles, X } from "lucide-react";

import type { AssetData } from "@/data/assets";
import { useModalBehavior } from "@/hooks/use-modal-behavior";
import type { SedimentCheckup } from "@/lib/sediment-flowback";
import { suggestSedimentScope } from "@/lib/sediment-scope";

type SedimentCheckupDrawerProps = {
  checkup: SedimentCheckup;
  projectNameById: Map<string, string>;
  onOpenAsset: (assetId: string) => void;
  onPromote: (asset: AssetData) => void;
  onPromoteMany?: (assets: AssetData[]) => Promise<void>;
  onClose: () => void;
};

// 沉淀体检：只列线索，不自动做任何事。
export function SedimentCheckupDrawer({
  checkup,
  projectNameById,
  onOpenAsset,
  onPromote,
  onPromoteMany,
  onClose,
}: SedimentCheckupDrawerProps) {
  useModalBehavior(onClose);

  // 每条规则顺带给一个「该升公共还是留项目」的建议，随清单一起展示
  const ruleSuggestions = checkup.projectOnlyRules.map((entry) => ({
    entry,
    suggestion: suggestSedimentScope({
      asset: entry.asset,
      projectName: projectNameById.get(entry.projectId) ?? "",
    }),
  }));
  const promoteReady = ruleSuggestions.filter(
    (item) => item.suggestion.scope === "public",
  );

  const sections = [
    {
      key: "rules",
      title: "只在项目里出现的规则",
      hint: "这些规则还没进公共资产库。下面逐条给了「建议升公共／先留项目」和理由；建议升的可以一次全提升。",
      empty: "没有这样的规则，项目里的规则都已经在公共库或已经提升过。",
      items: ruleSuggestions.map(({ entry, suggestion }) => ({
        id: entry.asset.id,
        title: entry.asset.title,
        meta: [
          projectNameById.get(entry.projectId) ?? entry.projectId,
          suggestion.scope === "public"
            ? `建议升公共：${suggestion.reason}`
            : `建议留项目：${suggestion.reason}`,
        ].join(" · "),
        asset: entry.asset,
        action:
          suggestion.scope === "public"
            ? ("promote" as const)
            : ("open" as const),
      })),
    },
    {
      key: "duplicates",
      title: "和公共库标题重复的项目资产",
      hint: "标题一样但两边可能已经分叉；点开对一下，别各改各的。",
      empty: "没有标题重复的资产。",
      items: checkup.duplicateTitles.map((entry) => ({
        id: entry.asset.id,
        title: entry.asset.title,
        meta: `公共库也有同名：${entry.publicAsset.title}`,
        asset: entry.asset,
        action: "open" as const,
      })),
    },
    {
      key: "stale",
      title: "公共库里长期没更新的资产",
      hint: "超过 90 天没动过；抽时间复核一遍，过时的就更新或归档。",
      empty: "公共库里的资产都比较新。",
      items: checkup.stalePublicAssets.map((entry) => ({
        id: entry.asset.id,
        title: entry.asset.title,
        meta: `${entry.daysSinceUpdate} 天没更新`,
        asset: entry.asset,
        action: "open" as const,
      })),
    },
  ];

  return (
    // 外层固定覆盖层不能省：只写内层 absolute 会相对页面原点定位，页面一滚动浮层就跑到可视区外
    <div className="fixed inset-0 z-50">
      <button
        aria-label="关闭沉淀体检"
        className="absolute inset-0 cursor-default bg-slate-950/35 backdrop-blur-[2px]"
        onClick={onClose}
        type="button"
      />

      <aside
        aria-labelledby="sediment-checkup-title"
        aria-modal="true"
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl sm:max-w-3xl"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
              <Sparkles aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-xs text-slate-500">公共资产</p>
              <h2
                className="mt-1 text-lg font-semibold text-slate-950"
                id="sediment-checkup-title"
              >
                沉淀体检
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                只列线索、不自动改动：哪些该升到公共、哪些和公共库重复了、哪些该复核。
              </p>
            </div>
          </div>

          <button
            aria-label="关闭沉淀体检"
            className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {sections.map((section) => (
            <section
              className="mt-1 rounded-xl border border-slate-200 px-4 py-3 first:mt-0"
              key={section.key}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-700">
                  {section.title}
                </h3>
                <span className="text-xs text-slate-500">
                  {section.items.length} 条
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {section.hint}
              </p>

              {section.key === "rules" &&
                onPromoteMany &&
                promoteReady.length > 0 && (
                  <button
                    className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-xs font-semibold text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-100"
                    onClick={() =>
                      void onPromoteMany(
                        promoteReady.map((item) => item.entry.asset),
                      )
                    }
                    type="button"
                  >
                    把建议升公共的 {promoteReady.length} 条一次提升
                  </button>
                )}

              {section.items.length === 0 ? (
                <p className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                  <CircleDashed aria-hidden="true" className="size-3.5" />
                  {section.empty}
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100">
                  {section.items.map((item) => (
                    <li
                      className="flex items-start gap-3 py-2"
                      key={`${section.key}-${item.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {item.title}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {item.meta}
                        </p>
                      </div>
                      {item.action === "promote" ? (
                        <button
                          className="shrink-0 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-100"
                          onClick={() => onPromote(item.asset)}
                          type="button"
                        >
                          提升为公共
                        </button>
                      ) : (
                        <button
                          className="shrink-0 text-xs font-semibold text-sky-700 hover:underline"
                          onClick={() => onOpenAsset(item.id)}
                          type="button"
                        >
                          打开
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </aside>
    </div>
  );
}
