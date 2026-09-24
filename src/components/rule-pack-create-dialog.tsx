"use client";

import { Layers3, X } from "lucide-react";
import { useState } from "react";

import type { AssetData } from "@/data/assets";
import { assetTypeLabels } from "@/lib/asset-list";
import { useModalBehavior } from "@/hooks/use-modal-behavior";

type RulePackCreateDialogProps = {
  assets: AssetData[];
  onClose: () => void;
  onDownload: (input: { title: string; assets: AssetData[] }) => void;
};

// 打包只生成文件，不改库里的资产；所以这里不写库、不校验重名，只负责挑内容。
export function RulePackCreateDialog({
  assets,
  onClose,
  onDownload,
}: RulePackCreateDialogProps) {
  const [title, setTitle] = useState("我的规则包");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useModalBehavior(onClose);

  const candidates = assets.filter(
    (asset) => asset.assetType === "rule" || asset.assetType === "document",
  );

  function toggle(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  const selectedAssets = candidates.filter((asset) =>
    selectedIds.includes(asset.id),
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-5">
      <button
        aria-label="关闭打包规则包"
        className="absolute inset-0 cursor-default bg-slate-950/45 backdrop-blur-[2px]"
        onClick={onClose}
        type="button"
      />

      <section
        aria-labelledby="rule-pack-create-title"
        aria-modal="true"
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
              <Layers3 aria-hidden="true" className="size-5" />
            </span>
            <div>
              <h2
                className="text-lg font-semibold text-slate-950"
                id="rule-pack-create-title"
              >
                打包成规则包
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                勾选要收进包里的规则和文档，生成一个可以搬运、也可以再导回来的包文件。
                只生成文件，不改动库里已有的资产。
              </p>
            </div>
          </div>

          <button
            aria-label="关闭打包规则包"
            className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-6 sm:px-6">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-slate-700">包名</span>
            <input
              className="h-11 rounded-lg border border-[#dbe7f5] bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </label>

          <h3 className="mt-5 text-sm font-semibold text-slate-700">
            挑成员（已选 {selectedAssets.length} 条）
          </h3>

          {candidates.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              公共资产库里还没有规则或文档，先装一个规则包或新建一条再来打包。
            </p>
          ) : (
            <ul className="mt-3 flex flex-col divide-y divide-slate-100">
              {candidates.map((asset) => (
                <li key={asset.id}>
                  <label className="flex cursor-pointer items-start gap-3 py-2.5">
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
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-4 sm:px-6">
          <button
            className="h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            取消
          </button>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={selectedAssets.length === 0 || !title.trim()}
            onClick={() => onDownload({ title: title.trim(), assets: selectedAssets })}
            type="button"
          >
            <Layers3 aria-hidden="true" className="size-4" />
            生成并下载
          </button>
        </footer>
      </section>
    </div>
  );
}
