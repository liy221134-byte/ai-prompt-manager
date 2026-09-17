"use client";

import { DatabaseZap, LoaderCircle, Merge, X } from "lucide-react";
import { useState } from "react";

import { useModalBehavior } from "@/hooks/use-modal-behavior";

type MigrationDialogProps = {
  localPromptCount: number;
  serverPromptCount: number;
  onDismiss: () => void;
  onMerge: () => Promise<void>;
};

export function MigrationDialog({
  localPromptCount,
  serverPromptCount,
  onDismiss,
  onMerge,
}: MigrationDialogProps) {
  const [isMerging, setIsMerging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useModalBehavior(isMerging ? () => undefined : onDismiss);

  async function handleMerge() {
    setIsMerging(true);
    setErrorMessage(null);

    try {
      await onMerge();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "本机数据合并失败。",
      );
    } finally {
      setIsMerging(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center px-5">
      <button
        aria-label="暂不合并本机数据"
        className="absolute inset-0 cursor-default bg-slate-950/45 backdrop-blur-[2px]"
        onClick={isMerging ? undefined : onDismiss}
        type="button"
      />

      <section
        aria-labelledby="migration-dialog-title"
        aria-modal="true"
        className="relative w-full max-w-lg rounded-lg bg-white p-6 shadow-2xl"
        role="dialog"
      >
        <button
          aria-label="暂不合并本机数据"
          className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isMerging}
          onClick={onDismiss}
          type="button"
        >
          <X aria-hidden="true" className="size-5" />
        </button>

        <span className="flex size-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
          <DatabaseZap aria-hidden="true" className="size-5" />
        </span>

        <h2
          className="mt-5 text-lg font-semibold text-slate-950"
          id="migration-dialog-title"
        >
          发现本机旧数据
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          本机浏览器中有 {localPromptCount} 条提示词，共享数据库中有{" "}
          {serverPromptCount} 条。可以安全合并到共享数据库。
        </p>
        <p className="mt-3 rounded-lg bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
          合并会根据提示词标识和更新时间处理，不会删除共享数据库中的已有内容。
        </p>

        {errorMessage && (
          <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            className="h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isMerging}
            onClick={onDismiss}
            type="button"
          >
            暂不合并
          </button>
          <button
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={isMerging}
            onClick={handleMerge}
            type="button"
          >
            {isMerging ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin"
              />
            ) : (
              <Merge aria-hidden="true" className="size-4" />
            )}
            {isMerging ? "正在合并" : "合并到共享库"}
          </button>
        </div>
      </section>
    </div>
  );
}
