"use client";

import { LoaderCircle, X } from "lucide-react";
import { useState } from "react";

import type { ProjectData } from "@/data/projects";
import { useModalBehavior } from "@/hooks/use-modal-behavior";
import {
  applySourcePackageDraftEdits,
  splitSourcePackageDraftItem,
  type SourcePackageDraft,
  type SourcePackageDraftItem,
  type SourcePackageDraftType,
} from "@/lib/source-package-draft";

type UploadRef = {
  uploadId: string;
  filename: string;
  storedPath: string;
  byteSize: number;
};

type SourcePackageImportDialogProps = {
  projects: ProjectData[];
  currentProjectId: string;
  onClose: () => void;
  onImported: () => Promise<void> | void;
};

const typeLabels: Record<SourcePackageDraftType, string> = {
  prompt: "提示词",
  rule: "规则",
  document: "文档",
};

const inputClassName =
  "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

// 文档包导入：上传原文 → AI 识别草稿 → 在预览里改完再确认创建。
// 确认之前不建项目、不写资产，原文只暂时放在来源目录里。
export function SourcePackageImportDialog({
  projects,
  currentProjectId,
  onClose,
  onImported,
}: SourcePackageImportDialogProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploads, setUploads] = useState<UploadRef[]>([]);
  const [draft, setDraft] = useState<SourcePackageDraft | null>(null);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const [projectMode, setProjectMode] = useState<"new" | "existing">("new");
  const [projectName, setProjectName] = useState("");
  const [projectGoal, setProjectGoal] = useState("");
  const [existingProjectId, setExistingProjectId] = useState(currentProjectId);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  // 批次编号在弹层打开时生成，重复确认只会被当成同一批处理
  const [importBatchId] = useState(
    () => `import-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  );

  useModalBehavior(isBusy ? () => undefined : onClose, isBusy);

  const keptItems = draft
    ? draft.items.filter((item) => !excludedIds.includes(item.id))
    : [];

  async function readJson(response: Response) {
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(body?.error ?? "操作失败，请稍后重试。");
    }

    return body;
  }

  async function handleAnalyze() {
    if (files.length === 0) {
      setErrorMessage("请先选择要导入的文件。");
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);
    setStatusText("正在保存原文…");

    try {
      const uploaded: UploadRef[] = [];

      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        const body = await readJson(
          await fetch("/api/source-packages", { method: "POST", body: form }),
        );
        uploaded.push(body.upload);
      }

      setUploads(uploaded);
      setStatusText("正在让 AI 识别…");

      const items: SourcePackageDraftItem[] = [];
      const skipped: Array<{ sourceFilename: string; reason: string }> = [];
      let aiProjectName = "";
      let aiProjectGoal = "";

      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        const body = await readJson(
          await fetch("/api/ai/extract-package", { method: "POST", body: form }),
        );

        aiProjectName ||= body.draft.project.name;
        aiProjectGoal ||= body.draft.project.goal;
        items.push(...body.draft.items);
        skipped.push(...body.draft.skipped);
      }

      // 每个文件的草稿编号都从 1 开始，合并后要重新编号，避免相互覆盖
      const renamed = items.map((item, index) => ({
        ...item,
        id: `item-${index + 1}`,
      }));

      setDraft({
        project: { name: aiProjectName, goal: aiProjectGoal },
        items: renamed,
        skipped,
      });
      setProjectName(aiProjectName || "导入的项目");
      setProjectGoal(aiProjectGoal);
      setStatusText(
        `识别完成：${renamed.length} 条待确认${skipped.length > 0 ? `，${skipped.length} 个文件没认出来` : ""}。`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "导入失败。");
      setStatusText(null);
    } finally {
      setIsBusy(false);
    }
  }

  function updateItem(id: string, patch: Partial<SourcePackageDraftItem>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === id ? { ...item, ...patch } : item,
            ),
          }
        : current,
    );
  }

  function toggleExcluded(id: string) {
    setExcludedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function mergeIntoPrevious(index: number) {
    if (!draft || index === 0) {
      return;
    }

    setDraft(
      applySourcePackageDraftEdits(draft, {
        merges: [
          { targetId: draft.items[index - 1].id, sourceIds: [draft.items[index].id] },
        ],
      }),
    );
  }

  function splitItem(id: string) {
    if (!draft) {
      return;
    }

    const result = splitSourcePackageDraftItem(draft, id);
    setDraft(result.draft);
    setStatusText(result.message ?? null);
  }

  async function handleConfirm() {
    if (!draft) {
      return;
    }

    if (keptItems.length === 0) {
      setErrorMessage("至少要保留一条资产才能创建。");
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);
    setStatusText("正在创建项目与资产…");

    try {
      await readJson(
        await fetch("/api/source-packages/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            importBatchId,
            project:
              projectMode === "new"
                ? { mode: "new", name: projectName, goal: projectGoal }
                : { mode: "existing", projectId: existingProjectId },
            uploads,
            draft: {
              project: { name: projectName, goal: projectGoal },
              items: keptItems,
            },
          }),
        }),
      );

      await onImported();
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "创建失败。");
      setStatusText(null);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        aria-label="关闭导入"
        className="absolute inset-0 bg-slate-900/40"
        disabled={isBusy}
        onClick={onClose}
        type="button"
      />
      <div
        aria-labelledby="source-package-import-title"
        aria-modal="true"
        className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        role="dialog"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2
            className="text-base font-semibold text-slate-900"
            id="source-package-import-title"
          >
            导入文档包
          </h2>
          <button
            aria-label="关闭导入"
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100"
            disabled={isBusy}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-sm leading-6 text-slate-600">
            支持 Markdown、纯文本和 ZIP（单包 20 MB）。识别结果只是草稿，
            <strong className="font-semibold text-slate-800">
              确认之前不会创建项目，也不会写入资产
            </strong>
            ，原文只暂时保存在来源目录里。
          </p>

          <label className="mt-4 flex flex-col gap-2">
            <span className="text-sm font-semibold text-slate-700">选择文件</span>
            <input
              accept=".md,.markdown,.txt,.zip"
              className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-700"
              disabled={isBusy || Boolean(draft)}
              multiple
              onChange={(event) =>
                setFiles(Array.from(event.target.files ?? []))
              }
              type="file"
            />
          </label>

          {files.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
              {files.map((file) => (
                <li
                  className="rounded-full bg-slate-100 px-3 py-1"
                  key={`${file.name}-${file.size}`}
                >
                  {file.name}
                </li>
              ))}
            </ul>
          )}

          {draft && (
            <>
              <fieldset className="mt-5 rounded-lg border border-slate-200 px-4 py-3">
                <legend className="px-1 text-sm font-semibold text-slate-700">
                  创建到哪个项目
                </legend>
                <div className="flex flex-col gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      checked={projectMode === "new"}
                      name="project-mode"
                      onChange={() => setProjectMode("new")}
                      type="radio"
                    />
                    新建项目
                  </label>
                  {projectMode === "new" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        className={inputClassName}
                        onChange={(event) => setProjectName(event.target.value)}
                        placeholder="项目名称"
                        value={projectName}
                      />
                      <input
                        className={inputClassName}
                        onChange={(event) => setProjectGoal(event.target.value)}
                        placeholder="这个项目要解决什么问题"
                        value={projectGoal}
                      />
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      checked={projectMode === "existing"}
                      name="project-mode"
                      onChange={() => setProjectMode("existing")}
                      type="radio"
                    />
                    导入到已有项目
                  </label>
                  {projectMode === "existing" && (
                    <select
                      className={inputClassName}
                      onChange={(event) => setExistingProjectId(event.target.value)}
                      value={existingProjectId}
                    >
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </fieldset>

              <section className="mt-5">
                <h3 className="text-sm font-semibold text-slate-700">
                  草稿清单（{keptItems.length} 条会创建
                  {excludedIds.length > 0 ? `，${excludedIds.length} 条跳过` : ""}）
                </h3>
                <ul className="mt-3 flex flex-col gap-3">
                  {draft.items.map((item, index) => {
                    const excluded = excludedIds.includes(item.id);

                    return (
                      <li
                        className={`rounded-lg border px-4 py-3 ${excluded ? "border-slate-200 bg-slate-50 opacity-60" : "border-slate-200 bg-white"}`}
                        key={item.id}
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="flex items-center gap-2 text-xs text-slate-600">
                            <input
                              checked={!excluded}
                              onChange={() => toggleExcluded(item.id)}
                              type="checkbox"
                            />
                            创建
                          </label>
                          <select
                            aria-label="资产类型"
                            className="h-9 rounded-lg border border-slate-300 px-2 text-sm"
                            onChange={(event) =>
                              updateItem(item.id, {
                                assetType: event.target
                                  .value as SourcePackageDraftType,
                              })
                            }
                            value={item.assetType}
                          >
                            {(["prompt", "rule", "document"] as const).map(
                              (type) => (
                                <option key={type} value={type}>
                                  {typeLabels[type]}
                                </option>
                              ),
                            )}
                          </select>
                          <span className="text-xs text-slate-500">
                            来自 {item.sourceFilename}
                          </span>
                          <button
                            className="ml-auto text-xs font-semibold text-blue-700 hover:underline disabled:text-slate-400"
                            disabled={index === 0}
                            onClick={() => mergeIntoPrevious(index)}
                            type="button"
                          >
                            合并到上一条
                          </button>
                          <button
                            className="text-xs font-semibold text-blue-700 hover:underline"
                            onClick={() => splitItem(item.id)}
                            type="button"
                          >
                            按小标题拆分
                          </button>
                        </div>
                        <input
                          className={`${inputClassName} mt-3`}
                          onChange={(event) =>
                            updateItem(item.id, { title: event.target.value })
                          }
                          value={item.title}
                        />
                        {item.reason && (
                          <p className="mt-2 text-xs text-slate-500">
                            AI 判定：{item.reason}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>

              {draft.skipped.length > 0 && (
                <section className="mt-5">
                  <h3 className="text-sm font-semibold text-slate-700">
                    没认出来的文件
                  </h3>
                  <ul className="mt-2 flex flex-col gap-1 text-xs text-slate-600">
                    {draft.skipped.map((entry) => (
                      <li key={`${entry.sourceFilename}-${entry.reason}`}>
                        {entry.sourceFilename}：{entry.reason}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          {statusText && (
            <p className="mt-4 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">
              {statusText}
            </p>
          )}

          {errorMessage && (
            <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-4">
          <button
            className="h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            disabled={isBusy}
            onClick={onClose}
            type="button"
          >
            取消
          </button>
          {draft ? (
            <button
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-slate-300"
              disabled={isBusy}
              onClick={() => void handleConfirm()}
              type="button"
            >
              {isBusy && (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              )}
              确认创建 {keptItems.length} 条资产
            </button>
          ) : (
            <button
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-slate-300"
              disabled={isBusy || files.length === 0}
              onClick={() => void handleAnalyze()}
              type="button"
            >
              {isBusy && (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              )}
              开始识别
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
