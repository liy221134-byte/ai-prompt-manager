"use client";

import {
  BookOpenText,
  CheckCircle2,
  DatabaseBackup,
  GitMerge,
  Layers3,
  ListChecks,
  LogOut,
  LoaderCircle,
  Plus,
  RefreshCcw,
  Search,
  Target,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { AiCaptureDrawer } from "@/components/ai-capture-drawer";
import { AiMergeDrawer } from "@/components/ai-merge-drawer";
import { BackupManagerDialog } from "@/components/backup-manager-dialog";
import { MigrationDialog } from "@/components/migration-dialog";
import { PromptCard } from "@/components/prompt-card";
import { PromptDetailDrawer } from "@/components/prompt-detail-drawer";
import { PromptEditorDrawer } from "@/components/prompt-editor-drawer";
import { PromptTrashDialog } from "@/components/prompt-trash-dialog";
import {
  type PromptCardData,
  type PromptDraft,
  type PromptVersionData,
} from "@/data/prompts";
import {
  loadLastBackupAt,
  loadStoredPromptLibrary,
  saveLastBackupAt,
  savePromptLibrary,
} from "@/lib/prompt-storage";
import { downloadPromptBackup } from "@/lib/backup-download";
import { buildPromptSearchText } from "@/lib/prompt-utils";
import {
  createPromptImportPlan,
  PROMPT_BACKUP_TYPE,
  PROMPT_BACKUP_VERSION,
  type PromptImportPlan,
} from "@/lib/prompt-backup";
import type { PromptLibraryResponse } from "@/lib/prompt-api";
import {
  createSupabasePromptDataSource,
  localPromptDataSource,
  type PromptDataSource,
} from "@/lib/prompt-source";
import {
  canStartMerge,
  createEmptySelection,
  MAX_MERGE_PROMPTS,
  setMergeTarget,
  togglePromptSelection,
  type PromptMergeSelection,
} from "@/lib/prompt-merge-selection";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type EditorState =
  | {
      mode: "create";
      initialDraft?: PromptDraft;
    }
  | {
      mode: "edit";
      promptId: string;
    };

type PromptLibraryProps = {
  dataMode: "local" | "supabase";
  onSignOut?: () => Promise<void>;
  userEmail?: string | null;
};

function createPromptId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `prompt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function reconcileMergeSelection(
  selection: PromptMergeSelection,
  prompts: PromptCardData[],
): PromptMergeSelection {
  const activePromptIds = new Set(prompts.map((prompt) => prompt.id));
  const selectedPromptIds = selection.selectedPromptIds.filter((id) =>
    activePromptIds.has(id),
  );
  const targetPromptId = selectedPromptIds.includes(
    selection.targetPromptId ?? "",
  )
    ? selection.targetPromptId
    : (selectedPromptIds[0] ?? null);

  return {
    selectedPromptIds,
    targetPromptId,
  };
}

export function PromptLibrary({
  dataMode,
  onSignOut,
  userEmail,
}: PromptLibraryProps) {
  const dataSource = useMemo<PromptDataSource>(() => {
    if (dataMode === "supabase") {
      return createSupabasePromptDataSource(getSupabaseBrowserClient());
    }

    return localPromptDataSource;
  }, [dataMode]);
  const serviceName =
    dataMode === "supabase" ? "云端数据服务" : "本机数据服务";
  const [prompts, setPrompts] = useState<PromptCardData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [migrationPrompts, setMigrationPrompts] = useState<
    PromptCardData[] | null
  >(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [deletePromptId, setDeletePromptId] = useState<string | null>(null);
  const [isAiCaptureOpen, setIsAiCaptureOpen] = useState(false);
  const [isBackupManagerOpen, setIsBackupManagerOpen] = useState(false);
  const [isAiMergeOpen, setIsAiMergeOpen] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [trashPrompts, setTrashPrompts] = useState<PromptCardData[]>([]);
  const [recoveryRecords, setRecoveryRecords] = useState<
    PromptVersionData[]
  >([]);
  const [isTrashLoading, setIsTrashLoading] = useState(false);
  const [trashError, setTrashError] = useState<string | null>(null);
  const [isMergeSelectionMode, setIsMergeSelectionMode] = useState(false);
  const [mergeSelection, setMergeSelection] =
    useState<PromptMergeSelection>(createEmptySelection);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const notify = useCallback((message: string) => {
    setToastMessage(message);

    if (toastTimer.current) {
      window.clearTimeout(toastTimer.current);
    }

    toastTimer.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  }, []);

  const cachePrompts = useCallback(
    (nextPrompts: PromptCardData[]) => {
      try {
        savePromptLibrary(nextPrompts);
      } catch {
        notify("数据已保存，但浏览器缓存更新失败");
      }
    },
    [notify],
  );

  const loadFromServer = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const library = await dataSource.fetchLibrary();
      let storedPrompts: PromptCardData[] | null = null;
      let nextMigrationPrompts: PromptCardData[] | null = null;

      try {
        storedPrompts = loadStoredPromptLibrary();
      } catch {
        notify("本机旧数据无法读取，已使用共享数据库");
      }

      if (storedPrompts) {
        const localChanges = createPromptImportPlan(library.prompts, {
          type: PROMPT_BACKUP_TYPE,
          version: PROMPT_BACKUP_VERSION,
          exportedAt: new Date().toISOString(),
          prompts: storedPrompts,
        });

        if (localChanges.addCount + localChanges.updateCount > 0) {
          nextMigrationPrompts = storedPrompts;
        }
      }

      setPrompts(library.prompts);
      setMigrationPrompts(nextMigrationPrompts);

      try {
        setLastBackupAt(loadLastBackupAt());
      } catch {
        setLastBackupAt(null);
      }

      if (!nextMigrationPrompts) {
        cachePrompts(library.prompts);
      }
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : `${serviceName}连接失败。`,
      );
    } finally {
      setIsLoading(false);
    }
  }, [cachePrompts, dataSource, notify, serviceName]);

  const fetchTrashData = useCallback(async () => {
    const [trashLibrary, recoveryResponse] = await Promise.all([
      dataSource.fetchTrash(),
      dataSource.fetchMergeRecoveryRecords(),
    ]);

    return {
      prompts: trashLibrary.prompts,
      records: recoveryResponse.records,
    };
  }, [dataSource]);

  const loadTrash = useCallback(
    async (showLoading = true) => {
      if (showLoading) {
        setIsTrashLoading(true);
      }

      setTrashError(null);

      try {
        const trashData = await fetchTrashData();

        setTrashPrompts(trashData.prompts);
        setRecoveryRecords(trashData.records);
      } catch (error) {
        setTrashError(
          error instanceof Error
            ? error.message
            : `${serviceName}垃圾箱读取失败。`,
        );
      } finally {
        if (showLoading) {
          setIsTrashLoading(false);
        }
      }
    },
    [fetchTrashData, serviceName],
  );

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadFromServer();
    }, 0);

    return () => {
      window.clearTimeout(loadTimer);
    };
  }, [loadFromServer]);

  useEffect(
    () => () => {
      if (toastTimer.current) {
        window.clearTimeout(toastTimer.current);
      }
    },
    [],
  );

  const filteredPrompts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();

    if (!normalizedQuery) {
      return prompts;
    }

    return prompts.filter((prompt) =>
      buildPromptSearchText(prompt).includes(normalizedQuery),
    );
  }, [prompts, searchQuery]);

  const selectedPrompt = prompts.find(
    (prompt) => prompt.id === selectedPromptId,
  );
  const effectiveMergeSelection = useMemo(
    () => reconcileMergeSelection(mergeSelection, prompts),
    [mergeSelection, prompts],
  );
  const mergeTargetPrompt = effectiveMergeSelection.targetPromptId
    ? prompts.find(
        (prompt) => prompt.id === effectiveMergeSelection.targetPromptId,
      )
    : undefined;
  const mergeSelectionCount = effectiveMergeSelection.selectedPromptIds.length;
  const mergeCanStart = canStartMerge(effectiveMergeSelection);
  const selectedMergePromptIds = useMemo(
    () => new Set(effectiveMergeSelection.selectedPromptIds),
    [effectiveMergeSelection.selectedPromptIds],
  );
  const mergeSelectedPrompts = useMemo(
    () =>
      effectiveMergeSelection.selectedPromptIds
        .map((promptId) =>
          prompts.find((prompt) => prompt.id === promptId),
        )
        .filter((prompt): prompt is PromptCardData => Boolean(prompt)),
    [effectiveMergeSelection.selectedPromptIds, prompts],
  );
  const promptToDelete = prompts.find(
    (prompt) => prompt.id === deletePromptId,
  );
  const editingPrompt =
    editorState?.mode === "edit"
      ? prompts.find((prompt) => prompt.id === editorState.promptId)
      : undefined;

  async function handleSave(draft: PromptDraft) {
    const now = new Date().toISOString();

    if (editorState?.mode === "edit") {
      if (!editingPrompt) {
        throw new Error("没有找到要编辑的提示词。");
      }

      const library = await dataSource.updatePrompt({
        ...editingPrompt,
        ...draft,
        updatedAt: now,
      });

      setPrompts(library.prompts);
      cachePrompts(library.prompts);
      setEditorState(null);
      notify("提示词已更新");
      return;
    }

    const newPrompt: PromptCardData = {
      id: createPromptId(),
      ...draft,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      deletedReason: null,
      mergedIntoPromptId: null,
      mergeVersionId: null,
    };
    const library = await dataSource.createPrompt(newPrompt);

    setPrompts(library.prompts);
    cachePrompts(library.prompts);
    setEditorState(null);
    setSelectedPromptId(newPrompt.id);
    notify("提示词已保存");
  }

  async function handleDelete() {
    if (!promptToDelete) {
      return;
    }

    const library = await dataSource.deletePrompt(promptToDelete.id);

    setPrompts(library.prompts);
    cachePrompts(library.prompts);
    setDeletePromptId(null);

    if (selectedPromptId === promptToDelete.id) {
      setSelectedPromptId(null);
    }

    notify("提示词已移入垃圾箱");
  }

  function handleOpenTrash() {
    setIsTrashOpen(true);
    void loadTrash();
  }

  async function handleRestorePrompt(promptId: string) {
    const library = await dataSource.restorePrompt(promptId);

    setPrompts(library.prompts);
    cachePrompts(library.prompts);
    await loadTrash(false);
  }

  async function handlePermanentlyDeletePrompt(promptId: string) {
    const library = await dataSource.permanentlyDeletePrompt(promptId);

    setPrompts(library.prompts);
    cachePrompts(library.prompts);
    await loadTrash(false);
  }

  async function handleEmptyTrash() {
    const library = await dataSource.emptyTrash();

    setPrompts(library.prompts);
    cachePrompts(library.prompts);
    await loadTrash(false);
  }

  async function handleRestoreMergeRecord(versionId: string) {
    const library = await dataSource.restoreMergeRecord(versionId);

    setPrompts(library.prompts);
    cachePrompts(library.prompts);
    await loadTrash(false);
  }

  function handleEnterMergeSelection() {
    setMergeSelection(createEmptySelection());
    setIsMergeSelectionMode(true);
  }

  function handleExitMergeSelection() {
    setMergeSelection(createEmptySelection());
    setIsMergeSelectionMode(false);
  }

  function handleToggleMergeSelection(prompt: PromptCardData) {
    setMergeSelection((selection) =>
      togglePromptSelection(
        reconcileMergeSelection(selection, prompts),
        prompt.id,
      ),
    );
  }

  function handleSetMergeTarget(prompt: PromptCardData) {
    setMergeSelection((selection) =>
      setMergeTarget(reconcileMergeSelection(selection, prompts), prompt.id),
    );
  }

  function handleStartMerge() {
    const reconciledSelection = reconcileMergeSelection(
      mergeSelection,
      prompts,
    );

    setMergeSelection(reconciledSelection);

    if (!canStartMerge(reconciledSelection)) {
      notify(
        reconciledSelection.selectedPromptIds.length < 2
          ? "请至少选择 2 条有效提示词"
          : "请重新选择合并目标",
      );
      return;
    }

    setIsAiMergeOpen(true);
  }

  function handleAiMergeSaved(library: PromptLibraryResponse) {
    const targetId = effectiveMergeSelection.targetPromptId;

    setPrompts(library.prompts);
    cachePrompts(library.prompts);
    setMergeSelection(createEmptySelection());
    setIsMergeSelectionMode(false);
    setIsAiMergeOpen(false);

    if (targetId) {
      setSelectedPromptId(targetId);
    }

    notify("已合并，来源可在垃圾箱恢复");
  }

  function handleExport() {
    const exportedAt = downloadPromptBackup(prompts);

    saveLastBackupAt(exportedAt);
    setLastBackupAt(exportedAt);
    return exportedAt;
  }

  async function handleImport(plan: PromptImportPlan) {
    const result = await dataSource.mergePrompts(
      plan.backup.prompts,
    );

    setPrompts(result.prompts);
    cachePrompts(result.prompts);
    setIsBackupManagerOpen(false);

    const resultText = [
      result.addCount > 0 ? `新增 ${result.addCount} 条` : "",
      result.updateCount > 0 ? `更新 ${result.updateCount} 条` : "",
      result.skipCount > 0 ? `跳过 ${result.skipCount} 条` : "",
    ]
      .filter(Boolean)
      .join("，");

    notify(
      resultText
        ? `导入完成：${resultText}`
        : "导入完成：没有需要变更的内容",
    );
  }

  async function handleMergeLocalPrompts() {
    if (!migrationPrompts) {
      return;
    }

    const result = await dataSource.mergePrompts(migrationPrompts);

    setPrompts(result.prompts);
    cachePrompts(result.prompts);
    setMigrationPrompts(null);

    const resultText = [
      result.addCount > 0 ? `新增 ${result.addCount} 条` : "",
      result.updateCount > 0 ? `更新 ${result.updateCount} 条` : "",
      result.skipCount > 0 ? `跳过 ${result.skipCount} 条` : "",
    ]
      .filter(Boolean)
      .join("，");

    notify(resultText ? `本机数据已合并：${resultText}` : "本机数据已经同步");
  }

  const hasSearchQuery = Boolean(searchQuery.trim());

  return (
    <main className="min-h-screen">
      <header className="border-b border-[#dbe7f5] bg-white/85">
        <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
              <BookOpenText aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                提示词资产库
              </p>
              <p className="text-xs text-slate-500">
                {dataMode === "supabase" ? "云端共享数据" : "本机共享数据"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-[#dbe7f5] bg-white px-3 py-2 text-sm text-slate-600">
              {isLoading ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 animate-spin text-blue-600"
                />
              ) : (
                <Layers3
                  aria-hidden="true"
                  className="size-4 text-blue-600"
                />
              )}
              <span>
                {isLoading ? "正在连接" : `${prompts.length} 条提示词`}
              </span>
            </div>

            {onSignOut && (
              <button
                aria-label="退出登录"
                className="flex size-10 items-center justify-center rounded-lg border border-[#dbe7f5] bg-white text-slate-500 transition-colors hover:border-blue-300 hover:text-blue-700"
                onClick={() => void onSignOut()}
                title={
                  userEmail ? `退出 ${userEmail}` : "退出登录"
                }
                type="button"
              >
                <LogOut aria-hidden="true" className="size-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-[1280px] px-5 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold text-blue-700">
            个人 AI 提示词资产库
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-normal text-slate-950 sm:text-5xl">
            AI 编程提示词卡片
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">
            积累每一个好用的提示词
          </p>
        </div>

        <div className="mt-9 flex flex-col gap-3 lg:flex-row">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">搜索提示词</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            />
            <input
              className="h-11 w-full rounded-lg border border-[#dbe7f5] bg-white pl-10 pr-10 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              disabled={isLoading || Boolean(loadError)}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索标题、分类、标签或正文"
              value={searchQuery}
            />
            {hasSearchQuery && (
              <button
                aria-label="清空搜索"
                className="absolute right-2.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setSearchQuery("")}
                type="button"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            )}
          </label>

          {isMergeSelectionMode ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:shrink-0">
              <div className="flex h-11 items-center gap-2 rounded-lg border border-[#dbe7f5] bg-white px-4 text-sm font-medium text-slate-700">
                <ListChecks aria-hidden="true" className="size-4 text-blue-600" />
                <span>已选 {mergeSelectionCount} 条</span>
              </div>
              <div className="flex h-11 min-w-0 items-center gap-2 rounded-lg border border-[#dbe7f5] bg-white px-4 text-sm font-medium text-slate-700">
                <Target aria-hidden="true" className="size-4 shrink-0 text-blue-600" />
                <span className="max-w-56 truncate">
                  目标：
                  {mergeTargetPrompt ? mergeTargetPrompt.title : "未选择"}
                </span>
              </div>
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={!mergeCanStart}
                onClick={handleStartMerge}
                type="button"
              >
                <GitMerge aria-hidden="true" className="size-4" />
                开始合并
              </button>
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#dbe7f5] bg-white px-5 text-sm font-semibold text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-700"
                onClick={handleExitMergeSelection}
                type="button"
              >
                <X aria-hidden="true" className="size-4" />
                退出选择
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-5 text-sm font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isLoading || Boolean(loadError)}
                onClick={handleEnterMergeSelection}
                type="button"
              >
                <GitMerge aria-hidden="true" className="size-4" />
                AI 合并
              </button>
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-5 text-sm font-semibold text-violet-700 transition-colors hover:border-violet-300 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isLoading || Boolean(loadError)}
                onClick={() => setIsAiCaptureOpen(true)}
                type="button"
              >
                <WandSparkles aria-hidden="true" className="size-4" />
                智能采集
              </button>
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#dbe7f5] bg-white px-5 text-sm font-semibold text-slate-700 transition-colors hover:border-red-300 hover:text-red-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                disabled={isLoading || Boolean(loadError)}
                onClick={handleOpenTrash}
                type="button"
              >
                <Trash2 aria-hidden="true" className="size-4" />
                垃圾箱
              </button>
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#dbe7f5] bg-white px-5 text-sm font-semibold text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                disabled={isLoading || Boolean(loadError)}
                onClick={() => setIsBackupManagerOpen(true)}
                type="button"
              >
                <DatabaseBackup aria-hidden="true" className="size-4" />
                数据管理
              </button>
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={isLoading || Boolean(loadError)}
                onClick={() => setEditorState({ mode: "create" })}
                type="button"
              >
                <Plus aria-hidden="true" className="size-4" />
                新增提示词
              </button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div
            aria-label="正在加载提示词"
            className="mt-8 grid items-start gap-6 md:grid-cols-2 lg:grid-cols-3"
          >
            {[0, 1, 2].map((item) => (
              <div
                className="h-96 animate-pulse rounded-lg border border-[#dbe7f5] bg-white"
                key={item}
              />
            ))}
          </div>
        ) : loadError ? (
          <div className="mt-8 flex min-h-72 flex-col items-center justify-center rounded-lg border border-red-200 bg-white px-6 text-center">
            <span className="flex size-12 items-center justify-center rounded-lg bg-red-50 text-red-700">
              <RefreshCcw aria-hidden="true" className="size-5" />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-slate-900">
              {serviceName}连接失败
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">
              {loadError}
            </p>
            <button
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              onClick={() => void loadFromServer()}
              type="button"
            >
              <RefreshCcw aria-hidden="true" className="size-4" />
              重新连接
            </button>
          </div>
        ) : filteredPrompts.length > 0 ? (
          <div className="mt-8 grid items-start gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredPrompts.map((prompt, index) => (
              <PromptCard
                canSelect={
                  selectedMergePromptIds.has(prompt.id) ||
                  mergeSelectionCount < MAX_MERGE_PROMPTS
                }
                index={index}
                isMergeTarget={
                  effectiveMergeSelection.targetPromptId === prompt.id
                }
                key={prompt.id}
                onOpen={(selected) => setSelectedPromptId(selected.id)}
                onSetMergeTarget={handleSetMergeTarget}
                onToggleSelection={handleToggleMergeSelection}
                prompt={prompt}
                selected={selectedMergePromptIds.has(prompt.id)}
                selectionMode={isMergeSelectionMode}
              />
            ))}
          </div>
        ) : (
          <div className="mt-8 flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-blue-200 bg-white/70 px-6 text-center">
            <span className="flex size-12 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              {hasSearchQuery ? (
                <Search aria-hidden="true" className="size-5" />
              ) : (
                <BookOpenText aria-hidden="true" className="size-5" />
              )}
            </span>
            <h2 className="mt-4 text-lg font-semibold text-slate-900">
              {hasSearchQuery ? "没有找到匹配的提示词" : "还没有提示词"}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {hasSearchQuery
                ? "换一个关键词，或清空搜索条件。"
                : "创建第一条可复用提示词。"}
            </p>
            <button
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              onClick={() => {
                if (hasSearchQuery) {
                  setSearchQuery("");
                } else {
                  setEditorState({ mode: "create" });
                }
              }}
              type="button"
            >
              {hasSearchQuery ? (
                <>
                  <X aria-hidden="true" className="size-4" />
                  清空搜索
                </>
              ) : (
                <>
                  <Plus aria-hidden="true" className="size-4" />
                  新增提示词
                </>
              )}
            </button>
          </div>
        )}
      </section>

      {selectedPrompt && (
        <PromptDetailDrawer
          key={selectedPrompt.id}
          onClose={() => {
            if (!editorState && !deletePromptId) {
              setSelectedPromptId(null);
            }
          }}
          onDelete={(prompt) => setDeletePromptId(prompt.id)}
          onEdit={(prompt) =>
            setEditorState({ mode: "edit", promptId: prompt.id })
          }
          onNotify={notify}
          prompt={selectedPrompt}
        />
      )}

      {isAiCaptureOpen && (
        <AiCaptureDrawer
          onClose={() => setIsAiCaptureOpen(false)}
          onRecognized={(draft) => {
            setIsAiCaptureOpen(false);
            setEditorState({ mode: "create", initialDraft: draft });
            notify("AI 识别完成，请确认后保存");
          }}
        />
      )}

      {isAiMergeOpen &&
        effectiveMergeSelection.targetPromptId &&
        mergeSelectedPrompts.length >= 2 && (
          <AiMergeDrawer
            dataSource={dataSource}
            onClose={() => setIsAiMergeOpen(false)}
            onNotify={notify}
            onSaved={handleAiMergeSaved}
            prompts={mergeSelectedPrompts}
            targetPromptId={effectiveMergeSelection.targetPromptId}
          />
        )}

      {editorState && (
        <PromptEditorDrawer
          key={
            editingPrompt?.id ??
            (editorState.mode === "create" && editorState.initialDraft
              ? "ai-draft"
              : "new-prompt")
          }
          initialDraft={
            editorState.mode === "create" ? editorState.initialDraft : undefined
          }
          mode={editorState.mode}
          onClose={() => setEditorState(null)}
          onSave={handleSave}
          prompt={editingPrompt}
        />
      )}

      {isBackupManagerOpen && (
        <BackupManagerDialog
          lastBackupAt={lastBackupAt}
          onClose={() => setIsBackupManagerOpen(false)}
          onExport={handleExport}
          onImport={handleImport}
          onNotify={notify}
          promptCount={prompts.length}
          prompts={prompts}
        />
      )}

      {isTrashOpen && (
        <PromptTrashDialog
          isLoading={isTrashLoading}
          loadError={trashError}
          onClose={() => setIsTrashOpen(false)}
          onEmptyTrash={handleEmptyTrash}
          onNotify={notify}
          onPermanentlyDeletePrompt={handlePermanentlyDeletePrompt}
          onRestoreMergeRecord={handleRestoreMergeRecord}
          onRestorePrompt={handleRestorePrompt}
          onRetry={() => void loadTrash()}
          prompts={trashPrompts}
          records={recoveryRecords}
        />
      )}

      {promptToDelete && (
        <DeleteConfirmDialog
          onCancel={() => setDeletePromptId(null)}
          onConfirm={handleDelete}
          prompt={promptToDelete}
        />
      )}

      {migrationPrompts && (
        <MigrationDialog
          localPromptCount={migrationPrompts.length}
          onDismiss={() => {
            setMigrationPrompts(null);
            notify("本机旧数据尚未合并");
          }}
          onMerge={handleMergeLocalPrompts}
          serverPromptCount={prompts.length}
        />
      )}

      {toastMessage && (
        <div
          aria-live="polite"
          className="fixed bottom-5 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-medium text-white shadow-xl"
          role="status"
        >
          <CheckCircle2 aria-hidden="true" className="size-4 text-emerald-400" />
          {toastMessage}
        </div>
      )}
    </main>
  );
}
