import { CalendarDays, Layers3 } from "lucide-react";

import type { AssetData, AssetType } from "@/data/assets";
import { assetTypeLabels } from "@/lib/asset-list";

type AssetCardProps = {
  asset: AssetData;
  index: number;
};

const typeStyles: Record<AssetType, string> = {
  prompt: "bg-blue-50 text-blue-700 ring-blue-200",
  rule: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  document: "bg-amber-50 text-amber-700 ring-amber-200",
  template: "bg-violet-50 text-violet-700 ring-violet-200",
  tech_profile: "bg-sky-50 text-sky-700 ring-sky-200",
  source_package: "bg-slate-100 text-slate-700 ring-slate-200",
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}

// 规则和文档在 2.0.0 只读展示，编辑入口由后续任务接入。
export function AssetCard({ asset, index }: AssetCardProps) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-lg border border-[#dbe7f5] bg-white shadow-[0_10px_28px_rgba(30,64,175,0.07)] transition-shadow hover:shadow-[0_16px_36px_rgba(30,64,175,0.12)]">
      <div className="border-b border-slate-100 px-5 pb-5 pt-5">
        <div className="flex items-start justify-between gap-4">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${typeStyles[asset.assetType]}`}
          >
            {assetTypeLabels[asset.assetType]}
          </span>
          <span className="font-mono text-xs font-medium text-slate-400">
            {String(index + 1).padStart(2, "0")}
          </span>
        </div>

        <h2 className="mt-4 text-xl font-semibold leading-7 text-slate-950">
          {asset.title}
        </h2>

        {asset.summary && (
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {asset.summary}
          </p>
        )}
      </div>

      <div className="flex flex-1 flex-col px-5 py-5">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
          <Layers3 aria-hidden="true" className="size-4 text-slate-400" />
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            资产正文
          </p>
        </div>

        <div className="mt-3 flex-1 border-l-2 border-blue-200 pl-4">
          <p className="prompt-preview whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">
            {asset.content}
          </p>
        </div>
      </div>

      <footer className="flex items-center gap-1.5 border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-xs text-slate-500">
        <CalendarDays aria-hidden="true" className="size-3.5" />
        更新于 {formatDate(asset.updatedAt)}
      </footer>
    </article>
  );
}
