"use client";

import { LibraryBig, LoaderCircle, X } from "lucide-react";
import { useState } from "react";

import type { AssetData } from "@/data/assets";
import { assetTypeLabels } from "@/lib/asset-list";
import { useModalBehavior } from "@/hooks/use-modal-behavior";

type PublicAssetPickerDrawerProps = {
  assets: AssetData[];
  projectName: string;
  onClose: () => void;
  onPick: (assets: AssetData[]) => Promise<void>;
};

// 从公共资产库挑资产带进当前项目：勾选后复制进来，不覆盖项目里已经改过的内容。
export function PublicAssetPickerDrawer({
  assets,
  projectName,
  onClose,
  onPick,
}: PublicAssetPickerDrawerProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useModalBehavior(isSubmitting ? () => undefined : onClose, isSubmitting);

  const candidates = assets.filter(
    (asset) =>
      asset.status !== "archived" &&
      (asset.assetType === "rule" ||
        asset.assetType === "document" ||
        asset.assetType === "template"),
  );
  const selectedAssets = candidates.filter((asset) =>
    selectedIds.includes(asset.id),
  );

  function toggle(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  async function handleConfirm() {
    setIsSubmitting(true);

    try {
      await onPick(selectedAssets);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="关闭从公共资产库挑资产"
        className="absolute inset-0 cursor-default bg-slate-950/35 backdrop-blur-[2px]"
        onClick={isSubmitting ? undefined : onClose}
        type="button"
      />

      <aside
        aria-labelledby="public-asset-picker-title"
        aria-modal="true"
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl sm:max-w-3xl"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <LibraryBig aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-xs text-slate-500">公共资产库</p>
              <h2
                className="mt-1 text-lg font-semibold text-slate-950"
                id="public-asset-picker-title"
              >
                挑资产带进「{projectName}」
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                勾选要带过去的规则、文档和模板。复制进项目后各自独立，
                改项目里的那一份不会动公共资产库；之前挑过的不会重复带。
              </p>
            </div>
          </div>

          <button
            aria-label="关闭从公共资产库挑资产"
            className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSubmitting}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-6">
          {candidates.length === 0 ? (
            <p className="text-sm text-slate-500">
              公共资产库里还没有规则、文档或模板。先去公共资产视图装一个规则包，
              或者导入文档包。
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-slate-100">
              {candidates.map((asset) => (
                <li key={asset.id}>
                  <label className="flex cursor-pointer items-start gap-3 py-3">
                    <input
                      checked={selectedIds.includes(asset.id)}
                      className="mt-1"
                      onChange={() => toggle(asset.id)}
                      type="checkbox"
                    />
                    <span className="min-w-0">
                      <span className="text-sm font-semibold text-slate-800">
                        {asset.title}
                      </span>
                      <span className="ml-2 text-xs text-slate-500">
                        {assetTypeLabels[asset.assetType]}
                      </span>
                      {asset.summary && (
                        <span className="mt-1 block text-xs leading-5 text-slate-500">
                          {asset.summary}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 sm:px-6">
          <p className="text-sm text-slate-500">已选 {selectedAssets.length} 条</p>
          <div className="flex items-center gap-3">
            <button
              className="h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSubmitting}
              onClick={onClose}
              type="button"
            >
              取消
            </button>
            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={isSubmitting || selectedAssets.length === 0}
              onClick={() => void handleConfirm()}
              type="button"
            >
              {isSubmitting ? (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <LibraryBig aria-hidden="true" className="size-4" />
              )}
              带进这个项目
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
