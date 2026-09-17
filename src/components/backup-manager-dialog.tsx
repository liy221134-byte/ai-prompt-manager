"use client";

import {
  AlertTriangle,
  Clock3,
  DatabaseBackup,
  Download,
  FileCheck2,
  FilePlus2,
  RefreshCcw,
  Upload,
  X,
} from "lucide-react";
import { ChangeEvent, useRef, useState } from "react";

import { useModalBehavior } from "@/hooks/use-modal-behavior";
import {
  createPromptImportPlan,
  parsePromptBackup,
  type PromptImportPlan,
} from "@/lib/prompt-backup";

type BackupManagerDialogProps = {
  lastBackupAt: string | null;
  promptCount: number;
  prompts: Parameters<typeof createPromptImportPlan>[0];
  onClose: () => void;
  onExport: () => string;
  onImport: (plan: PromptImportPlan) => void;
  onNotify: (message: string) => void;
};

const maxBackupFileSize = 5 * 1024 * 1024;

function formatDateTime(value: string | null) {
  if (!value) {
    return "尚未备份";
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

const actionStyles = {
  add: {
    label: "新增",
    className: "bg-emerald-50 text-emerald-700",
  },
  update: {
    label: "更新",
    className: "bg-blue-50 text-blue-700",
  },
  skip: {
    label: "跳过",
    className: "bg-slate-100 text-slate-600",
  },
} as const;

export function BackupManagerDialog({
  lastBackupAt,
  promptCount,
  prompts,
  onClose,
  onExport,
  onImport,
  onNotify,
}: BackupManagerDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importPlan, setImportPlan] = useState<PromptImportPlan | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  useModalBehavior(onClose);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (file.size > maxBackupFileSize) {
      setImportPlan(null);
      setImportError("备份文件不能超过 5 MB。");
      return;
    }

    try {
      const content = await file.text();
      const backup = parsePromptBackup(content);
      const nextPlan = createPromptImportPlan(prompts, backup);

      setImportPlan(nextPlan);
      setImportError(null);
    } catch (error) {
      setImportPlan(null);
      setImportError(
        error instanceof Error ? error.message : "备份文件无法读取。",
      );
    }
  }

  function handleExport() {
    try {
      onExport();
      onNotify("备份文件已导出");
    } catch {
      onNotify("备份文件导出失败");
    }
  }

  function handleConfirmImport() {
    if (!importPlan) {
      return;
    }

    onImport(importPlan);
  }

  const hasPendingChanges = Boolean(
    importPlan && importPlan.addCount + importPlan.updateCount > 0,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5 py-8">
      <button
        aria-label="关闭数据备份与恢复"
        className="absolute inset-0 cursor-default bg-slate-950/40 backdrop-blur-[2px]"
        onClick={onClose}
        type="button"
      />

      <section
        aria-labelledby="backup-dialog-title"
        aria-modal="true"
        className="relative flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl"
        role="dialog"
      >
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <DatabaseBackup aria-hidden="true" className="size-5" />
            </span>
            <div>
              <h2
                className="text-lg font-semibold text-slate-950"
                id="backup-dialog-title"
              >
                数据备份与恢复
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                当前共有 {promptCount} 条提示词
              </p>
            </div>
          </div>

          <button
            aria-label="关闭数据备份与恢复"
            className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-6 sm:px-6">
          {!importPlan && !importError && (
            <div className="grid gap-5 sm:grid-cols-2">
              <section className="rounded-lg border border-slate-200 p-5">
                <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                  <Download aria-hidden="true" className="size-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-slate-950">
                  导出备份
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  将全部提示词保存为可恢复的 JSON 文件。
                </p>
                <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                  <Clock3 aria-hidden="true" className="size-3.5" />
                  上次备份：{formatDateTime(lastBackupAt)}
                </div>
                <button
                  className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                  onClick={handleExport}
                  type="button"
                >
                  <Download aria-hidden="true" className="size-4" />
                  导出备份文件
                </button>
              </section>

              <section className="rounded-lg border border-slate-200 p-5">
                <span className="flex size-10 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
                  <Upload aria-hidden="true" className="size-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-slate-950">
                  导入备份
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  导入前会先检查文件并展示合并结果。
                </p>
                <p className="mt-4 text-xs text-slate-500">
                  当前提示词不会被删除。
                </p>
                <input
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleFileChange}
                  ref={fileInputRef}
                  type="file"
                />
                <button
                  className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  <Upload aria-hidden="true" className="size-4" />
                  选择备份文件
                </button>
              </section>
            </div>
          )}

          {importError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-red-700"
                />
                <div>
                  <h3 className="text-base font-semibold text-red-900">
                    无法导入这个文件
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-red-800">
                    {importError}
                  </p>
                </div>
              </div>
              <button
                className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg border border-red-300 bg-white px-4 text-sm font-semibold text-red-800 transition-colors hover:bg-red-100"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <Upload aria-hidden="true" className="size-4" />
                重新选择文件
              </button>
            </div>
          )}

          {importPlan && (
            <div>
              <div className="flex items-start gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  <FileCheck2 aria-hidden="true" className="size-5" />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-slate-950">
                    导入预览
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    备份导出时间：{formatDateTime(importPlan.backup.exportedAt)}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-emerald-50 px-4 py-3">
                  <p className="text-xs font-medium text-emerald-700">新增</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-900">
                    {importPlan.addCount}
                  </p>
                </div>
                <div className="rounded-lg bg-blue-50 px-4 py-3">
                  <p className="text-xs font-medium text-blue-700">更新</p>
                  <p className="mt-1 text-2xl font-bold text-blue-900">
                    {importPlan.updateCount}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-100 px-4 py-3">
                  <p className="text-xs font-medium text-slate-600">跳过</p>
                  <p className="mt-1 text-2xl font-bold text-slate-800">
                    {importPlan.skipCount}
                  </p>
                </div>
              </div>

              <div className="mt-5 overflow-hidden rounded-lg border border-slate-200">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                  <p className="text-xs font-semibold text-slate-600">
                    合并明细
                  </p>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {importPlan.items.map((item) => {
                    const actionStyle = actionStyles[item.action];

                    return (
                      <div
                        className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3 last:border-b-0"
                        key={item.id}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">
                            {item.title}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            {item.reason}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${actionStyle.className}`}
                        >
                          {actionStyle.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {importPlan && (
          <footer className="flex items-center justify-end gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
            <button
              className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              onClick={() => {
                setImportPlan(null);
                setImportError(null);
              }}
              type="button"
            >
              返回
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={!hasPendingChanges}
              onClick={handleConfirmImport}
              type="button"
            >
              {importPlan.updateCount > 0 ? (
                <RefreshCcw aria-hidden="true" className="size-4" />
              ) : (
                <FilePlus2 aria-hidden="true" className="size-4" />
              )}
              {hasPendingChanges ? "确认导入" : "无需变更"}
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}
