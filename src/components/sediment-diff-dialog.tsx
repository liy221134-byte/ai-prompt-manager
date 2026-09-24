"use client";

import { X } from "lucide-react";

import { useModalBehavior } from "@/hooks/use-modal-behavior";
import { diffPromptLines } from "@/lib/prompt-diff";

type SedimentDiffDialogProps = {
  title: string;
  // 项目里现在这份
  currentContent: string;
  // 公共库那份
  upstreamContent: string;
  onClose: () => void;
};

// 只读差异：公共库那份和项目里这份比，一行一行看。不做任何写入。
export function SedimentDiffDialog({
  title,
  currentContent,
  upstreamContent,
  onClose,
}: SedimentDiffDialogProps) {
  useModalBehavior(onClose);

  const diff = diffPromptLines(currentContent, upstreamContent);
  const added = diff.filter((line) => line.type === "added").length;
  const removed = diff.filter((line) => line.type === "removed").length;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-5">
      <button
        aria-label="关闭差异对比"
        className="absolute inset-0 cursor-default bg-slate-950/45 backdrop-blur-[2px]"
        onClick={onClose}
        type="button"
      />

      <section
        aria-labelledby="sediment-diff-title"
        aria-modal="true"
        className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs text-slate-500">和公共库那份比</p>
            <h2
              className="mt-1 text-lg font-semibold text-slate-950"
              id="sediment-diff-title"
            >
              {title}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              正文差异：公共库那份多 {added} 行、少 {removed} 行（左边是你现在这份，右边是公共库那份）
            </p>
          </div>

          <button
            aria-label="关闭差异对比"
            className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {diff.length === 0 ? (
            <p className="text-sm text-slate-500">两份正文完全一样。</p>
          ) : (
            <ul className="flex flex-col gap-0.5 font-mono text-xs leading-6">
              {diff.map((line, index) => (
                <li
                  className={
                    line.type === "added"
                      ? "rounded bg-emerald-50 px-2 text-emerald-800"
                      : line.type === "removed"
                        ? "rounded bg-rose-50 px-2 text-rose-800"
                        : "px-2 text-slate-600"
                  }
                  key={`${index}-${line.type}`}
                >
                  <span className="mr-2 text-slate-400">
                    {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
                  </span>
                  {line.text || " "}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
