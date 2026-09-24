"use client";

import { Database, FileText, FolderTree, LoaderCircle, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import type { GraphNodeAssetData } from "@/data/assets";
import { useModalBehavior } from "@/hooks/use-modal-behavior";
import {
  documentTypeOptions,
  graphNodeTypeLabels,
} from "@/lib/asset-list";
import { buildCodeModuleDrafts, type CodeFileInfo } from "@/lib/code-module-scan";
import {
  buildDocumentImportDrafts,
  DOCUMENT_IMPORT_LIMITS,
  materializeDocumentAssets,
  type DocumentImportDraft,
} from "@/lib/document-import";
import {
  markImportCandidates,
  materializeImportAssets,
  type GraphNodeImportCandidate,
} from "@/lib/graph-import";
import type { AssetSaveInput } from "@/lib/prompt-api";
import { buildSchemaImportDrafts, parseSqlSchema } from "@/lib/schema-import";

type EngineeringImportDrawerProps = {
  projectName: string;
  projectId: string;
  dataMode: "local" | "supabase";
  nodes: GraphNodeAssetData[];
  // 项目里已有的文档（标题 + 标识），用来判断同名文档
  documents: Array<{ id: string; title: string }>;
  onCreateAsset: (input: AssetSaveInput) => Promise<void>;
  onImported: (createdCount: number) => Promise<void> | void;
  onClose: () => void;
};

const inputClassName =
  "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100";

function readErrorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "操作失败，请稍后重试。";
}

// 工程导入：读现有的 SQL 或代码目录，先生成草稿清单，勾选之后才写资产。
// 导入只补新节点，同编号的默认跳过，不覆盖已经改过的正文。
export function EngineeringImportDrawer({
  projectName,
  projectId,
  dataMode,
  nodes,
  documents,
  onCreateAsset,
  onImported,
  onClose,
}: EngineeringImportDrawerProps) {
  const [source, setSource] = useState<"schema" | "code" | "documents">(
    "schema",
  );
  const [sqlText, setSqlText] = useState("");
  const [sqlFileName, setSqlFileName] = useState("");
  const [directoryPath, setDirectoryPath] = useState("");
  const [candidates, setCandidates] = useState<GraphNodeImportCandidate[]>([]);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const sqlFileInputRef = useRef<HTMLInputElement>(null);
  const documentFileInputRef = useRef<HTMLInputElement>(null);
  const [documentDrafts, setDocumentDrafts] = useState<DocumentImportDraft[]>(
    [],
  );
  const [excludedDocumentNames, setExcludedDocumentNames] = useState<string[]>(
    [],
  );
  const [documentType, setDocumentType] = useState<string>("参考资料");
  // 批次编号在面板打开时生成，一批导入的节点会带上同一个批次
  const [batchId] = useState(
    () => `engineering-import-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  );

  useModalBehavior(isBusy ? () => undefined : onClose, isBusy);

  const nodeTitleById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node.title])),
    [nodes],
  );
  const selected = candidates.filter(
    (candidate) => !excludedIds.includes(candidate.id),
  );
  const duplicateCount = candidates.filter(
    (candidate) => candidate.existingAssetId,
  ).length;

  function applyCandidates(
    next: GraphNodeImportCandidate[],
    label: string,
  ) {
    setCandidates(next);
    setExcludedIds(
      next
        .filter((candidate) => candidate.existingAssetId)
        .map((candidate) => candidate.id),
    );
    setStatusText(
      `${label}，共 ${next.length} 条草稿` +
        (next.some((candidate) => candidate.existingAssetId)
          ? `，其中 ${
              next.filter((candidate) => candidate.existingAssetId).length
            } 条编号已存在，默认不导入。`
          : "。"),
    );
  }

  function resetPreview() {
    setCandidates([]);
    setExcludedIds([]);
    setDocumentDrafts([]);
    setExcludedDocumentNames([]);
    setStatusText(null);
    setErrorMessage(null);
  }

  // 项目文档：选一批 Markdown，原样入库，不走 AI
  async function handleDocumentFiles(fileList: FileList | null) {
    setErrorMessage(null);
    setStatusText(null);

    const files = Array.from(fileList ?? []);

    if (files.length === 0) {
      return;
    }

    try {
      const read = await Promise.all(
        files.map(async (file) => ({
          fileName: file.name,
          content: await file.text(),
          byteSize: file.size,
        })),
      );
      const drafts = buildDocumentImportDrafts({
        files: read,
        existing: documents,
      });

      if (drafts.length === 0) {
        setDocumentDrafts([]);
        setExcludedDocumentNames([]);
        setErrorMessage("这些文件里没有可导入的文字内容。");
        return;
      }

      const duplicates = drafts.filter((draft) => draft.existingAssetId).length;

      setDocumentDrafts(drafts);
      // 同名文档默认不勾选，避免把项目里改过的那份盖掉
      setExcludedDocumentNames(
        drafts
          .filter((draft) => draft.existingAssetId || draft.tooLarge)
          .map((draft) => draft.fileName),
      );
      setStatusText(
        `读到 ${drafts.length} 份文档` +
          (duplicates > 0 ? `，其中 ${duplicates} 份项目里已经有同名文档，默认不导入。` : "。"),
      );
    } catch {
      setErrorMessage("读取文件失败，换一批试试。");
    }
  }

  function handleParseSchema() {
    setErrorMessage(null);
    setStatusText(null);

    if (!sqlText.trim()) {
      setErrorMessage("先粘贴建表语句，或者选一个 .sql 文件。");
      return;
    }

    const tables = parseSqlSchema(sqlText);

    if (tables.length === 0) {
      setCandidates([]);
      setExcludedIds([]);
      setErrorMessage("没有读出建表语句，确认一下内容里有 CREATE TABLE。");
      return;
    }

    applyCandidates(
      markImportCandidates(
        buildSchemaImportDrafts(tables, {
          sourceLabel: sqlFileName || "粘贴的 SQL",
        }),
        nodes,
      ),
      `解析出 ${tables.length} 张表`,
    );
  }

  async function handleSqlFileChange(file: File | null) {
    if (!file) {
      return;
    }

    try {
      setSqlText(await file.text());
      setSqlFileName(file.name);
      resetPreview();
    } catch {
      setErrorMessage("读取这个文件失败，换一个文件试试。");
    }
  }

  async function handleScanDirectory() {
    setErrorMessage(null);
    setStatusText(null);

    if (dataMode !== "local") {
      setErrorMessage("云端模式读不到你的本机目录，请在本机运行时再扫。");
      return;
    }

    if (!directoryPath.trim()) {
      setErrorMessage("先填写要扫描的目录，例如 E:\\codeX项目。");
      return;
    }

    setIsBusy(true);
    setStatusText("正在扫描目录…");

    try {
      const response = await fetch("/api/code-scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: directoryPath.trim() }),
      });
      const body = (await response.json().catch(() => null)) as
        | { files?: CodeFileInfo[]; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "扫描目录失败。");
      }

      const files = body?.files ?? [];
      const drafts = buildCodeModuleDrafts(files, {
        sourceLabel: directoryPath.trim(),
      });

      if (drafts.length === 0) {
        setCandidates([]);
        setExcludedIds([]);
        setStatusText(null);
        setErrorMessage("这个目录里没有扫到可分析的源码文件。");
        return;
      }

      applyCandidates(
        markImportCandidates(drafts, nodes),
        `扫描到 ${files.length} 个源码文件`,
      );
    } catch (error) {
      setCandidates([]);
      setExcludedIds([]);
      setStatusText(null);
      setErrorMessage(readErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleConfirm() {
    if (source === "documents") {
      const selectedDocuments = documentDrafts.filter(
        (draft) => !excludedDocumentNames.includes(draft.fileName),
      );

      if (selectedDocuments.length === 0) {
        setErrorMessage("至少勾选一份文档再导入。");
        return;
      }

      setIsBusy(true);
      setErrorMessage(null);
      setStatusText("正在创建文档资产…");

      try {
        const assets = materializeDocumentAssets({
          drafts: selectedDocuments,
          projectId,
          documentType,
          batchId,
          now: new Date().toISOString(),
        });
        let created = 0;

        for (const asset of assets) {
          try {
            await onCreateAsset({
              asset,
              versionId: asset.currentVersionId,
              changeReason: "导入项目文档",
              versionReason: "initial",
            });
            created += 1;
          } catch (error) {
            throw new Error(
              `已经创建 ${created} 份文档，第 ${created + 1} 份失败：${readErrorMessage(error)}`,
            );
          }
        }

        await onImported(created);
        onClose();
      } catch (error) {
        setErrorMessage(readErrorMessage(error));
        setStatusText(null);
      } finally {
        setIsBusy(false);
      }

      return;
    }

    if (selected.length === 0) {
      setErrorMessage("至少勾选一条节点再导入。");
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);
    setStatusText("正在创建节点…");

    try {
      const assets = materializeImportAssets({
        candidates: selected,
        existingNodes: nodes,
        projectId,
        batchId,
        now: new Date().toISOString(),
      });
      let created = 0;

      for (const asset of assets) {
        try {
          await onCreateAsset({
            asset,
            versionId: asset.currentVersionId,
            changeReason: "导入工程",
            versionReason: "initial",
          });
          created += 1;
        } catch (error) {
          throw new Error(
            `已经创建 ${created} 个节点，第 ${created + 1} 个失败：${readErrorMessage(error)}`,
          );
        }
      }

      await onImported(created);
      onClose();
    } catch (error) {
      setErrorMessage(readErrorMessage(error));
      setStatusText(null);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    // 外层固定覆盖层不能省：只写内层 absolute 会相对页面原点定位，页面一滚动浮层就跑到可视区外
    <div className="fixed inset-0 z-50">
      <button
        aria-label="关闭导入工程"
        className="absolute inset-0 cursor-default bg-slate-950/35 backdrop-blur-[2px]"
        onClick={isBusy ? undefined : onClose}
        type="button"
      />
      <aside
        aria-labelledby="engineering-import-title"
        aria-modal="true"
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl sm:max-w-3xl"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <FolderTree aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">导入工程</p>
              <h2
                className="mt-1 break-words text-lg font-semibold text-slate-950"
                id="engineering-import-title"
              >
                {projectName}
              </h2>
            </div>
          </div>

          <button
            aria-label="关闭导入工程"
            className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"
            disabled={isBusy}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3 sm:px-6">
          {(
            [
              { key: "schema", label: "数据库 Schema", icon: Database },
              { key: "code", label: "代码目录", icon: FolderTree },
              { key: "documents", label: "项目文档", icon: FileText },
            ] as const
          ).map((tab) => (
            <button
              aria-pressed={source === tab.key}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                source === tab.key
                  ? "bg-teal-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              key={tab.key}
              onClick={() => {
                setSource(tab.key);
                resetPreview();
              }}
              type="button"
            >
              <tab.icon aria-hidden="true" className="size-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {source === "schema" ? (
            // 两个来源各用自己的 key：不加 key 时 React 会把「选择文件」那个 input
            // 复用成路径输入框，触发受控/非受控告警。
            <section key="schema">
              <p className="text-sm text-slate-600">
                粘贴建表语句，或选一个 `.sql` 文件。只读 `CREATE TABLE`，
                不改你的数据库，也不调用 AI。
              </p>
              <textarea
                className="mt-3 h-44 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs leading-5 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                onChange={(event) => {
                  setSqlText(event.target.value);
                  setSqlFileName("");
                  resetPreview();
                }}
                placeholder={"create table public.assets (\n  id text primary key,\n  project_id text references public.projects(id)\n);"}
                value={sqlText}
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  accept=".sql,text/plain"
                  aria-label="选择 SQL 文件"
                  className="hidden"
                  onChange={(event) => {
                    void handleSqlFileChange(event.target.files?.[0] ?? null);
                    event.target.value = "";
                  }}
                  ref={sqlFileInputRef}
                  type="file"
                />
                <button
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  onClick={() => sqlFileInputRef.current?.click()}
                  type="button"
                >
                  选择 SQL 文件
                </button>
                <button
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isBusy}
                  onClick={handleParseSchema}
                  type="button"
                >
                  解析成节点草稿
                </button>
                {sqlFileName && (
                  <span className="text-xs text-slate-500">
                    来源：{sqlFileName}
                  </span>
                )}
              </div>
            </section>
          ) : (
            <section key="code">
              <p className="text-sm text-slate-600">
                填本机代码目录的绝对路径，扫出「模块」和「接口」节点草稿。
                依赖目录、构建产物和点目录会跳过，只读文件、不写文件。
              </p>
              {dataMode !== "local" && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  云端模式读不到你的本机目录，这一栏要跑在本机时才能用。
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  className={inputClassName}
                  disabled={dataMode !== "local" || isBusy}
                  onChange={(event) => {
                    setDirectoryPath(event.target.value);
                    resetPreview();
                  }}
                  placeholder="E:\\codeX项目"
                  value={directoryPath}
                />
                <button
                  className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={dataMode !== "local" || isBusy}
                  onClick={() => void handleScanDirectory()}
                  type="button"
                >
                  扫描目录
                </button>
              </div>
            </section>
          )}

          {source === "documents" && (
            <section key="documents">
              <p className="text-sm leading-6 text-slate-600">
                选一批已经写好的 Markdown 或纯文本（项目过程中的需求、设计、验收、接口说明都行），
                <strong className="font-semibold">原样</strong>建成文档资产：标题取文件名，正文就是原文，
                不经过 AI。同名文档默认不导入，避免盖掉项目里改过的那份。
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  accept=".md,.markdown,.txt,text/markdown,text/plain"
                  className="hidden"
                  multiple
                  onChange={(event) => {
                    void handleDocumentFiles(event.target.files);
                    event.target.value = "";
                  }}
                  ref={documentFileInputRef}
                  type="file"
                />
                <button
                  className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isBusy}
                  onClick={() => documentFileInputRef.current?.click()}
                  type="button"
                >
                  <FileText aria-hidden="true" className="size-4" />
                  选择 Markdown 文件
                </button>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  按哪个文档类型入库
                  <select
                    aria-label="选择文档类型"
                    className="h-11 rounded-lg border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-900 outline-none"
                    onChange={(event) => setDocumentType(event.target.value)}
                    value={documentType}
                  >
                    {documentTypeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                单份不超过 {Math.round(DOCUMENT_IMPORT_LIMITS.bytesPerFile / 1024 / 1024)} MB，
                一次最多 {DOCUMENT_IMPORT_LIMITS.filesPerBatch} 份。
              </p>
            </section>
          )}

          {statusText && (
            <p className="mt-4 inline-flex items-center gap-2 text-sm text-slate-600">
              {isBusy && (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 animate-spin text-teal-600"
                />
              )}
              {statusText}
            </p>
          )}

          {errorMessage && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {errorMessage}
            </p>
          )}

          {candidates.length > 0 && (
            <section className="mt-5">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-semibold text-slate-700">
                  节点草稿（已选 {selected.length}／{candidates.length}）
                </h3>
                {duplicateCount > 0 && (
                  <span className="text-xs text-slate-500">
                    {duplicateCount} 条编号已存在，默认跳过
                  </span>
                )}
                <button
                  className="ml-auto text-xs font-semibold text-teal-700 hover:underline"
                  onClick={() =>
                    setExcludedIds(
                      selected.length === candidates.length
                        ? candidates.map((candidate) => candidate.id)
                        : [],
                    )
                  }
                  type="button"
                >
                  {selected.length === candidates.length ? "全不选" : "全选"}
                </button>
              </div>

              <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {candidates.map((candidate) => {
                  const isExcluded = excludedIds.includes(candidate.id);

                  return (
                    <li
                      className="flex items-start gap-3 px-3 py-2.5"
                      key={candidate.id}
                    >
                      <input
                        aria-label={`导入 ${candidate.code}`}
                        checked={!isExcluded}
                        className="mt-1 size-4 shrink-0 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        id={`import-${candidate.id}`}
                        onChange={() =>
                          setExcludedIds((current) =>
                            isExcluded
                              ? current.filter((id) => id !== candidate.id)
                              : [...current, candidate.id],
                          )
                        }
                        type="checkbox"
                      />
                      <label
                        className="min-w-0 flex-1 cursor-pointer"
                        htmlFor={`import-${candidate.id}`}
                      >
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-teal-700">
                            {graphNodeTypeLabels[candidate.nodeType]}
                          </span>
                          <span className="font-mono text-xs text-slate-500">
                            {candidate.code}
                          </span>
                          <span className="truncate text-sm text-slate-900">
                            {candidate.title}
                          </span>
                          {candidate.existingAssetId && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                              已存在：{nodeTitleById.get(candidate.existingAssetId)}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {candidate.summary}
                          {candidate.parentCode
                            ? ` · 父节点 ${candidate.parentCode}`
                            : ""}
                          {candidate.relations.length > 0
                            ? ` · 依赖 ${candidate.relations
                                .map((relation) => relation.targetCode)
                                .join("、")}`
                            : ""}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {documentDrafts.length > 0 && source === "documents" && (
            <section className="mt-5">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-semibold text-slate-700">
                  文档草稿（已选{" "}
                  {documentDrafts.length - excludedDocumentNames.length}／
                  {documentDrafts.length}）
                </h3>
                <button
                  className="ml-auto text-xs font-semibold text-teal-700 hover:underline"
                  onClick={() =>
                    setExcludedDocumentNames(
                      excludedDocumentNames.length === 0
                        ? documentDrafts.map((draft) => draft.fileName)
                        : [],
                    )
                  }
                  type="button"
                >
                  {excludedDocumentNames.length === 0 ? "全不选" : "全选"}
                </button>
              </div>

              <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {documentDrafts.map((draft) => {
                  const isExcluded = excludedDocumentNames.includes(
                    draft.fileName,
                  );

                  return (
                    <li className="flex items-start gap-3 px-3 py-2" key={draft.fileName}>
                      <input
                        checked={!isExcluded}
                        className="mt-1 size-4 shrink-0 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        disabled={draft.tooLarge}
                        id={`import-doc-${draft.fileName}`}
                        onChange={() =>
                          setExcludedDocumentNames((current) =>
                            isExcluded
                              ? current.filter((name) => name !== draft.fileName)
                              : [...current, draft.fileName],
                          )
                        }
                        type="checkbox"
                      />
                      <label
                        className="min-w-0 flex-1 cursor-pointer"
                        htmlFor={`import-doc-${draft.fileName}`}
                      >
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-teal-700">
                            {documentType}
                          </span>
                          <span className="truncate text-sm text-slate-900">
                            {draft.title}
                          </span>
                          {draft.existingAssetId && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                              项目里已有同名文档，默认不导入
                            </span>
                          )}
                          {draft.tooLarge && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">
                              超过单份上限，不能导入
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {draft.fileName} · {Math.max(1, Math.round(draft.byteSize / 1024))} KB
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-4 sm:px-6">
          <button
            className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            disabled={isBusy}
            onClick={onClose}
            type="button"
          >
            取消
          </button>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-teal-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={
              isBusy ||
              (source === "documents"
                ? documentDrafts.length - excludedDocumentNames.length === 0
                : selected.length === 0)
            }
            onClick={() => void handleConfirm()}
            type="button"
          >
            {isBusy && (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            )}
            {source === "documents"
              ? `导入选中的 ${
                  documentDrafts.length - excludedDocumentNames.length
                } 份文档`
              : `导入选中的 ${selected.length} 个节点`}
          </button>
        </footer>
      </aside>
    </div>
  );
}
