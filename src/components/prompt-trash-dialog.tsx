"use client";

import {
  AlertTriangle,
  Clock3,
  GitMerge,
  LoaderCircle,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";

import type {
  PromptCardData,
  PromptVersionData,
} from "@/data/prompts";
import { useModalBehavior } from "@/hooks/use-modal-behavior";
import { getRemainingTrashDays } from "@/lib/prompt-lifecycle";
import {
  getDeletedReasonLabel,
  getMergeRestoreConfirmation,
  getMergeSourceCount,
  getTrashSummary,
} from "@/lib/prompt-trash-presentation";

type PromptTrashDialogProps = {
  prompts: PromptCardData[];
  records: PromptVersionData[];
  isLoading: boolean;
  loadError: string | null;
  onClose: () => void;
  onRetry: () => void;
  onRestorePrompt: (promptId: string) => Promise<void>;
  onPermanentlyDeletePrompt: (promptId: string) => Promise<void>;
  onEmptyTrash: () => Promise<void>;
  onRestoreMergeRecord: (versionId: string) => Promise<void>;
  onPermanentlyDeleteMergeRecord: (versionId: string) => Promise<void>;
  onNotify: (message: string) => void;
};

type PendingConfirm =
  | {
      kind: "permanent-delete";
      prompt: PromptCardData;
    }
  | {
      kind: "empty-trash";
    }
  | {
      kind: "restore-merge";
      record: PromptVersionData;
    }
  | {
      kind: "permanent-delete-merge";
      record: PromptVersionData;
    };

function formatDateTime(value: string | null) {
  if (!value) {
    return "时间未知";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "时间无法识别";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getRemainingDaysLabel(prompt: PromptCardData) {
  if (
    !prompt.deletedAt ||
    Number.isNaN(new Date(prompt.deletedAt).getTime())
  ) {
    return "剩余天数未知";
  }

  return `剩余 ${getRemainingTrashDays(prompt.deletedAt)} 天`;
}

function describeConfirm(
  confirm: PendingConfirm,
  prompts: PromptCardData[],
  records: PromptVersionData[],
) {
  if (confirm.kind === "permanent-delete") {
    return {
      title: "确认彻底删除这条提示词？",
      description: `“${confirm.prompt.title}”将被永久删除，删除后无法恢复。`,
      confirmLabel: "彻底删除",
      isDestructive: true,
    };
  }

  if (confirm.kind === "empty-trash") {
    return {
      title: "确认清空垃圾箱？",
      description: `将永久删除 ${prompts.length} 条提示词和 ${records.length} 条合并恢复记录，删除后无法恢复。`,
      confirmLabel: "清空垃圾箱",
      isDestructive: true,
    };
  }

  if (confirm.kind === "permanent-delete-merge") {
    return {
      title: "确认彻底删除这条恢复记录？",
      description: `“${confirm.record.title}”的合并恢复快照将被永久删除，删除后无法恢复，但不会影响现有提示词。`,
      confirmLabel: "彻底删除",
      isDestructive: true,
    };
  }

  return {
    title: "确认恢复合并前版本？",
    description: getMergeRestoreConfirmation(confirm.record),
    confirmLabel: "恢复合并前版本",
    isDestructive: false,
  };
}

type TrashConfirmDialogProps = {
  confirm: PendingConfirm;
  prompts: PromptCardData[];
  records: PromptVersionData[];
  isBusy: boolean;
  actionError: string | null;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
};

function TrashConfirmDialog({
  confirm,
  prompts,
  records,
  isBusy,
  actionError,
  onCancel,
  onConfirm,
}: TrashConfirmDialogProps) {
  const content = describeConfirm(confirm, prompts, records);

  useModalBehavior(onCancel, isBusy);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-5">
      <button
        aria-label="取消确认"
        className="absolute inset-0 cursor-default bg-slate-950/45 backdrop-blur-[2px]"
        onClick={onCancel}
        type="button"
      />

      <section
        aria-describedby="trash-confirm-description"
        aria-labelledby="trash-confirm-title"
        aria-modal="true"
        className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-2xl"
        role="alertdialog"
      >
        <button
          aria-label="取消确认"
          className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          onClick={onCancel}
          type="button"
        >
          <X aria-hidden="true" className="size-5" />
        </button>

        <span className="flex size-11 items-center justify-center rounded-lg bg-red-100 text-red-700">
          <AlertTriangle aria-hidden="true" className="size-5" />
        </span>

        <h2
          className="mt-5 text-lg font-semibold text-slate-950"
          id="trash-confirm-title"
        >
          {content.title}
        </h2>
        <p
          className="mt-2 text-sm leading-6 text-slate-600"
          id="trash-confirm-description"
        >
          {content.description}
        </p>

        {actionError && (
          <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {actionError}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            autoFocus
            className="h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isBusy}
            onClick={onCancel}
            type="button"
          >
            取消
          </button>
          <button
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:bg-slate-300 ${
              content.isDestructive
                ? "bg-red-600 hover:bg-red-700"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
            disabled={isBusy}
            onClick={() => void onConfirm()}
            type="button"
          >
            {isBusy ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin"
              />
            ) : content.isDestructive ? (
              <Trash2 aria-hidden="true" className="size-4" />
            ) : (
              <RotateCcw aria-hidden="true" className="size-4" />
            )}
            {isBusy ? "正在处理" : content.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export function PromptTrashDialog({
  prompts,
  records,
  isLoading,
  loadError,
  onClose,
  onRetry,
  onRestorePrompt,
  onPermanentlyDeletePrompt,
  onEmptyTrash,
  onRestoreMergeRecord,
  onPermanentlyDeleteMergeRecord,
  onNotify,
}: PromptTrashDialogProps) {
  const [pendingConfirm, setPendingConfirm] =
    useState<PendingConfirm | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const isBusy = busyAction !== null;
  const canEmptyTrash = prompts.length > 0 || records.length > 0;

  useModalBehavior(onClose, isBusy || Boolean(pendingConfirm));

  async function executeAction(
    actionKey: string,
    action: () => Promise<void>,
    successMessage: string,
  ) {
    setBusyAction(actionKey);
    setActionError(null);

    try {
      await action();
      onNotify(successMessage);
      return true;
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "操作失败，请稍后重试。",
      );
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  function handleRestorePrompt(prompt: PromptCardData) {
    void executeAction(
      `restore-prompt:${prompt.id}`,
      () => onRestorePrompt(prompt.id),
      "提示词已恢复",
    );
  }

  async function handleConfirm() {
    if (!pendingConfirm) {
      return;
    }

    if (pendingConfirm.kind === "permanent-delete") {
      const succeeded = await executeAction(
        `permanent-delete:${pendingConfirm.prompt.id}`,
        () => onPermanentlyDeletePrompt(pendingConfirm.prompt.id),
        "提示词已彻底删除",
      );

      if (succeeded) {
        setPendingConfirm(null);
      }
      return;
    }

    if (pendingConfirm.kind === "empty-trash") {
      const succeeded = await executeAction(
        "empty-trash",
        onEmptyTrash,
        "垃圾箱已清空",
      );

      if (succeeded) {
        setPendingConfirm(null);
      }
      return;
    }

    if (pendingConfirm.kind === "permanent-delete-merge") {
      const succeeded = await executeAction(
        `permanent-delete-merge:${pendingConfirm.record.versionId}`,
        () => onPermanentlyDeleteMergeRecord(pendingConfirm.record.versionId),
        "恢复记录已彻底删除",
      );

      if (succeeded) {
        setPendingConfirm(null);
      }
      return;
    }

    const succeeded = await executeAction(
      `restore-merge:${pendingConfirm.record.versionId}`,
      () => onRestoreMergeRecord(pendingConfirm.record.versionId),
      "已恢复合并前版本",
    );

    if (succeeded) {
      setPendingConfirm(null);
    }
  }

  const summary = getTrashSummary({ prompts, records });

  function renderContent() {
    if (isLoading) {
      return (
        <div
          aria-label="正在读取垃圾箱"
          className="flex min-h-72 flex-col items-center justify-center text-center"
        >
          <LoaderCircle
            aria-hidden="true"
            className="size-7 animate-spin text-blue-600"
          />
          <p className="mt-4 text-sm font-medium text-slate-600">
            正在读取垃圾箱
          </p>
        </div>
      );
    }

    if (loadError) {
      return (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-lg border border-red-200 bg-white px-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-lg bg-red-50 text-red-700">
            <AlertTriangle aria-hidden="true" className="size-5" />
          </span>
          <h3 className="mt-4 text-lg font-semibold text-slate-900">
            垃圾箱读取失败
          </h3>
          <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">
            {loadError}
          </p>
          <button
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            onClick={onRetry}
            type="button"
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            重新读取
          </button>
        </div>
      );
    }

    return (
      <div>
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-sm leading-6 text-slate-500">
            <Clock3
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-blue-600"
            />
            <span>已删除内容保留 30 天，到期后自动清理。</span>
          </div>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isBusy || !canEmptyTrash}
            onClick={() => setPendingConfirm({ kind: "empty-trash" })}
            type="button"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            清空垃圾箱
          </button>
        </div>

        {actionError && (
          <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {actionError}
          </p>
        )}

        <section aria-label="已删除提示词" className="mt-7">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">
              已删除提示词
            </h3>
            <span className="text-xs text-slate-500">{prompts.length} 条</span>
          </div>

          {prompts.length > 0 ? (
            <div className="mt-4 space-y-3">
              {prompts.map((prompt) => (
                <article
                  className="rounded-lg border border-slate-200 bg-white p-4"
                  key={prompt.id}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-semibold text-slate-900">
                        {prompt.title}
                      </h4>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                          {prompt.category}
                        </span>
                        {prompt.tags.map((tag) => (
                          <span
                            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
                            key={tag}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isBusy}
                        onClick={() => handleRestorePrompt(prompt)}
                        type="button"
                      >
                        {busyAction === `restore-prompt:${prompt.id}` ? (
                          <LoaderCircle
                            aria-hidden="true"
                            className="size-3.5 animate-spin"
                          />
                        ) : (
                          <RotateCcw aria-hidden="true" className="size-3.5" />
                        )}
                        恢复
                      </button>
                      <button
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isBusy}
                        onClick={() =>
                          setPendingConfirm({
                            kind: "permanent-delete",
                            prompt,
                          })
                        }
                        type="button"
                      >
                        <Trash2 aria-hidden="true" className="size-3.5" />
                        彻底删除
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span>删除时间：{formatDateTime(prompt.deletedAt)}</span>
                    <span>
                      来源：
                      {getDeletedReasonLabel(prompt.deletedReason ?? "manual")}
                    </span>
                    <span className="font-medium text-slate-700">
                      {getRemainingDaysLabel(prompt)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-white px-5 py-8 text-center">
              <Trash2 aria-hidden="true" className="mx-auto size-7 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">没有已删除提示词</p>
            </div>
          )}
        </section>

        <section aria-label="合并恢复记录" className="mt-8 border-t border-slate-200 pt-7">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">
              合并恢复记录
            </h3>
            <span className="text-xs text-slate-500">{records.length} 条</span>
          </div>

          {records.length > 0 ? (
            <div className="mt-4 space-y-3">
              {records.map((record) => (
                <article
                  className="rounded-lg border border-slate-200 bg-white p-4"
                  key={record.versionId}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <GitMerge
                          aria-hidden="true"
                          className="size-4 shrink-0 text-violet-600"
                        />
                        <h4 className="truncate text-sm font-semibold text-slate-900">
                          {record.title}
                        </h4>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        合并时间：{formatDateTime(record.createdAt)}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        来源提示词：{getMergeSourceCount(record)} 条
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isBusy}
                        onClick={() =>
                          setPendingConfirm({
                            kind: "restore-merge",
                            record,
                          })
                        }
                        type="button"
                      >
                        {busyAction === `restore-merge:${record.versionId}` ? (
                          <LoaderCircle
                            aria-hidden="true"
                            className="size-3.5 animate-spin"
                          />
                        ) : (
                          <RotateCcw aria-hidden="true" className="size-3.5" />
                        )}
                        恢复
                      </button>
                      <button
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isBusy}
                        onClick={() =>
                          setPendingConfirm({
                            kind: "permanent-delete-merge",
                            record,
                          })
                        }
                        type="button"
                      >
                        <Trash2 aria-hidden="true" className="size-3.5" />
                        彻底删除
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-white px-5 py-8 text-center">
              <GitMerge aria-hidden="true" className="mx-auto size-7 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">没有合并恢复记录</p>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="关闭垃圾箱"
        className="absolute inset-0 cursor-default bg-slate-950/35 backdrop-blur-[2px] disabled:cursor-not-allowed"
        disabled={isBusy}
        onClick={onClose}
        type="button"
      />

      <aside
        aria-labelledby="prompt-trash-title"
        aria-modal="true"
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl sm:max-w-3xl"
        role="dialog"
      >
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <Trash2 aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-xs font-semibold text-blue-700">垃圾箱</p>
              <h2
                className="mt-1 text-lg font-semibold text-slate-950"
                id="prompt-trash-title"
              >
                垃圾箱与恢复记录
              </h2>
              <p className="mt-1 text-sm text-slate-500">{summary}</p>
            </div>
          </div>

          <button
            aria-label="关闭垃圾箱"
            className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isBusy}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-6">
          {renderContent()}
        </div>
      </aside>

      {pendingConfirm && (
        <TrashConfirmDialog
          actionError={actionError}
          confirm={pendingConfirm}
          isBusy={isBusy}
          onCancel={() => setPendingConfirm(null)}
          onConfirm={handleConfirm}
          prompts={prompts}
          records={records}
        />
      )}
    </div>
  );
}
