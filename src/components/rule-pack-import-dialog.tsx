"use client";

import { AlertTriangle, FileCheck2, Layers3, LoaderCircle, Upload, X } from "lucide-react";
import { ChangeEvent, useRef, useState } from "react";

import type { ProjectData } from "@/data/projects";
import { assetTypeLabels, projectScaleLabels, ruleConfidenceLabels } from "@/lib/asset-list";
import { downloadRulePack } from "@/lib/backup-download";
import { createSampleRulePackFile } from "@/lib/rule-pack";
import { parseRulePackFile, type RulePackFile } from "@/lib/seed-pack-import";
import { useModalBehavior } from "@/hooks/use-modal-behavior";

type RulePackImportDialogProps = {
  projects: ProjectData[];
  activeProjectId: string | null;
  onClose: () => void;
  onInstall: (file: RulePackFile, projectId: string) => Promise<void>;
};

const maxPackFileSize = 5 * 1024 * 1024;

export function RulePackImportDialog({
  projects,
  activeProjectId,
  onClose,
  onInstall,
}: RulePackImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<RulePackFile | null>(null);
  const [fileName, setFileName] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [targetProjectId, setTargetProjectId] = useState(
    activeProjectId ?? projects[0]?.id ?? "",
  );
  const [isInstalling, setIsInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  useModalBehavior(onClose);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = "";

    if (!selected) {
      return;
    }

    if (selected.size > maxPackFileSize) {
      setFile(null);
      setLoadError("规则包文件不能超过 5 MB。");
      return;
    }

    try {
      const parsed = parseRulePackFile(await selected.text());

      setFile(parsed);
      setFileName(selected.name);
      setLoadError(null);
      setInstallError(null);
    } catch (error) {
      setFile(null);
      setFileName("");
      setLoadError(
        error instanceof Error ? error.message : "规则包文件无法读取。",
      );
    }
  }

  async function handleInstall() {
    if (!file || !targetProjectId) {
      return;
    }

    setIsInstalling(true);
    setInstallError(null);

    try {
      await onInstall(file, targetProjectId);
    } catch (error) {
      setInstallError(
        error instanceof Error ? error.message : "安装规则包失败。",
      );
      return;
    } finally {
      setIsInstalling(false);
    }

    onClose();
  }

  const ruleCount = file
    ? file.members.filter((member) => member.assetType === "rule").length
    : 0;
  const documentCount = file
    ? file.members.filter((member) => member.assetType === "document").length
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div
        aria-labelledby="rule-pack-import-title"
        aria-modal="true"
        className="relative flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl"
        role="dialog"
      >
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
              <Layers3 aria-hidden="true" className="size-5" />
            </span>
            <div>
              <h2
                className="text-lg font-semibold text-slate-950"
                id="rule-pack-import-title"
              >
                导入规则包
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                规则包是一组已经确认过的规则和文档，装进项目时按包内编号去重，
                不会覆盖你改过的内容。
              </p>
            </div>
          </div>

          <button
            aria-label="关闭导入规则包"
            className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-6 sm:px-6">
          {!file && (
            <section className="rounded-lg border border-dashed border-slate-300 p-6 text-center">
              <Upload aria-hidden="true" className="mx-auto size-6 text-slate-400" />
              <p className="mt-3 text-sm text-slate-600">
                选择一个规则包文件（.json），先看内容再决定装到哪个项目。
              </p>
              <input
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileChange}
                ref={fileInputRef}
                type="file"
              />
              <button
                className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <Upload aria-hidden="true" className="size-4" />
                选择规则包文件
              </button>
              {fileName && (
                <p className="mt-3 text-xs text-slate-500">已选文件：{fileName}</p>
              )}
              <p className="mt-4 text-xs leading-5 text-slate-500">
                规则包是一个 JSON 文件，里面有两块：包信息（包名、版本、可信度、
                适用规模、来源说明）和成员清单（每条规则或文档的标题、正文、元数据）。
                数据备份文件不是规则包，恢复数据请用「数据管理 → 导入备份」。
              </p>
              <button
                className="mt-3 text-xs font-semibold text-indigo-700 hover:underline"
                onClick={() =>
                  downloadRulePack(
                    createSampleRulePackFile(new Date().toISOString()),
                  )
                }
                type="button"
              >
                下载示例规则包
              </button>
            </section>
          )}

          {loadError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-red-700"
                />
                <p className="text-sm leading-6 text-red-800">{loadError}</p>
              </div>
            </div>
          )}

          {file && (
            <>
              <section className="rounded-lg border border-slate-200 p-5">
                <div className="flex items-start gap-3">
                  <FileCheck2
                    aria-hidden="true"
                    className="mt-0.5 size-5 shrink-0 text-indigo-700"
                  />
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-slate-950">
                      {file.pack.title}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      {file.pack.summary}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {[
                    ...(file.pack.metadata.packVersion
                      ? [`包版本：${file.pack.metadata.packVersion}`]
                      : []),
                    `可信度：${ruleConfidenceLabels[file.pack.metadata.packConfidence]}`,
                    ...(file.pack.metadata.projectScale.length > 0
                      ? [
                          `适用规模：${file.pack.metadata.projectScale
                            .map((scale) => projectScaleLabels[scale])
                            .join("、")}`,
                        ]
                      : []),
                    `成员：${file.members.length} 条`,
                    ...(ruleCount > 0
                      ? [`${assetTypeLabels.rule} ${ruleCount} 条`]
                      : []),
                    ...(documentCount > 0
                      ? [`${assetTypeLabels.document} ${documentCount} 条`]
                      : []),
                  ].map((item) => (
                    <span
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                      key={item}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </section>

              <section className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50/60 p-5">
                <h3 className="text-sm font-semibold text-indigo-900">
                  装到哪个项目
                </h3>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <select
                    aria-label="选择要安装到的项目"
                    className="h-10 flex-1 rounded-lg border border-indigo-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none"
                    onChange={(event) => setTargetProjectId(event.target.value)}
                    value={targetProjectId}
                  >
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                        {project.id === activeProjectId ? "（当前项目）" : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    disabled={isInstalling || !targetProjectId}
                    onClick={() => void handleInstall()}
                    type="button"
                  >
                    {isInstalling ? (
                      <LoaderCircle
                        aria-hidden="true"
                        className="size-4 animate-spin"
                      />
                    ) : (
                      <Layers3 aria-hidden="true" className="size-4" />
                    )}
                    安装到这个项目
                  </button>
                </div>
                {installError && (
                  <p className="mt-3 text-sm text-red-700">{installError}</p>
                )}
              </section>

              <button
                className="mt-4 text-sm font-semibold text-slate-500 underline-offset-4 hover:text-slate-900 hover:underline"
                onClick={() => {
                  setFile(null);
                  setFileName("");
                  setLoadError(null);
                  setInstallError(null);
                }}
                type="button"
              >
                换一个文件
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
