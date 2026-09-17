"use client";

import {
  AlertTriangle,
  LoaderCircle,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";

import type { PromptCardData } from "@/data/prompts";
import { useModalBehavior } from "@/hooks/use-modal-behavior";

type DeleteConfirmDialogProps = {
  prompt: PromptCardData;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
};

export function DeleteConfirmDialog({
  prompt,
  onCancel,
  onConfirm,
}: DeleteConfirmDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useModalBehavior(onCancel);

  async function handleConfirm() {
    setIsDeleting(true);
    setErrorMessage(null);

    try {
      await onConfirm();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "删除提示词失败。",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-5">
      <button
        aria-label="取消删除"
        className="absolute inset-0 cursor-default bg-slate-950/45 backdrop-blur-[2px]"
        onClick={onCancel}
        type="button"
      />

      <section
        aria-labelledby="delete-dialog-title"
        aria-modal="true"
        className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-2xl"
        role="alertdialog"
      >
        <button
          aria-label="取消删除"
          className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          onClick={onCancel}
          type="button"
        >
          <X aria-hidden="true" className="size-5" />
        </button>

        <span className="flex size-11 items-center justify-center rounded-lg bg-red-50 text-red-700">
          <AlertTriangle aria-hidden="true" className="size-5" />
        </span>

        <h2
          className="mt-5 text-lg font-semibold text-slate-950"
          id="delete-dialog-title"
        >
          确认删除这条提示词？
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          “{prompt.title}”将从本机提示词库中移除，当前操作无法直接撤销。
        </p>

        {errorMessage && (
          <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            className="h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isDeleting}
            onClick={onCancel}
            type="button"
          >
            取消
          </button>
          <button
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={isDeleting}
            onClick={handleConfirm}
            type="button"
          >
            {isDeleting ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin"
              />
            ) : (
              <Trash2 aria-hidden="true" className="size-4" />
            )}
            {isDeleting ? "正在删除" : "删除提示词"}
          </button>
        </div>
      </section>
    </div>
  );
}
