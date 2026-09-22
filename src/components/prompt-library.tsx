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
  PackageOpen,
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
import { AssetCard } from "@/components/asset-card";
import { AssetDetailDrawer } from "@/components/asset-detail-drawer";
import { AssetEditorDrawer } from "@/components/asset-editor-drawer";
import { AiMergeDrawer } from "@/components/ai-merge-drawer";
import { BackupManagerDialog } from "@/components/backup-manager-dialog";
import { SourcePackageImportDialog } from "@/components/source-package-import-dialog";
import {
  findProjectTechProfile,
  listAdrCandidates,
} from "@/lib/tech-profile";
import { MigrationDialog } from "@/components/migration-dialog";
import { PromptCard } from "@/components/prompt-card";
import { PromptDetailDrawer } from "@/components/prompt-detail-drawer";
import { PromptEditorDrawer } from "@/components/prompt-editor-drawer";
import { PromptOptimizeDrawer } from "@/components/prompt-optimize-drawer";
import { PromptTrashDialog } from "@/components/prompt-trash-dialog";
import {
  ProjectFormDialog,
  type ProjectFormValues,
} from "@/components/project-form-dialog";
import { ProjectSwitcher } from "@/components/project-switcher";
import type {
  AssetData,
  AssetStatus,
  AssetVersionData,
} from "@/data/assets";
import {
  DEFAULT_PROJECT_ID,
  archiveProject,
  createProjectData,
  createProjectId,
  isDefaultProject,
  projectStageLabels,
  projectStatusLabels,
  reactivateProject,
  resolveActiveProject,
  updateProjectDetails,
  type ProjectData,
} from "@/data/projects";
import {
  type PromptCardData,
  type PromptDraft,
  type PromptVersionData,
} from "@/data/prompts";
import {
  assetStatusFilterOptions,
  assetStatusLabels,
  assetTypeFilterLabels,
  assetTypeFilterOptions,
  buildAssetSearchText,
  filterProjectAssets,
  matchesAssetTypeFilter,
  type AssetTypeFilter,
} from "@/lib/asset-list";
import {
  assetToDraft,
  buildCreateAssetInput,
  buildUpdateAssetInput,
  createAssetId,
  isEditableAssetData,
  type AssetDraft,
  type EditableAssetData,
  type EditableAssetType,
} from "@/lib/asset-draft";
import {
  buildRestoreAssetInput,
  createAssetVersionId,
} from "@/lib/asset-versions";
import {
  loadLastBackupAt,
  loadStoredPromptLibrary,
  saveLastBackupAt,
  savePromptLibrary,
} from "@/lib/prompt-storage";
import { downloadPromptBackup } from "@/lib/backup-download";
import { buildPromptSearchText } from "@/lib/prompt-utils";
import {
  loadActiveProjectId,
  saveActiveProjectId,
} from "@/lib/project-storage";
import { ensureDefaultProject } from "@/lib/project-workspace";
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

type ProjectDialogState =
  | { mode: "create" }
  | { mode: "edit"; projectId: string };

type AssetEditorState =
  | { mode: "create"; assetType: EditableAssetType }
  | { mode: "edit"; assetId: string };

// 资产列表把提示词和统一资产合并成一个可按类型筛选的列表。
type ProjectListEntry =
  | { kind: "prompt"; prompt: PromptCardData }
  | { kind: "asset"; asset: AssetData };

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

function readEntryUpdatedAt(entry: ProjectListEntry) {
  return entry.kind === "prompt"
    ? entry.prompt.updatedAt
    : entry.asset.updatedAt;
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
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [assets, setAssets] = useState<AssetData[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [assetTypeFilter, setAssetTypeFilter] =
    useState<AssetTypeFilter>("prompt");
  const [assetStatusFilter, setAssetStatusFilter] =
    useState<AssetStatus>("active");
  const [assetDetailId, setAssetDetailId] = useState<string | null>(null);
  const [assetEditorState, setAssetEditorState] =
    useState<AssetEditorState | null>(null);
  const [projectDialog, setProjectDialog] =
    useState<ProjectDialogState | null>(null);
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
  const [isSourcePackageImportOpen, setIsSourcePackageImportOpen] =
    useState(false);
  const [isAiMergeOpen, setIsAiMergeOpen] = useState(false);
  const [optimizePromptId, setOptimizePromptId] = useState<string | null>(null);
  // 记录优化记录属于哪条提示词，避免切换详情时显示上一条的回退入口。
  const [optimizeVersionState, setOptimizeVersionState] = useState<{
    promptId: string;
    version: PromptVersionData | null;
  } | null>(null);
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
      const [library, projectList, assetList] = await Promise.all([
        dataSource.fetchLibrary(),
        ensureDefaultProject(dataSource),
        dataSource.fetchAssets(),
      ]);
      let storedPrompts: PromptCardData[] | null = null;
      let nextMigrationPrompts: PromptCardData[] | null = null;
      let storedProjectId: string | null = null;

      try {
        storedProjectId = loadActiveProjectId();
      } catch {
        storedProjectId = null;
      }

      const nextActiveProject = resolveActiveProject(
        projectList,
        storedProjectId,
      );

      setProjects(projectList);
      setAssets(assetList);
      setActiveProjectId(nextActiveProject?.id ?? null);

      if (nextActiveProject) {
        try {
          saveActiveProjectId(nextActiveProject.id);
        } catch {
          notify("项目选择没有保存到本机");
        }
      }

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
        return true;
      } catch (error) {
        setTrashError(
          error instanceof Error
            ? error.message
            : `${serviceName}垃圾箱读取失败。`,
        );
        return false;
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

  // 打开详情时查一下这条提示词有没有可以回退的优化记录。
  useEffect(() => {
    if (!selectedPromptId) {
      return;
    }

    let cancelled = false;

    dataSource
      .fetchOptimizeVersion(selectedPromptId)
      .then((response) => {
        if (!cancelled) {
          setOptimizeVersionState({
            promptId: selectedPromptId,
            version: response.version,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOptimizeVersionState({
            promptId: selectedPromptId,
            version: null,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dataSource, selectedPromptId]);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects],
  );
  const isDefaultProjectSelected = activeProject
    ? isDefaultProject(activeProject)
    : false;
  // 2.0.0 过渡规则：提示词仍由现有提示词数据源提供，并且都属于默认项目。
  // 统一资产表当前承载规则、文档等新类型，写入路径切换后这里会统一。
  const projectPrompts = useMemo(
    () =>
      isDefaultProjectSelected && assetStatusFilter === "active"
        ? prompts
        : [],
    [assetStatusFilter, isDefaultProjectSelected, prompts],
  );
  const projectAssetEntries = useMemo(() => {
    if (!activeProjectId) {
      return [];
    }

    const visibleAssets = filterProjectAssets(assets, {
      projectId: activeProjectId,
      status: assetStatusFilter,
    });

    return isDefaultProjectSelected
      ? visibleAssets.filter((asset) => asset.assetType !== "prompt")
      : visibleAssets;
  }, [activeProjectId, assets, assetStatusFilter, isDefaultProjectSelected]);
  const assetTypeCounts = useMemo<Record<AssetTypeFilter, number>>(
    () => ({
      all: projectPrompts.length + projectAssetEntries.length,
      prompt: projectPrompts.length,
      rule: projectAssetEntries.filter((asset) => asset.assetType === "rule")
        .length,
      document: projectAssetEntries.filter(
        (asset) => asset.assetType === "document",
      ).length,
      tech_profile: projectAssetEntries.filter(
        (asset) => asset.assetType === "tech_profile",
      ).length,
    }),
    [projectAssetEntries, projectPrompts],
  );

  // 技术档案偏离默认选型时要挂 ADR，这里备好当前项目能选的 ADR 文档
  const adrOptions = useMemo(
    () =>
      listAdrCandidates(assets, activeProjectId ?? "").map((asset) => ({
        id: asset.id,
        title: asset.title,
      })),
    [activeProjectId, assets],
  );
  // 一个项目一份技术档案：已有就直接编辑，没有就新建
  const projectTechProfile = useMemo(
    () =>
      activeProjectId ? findProjectTechProfile(assets, activeProjectId) : null,
    [activeProjectId, assets],
  );
  // 关系目标：同项目、没进垃圾箱、不含正在编辑的这条
  const relationTargetOptions = useMemo(
    () =>
      assets
        .filter(
          (item) =>
            item.projectId === activeProjectId &&
            !item.deletedAt &&
            item.id !==
              (assetEditorState?.mode === "edit"
                ? assetEditorState.assetId
                : ""),
        )
        .map((item) => ({ id: item.id, title: item.title })),
    [activeProjectId, assetEditorState, assets],
  );
  const listEntries = useMemo<ProjectListEntry[]>(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    const entries: ProjectListEntry[] = [];

    if (assetTypeFilter === "all" || assetTypeFilter === "prompt") {
      for (const prompt of projectPrompts) {
        if (
          normalizedQuery &&
          !buildPromptSearchText(prompt).includes(normalizedQuery)
        ) {
          continue;
        }

        entries.push({ kind: "prompt", prompt });
      }
    }

    for (const asset of projectAssetEntries) {
      if (!matchesAssetTypeFilter(asset, assetTypeFilter)) {
        continue;
      }

      if (
        normalizedQuery &&
        !buildAssetSearchText(asset).includes(normalizedQuery)
      ) {
        continue;
      }

      entries.push({ kind: "asset", asset });
    }

    return entries.sort(
      (left, right) =>
        new Date(readEntryUpdatedAt(right)).getTime() -
        new Date(readEntryUpdatedAt(left)).getTime(),
    );
  }, [assetTypeFilter, projectAssetEntries, projectPrompts, searchQuery]);
  const trashedPromptIds = useMemo(
    () => new Set(trashPrompts.map((prompt) => prompt.id)),
    [trashPrompts],
  );
  // 备份目前只覆盖提示词，这里算出还有多少规则和文档不会进备份文件。
  const otherAssetCount = useMemo(
    () =>
      assets.filter(
        (asset) =>
          (asset.assetType === "rule" || asset.assetType === "document") &&
          asset.deletedAt === null,
      ).length,
    [assets],
  );

  const selectedPrompt = projectPrompts.find(
    (prompt) => prompt.id === selectedPromptId,
  );
  const optimizePrompt = projectPrompts.find(
    (prompt) => prompt.id === optimizePromptId,
  );
  const optimizeVersion =
    optimizeVersionState?.promptId === selectedPromptId
      ? optimizeVersionState.version
      : null;
  const effectiveMergeSelection = useMemo(
    () => reconcileMergeSelection(mergeSelection, projectPrompts),
    [mergeSelection, projectPrompts],
  );
  const mergeTargetPrompt = effectiveMergeSelection.targetPromptId
    ? projectPrompts.find(
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
          projectPrompts.find((prompt) => prompt.id === promptId),
        )
        .filter((prompt): prompt is PromptCardData => Boolean(prompt)),
    [effectiveMergeSelection.selectedPromptIds, projectPrompts],
  );
  const promptToDelete = projectPrompts.find(
    (prompt) => prompt.id === deletePromptId,
  );
  const editingPrompt =
    editorState?.mode === "edit"
      ? projectPrompts.find((prompt) => prompt.id === editorState.promptId)
      : undefined;
  const editingProject =
    projectDialog?.mode === "edit"
      ? (projects.find((project) => project.id === projectDialog.projectId) ??
        null)
      : null;
  const detailAsset = useMemo(() => {
    const match = assets.find((asset) => asset.id === assetDetailId);

    return match && isEditableAssetData(match) ? match : null;
  }, [assetDetailId, assets]);
  const editingAsset = useMemo(() => {
    if (assetEditorState?.mode !== "edit") {
      return null;
    }

    const match = assets.find(
      (asset) => asset.id === assetEditorState.assetId,
    );

    return match && isEditableAssetData(match) ? match : null;
  }, [assetEditorState, assets]);

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

  function handleSelectProject(projectId: string) {
    setActiveProjectId(projectId);
    setSelectedPromptId(null);
    setOptimizePromptId(null);
    setOptimizeVersionState(null);
    setIsMergeSelectionMode(false);
    setMergeSelection(createEmptySelection());

    // 提示词只属于默认项目：切到别的项目时还停在「提示词」标签会看到空列表，
    // 而规则和文档的计数又不是 0，容易误以为数据丢了，这里直接切回「全部」。
    const nextProject = projects.find((project) => project.id === projectId);

    if (
      nextProject &&
      !isDefaultProject(nextProject) &&
      assetTypeFilter === "prompt"
    ) {
      setAssetTypeFilter("all");
    }

    try {
      saveActiveProjectId(projectId);
    } catch {
      notify("项目选择没有保存到本机");
    }
  }

  // 备份导入、本机数据合并和垃圾箱恢复都会写回默认项目，完成后切过去让结果可见。
  function focusDefaultProject() {
    if (!isDefaultProjectSelected) {
      handleSelectProject(DEFAULT_PROJECT_ID);
    }
  }

  async function handleCreateProject(values: ProjectFormValues) {
    const project = createProjectData({
      id: createProjectId(),
      name: values.name,
      description: values.description,
      stage: values.stage,
    });
    const nextProjects = await dataSource.createProject(project);

    setProjects(nextProjects);
    setActiveProjectId(project.id);
    setProjectDialog(null);

    try {
      saveActiveProjectId(project.id);
    } catch {
      notify("项目选择没有保存到本机");
    }

    notify("项目已创建，还没有资产");
  }

  async function handleUpdateProject(values: ProjectFormValues) {
    if (!editingProject) {
      throw new Error("没有找到要设置的项目。");
    }

    const nextProjects = await dataSource.updateProject(
      updateProjectDetails(editingProject, values),
    );

    setProjects(nextProjects);
    setProjectDialog(null);
    notify("项目已更新");
  }

  async function handleArchiveProject() {
    if (!editingProject) {
      throw new Error("没有找到要归档的项目。");
    }

    const nextProjects = await dataSource.updateProject(
      archiveProject(editingProject),
    );

    setProjects(nextProjects);
    setProjectDialog(null);
    notify("项目已归档，资产仍然保留");
  }

  async function handleReactivateProject() {
    if (!editingProject) {
      throw new Error("没有找到要激活的项目。");
    }

    const nextProjects = await dataSource.updateProject(
      reactivateProject(editingProject),
    );

    setProjects(nextProjects);
    setProjectDialog(null);
    notify("项目已重新激活");
  }

  function handleChangeAssetTypeFilter(filter: AssetTypeFilter) {
    setAssetTypeFilter(filter);
    setIsMergeSelectionMode(false);
    setMergeSelection(createEmptySelection());
  }

  // 资产接口返回的是单个项目的列表，保存后重新拉全量，保证其他项目的数据不丢。
  async function reloadAssets() {
    setAssets(await dataSource.fetchAssets());
  }

  function readAssetTypeLabel(assetType: EditableAssetType) {
    return assetType === "rule" ? "规则" : "文档";
  }

  async function handleAssetSave(draft: AssetDraft) {
    const now = new Date().toISOString();
    const typeLabel = readAssetTypeLabel(draft.assetType);

    if (assetEditorState?.mode === "edit") {
      if (!editingAsset) {
        throw new Error(`没有找到要编辑的${typeLabel}。`);
      }

      await dataSource.updateAsset(
        buildUpdateAssetInput(editingAsset, draft, {
          versionId: createAssetVersionId(),
          now,
        }),
      );
      await reloadAssets();
      // 状态可能被改到当前筛选之外，跟着切过去，保存结果才看得见。
      setAssetStatusFilter(draft.status);
      setAssetEditorState(null);
      notify(`${typeLabel}已更新`);
      return;
    }

    if (!activeProjectId) {
      throw new Error("请先选择项目。");
    }

    const assetId = createAssetId(draft.assetType);

    await dataSource.createAsset(
      buildCreateAssetInput({
        id: assetId,
        projectId: activeProjectId,
        draft,
        now,
      }),
    );
    await reloadAssets();
    setAssetStatusFilter(draft.status);
    setAssetEditorState(null);
    setAssetDetailId(assetId);
    notify(`${typeLabel}已保存`);
  }

  async function handleAssetStatusChange(
    asset: EditableAssetData,
    status: AssetStatus,
  ) {
    const typeLabel = readAssetTypeLabel(asset.assetType);

    await dataSource.updateAsset(
      buildUpdateAssetInput(
        asset,
        { ...assetToDraft(asset), status },
        { versionId: createAssetVersionId(), now: new Date().toISOString() },
      ),
    );
    await reloadAssets();
    setAssetDetailId(null);
    notify(
      status === "archived"
        ? `${typeLabel}已归档，历史版本保留`
        : `${typeLabel}已重新激活`,
    );
  }

  async function handleAssetRestore(
    asset: EditableAssetData,
    version: AssetVersionData,
  ) {
    await dataSource.updateAsset(
      buildRestoreAssetInput(asset, version, {
        versionId: createAssetVersionId(),
        now: new Date().toISOString(),
      }),
    );
    await reloadAssets();
  }

  function handleOpenTrash() {
    setIsTrashOpen(true);
    void loadTrash();
  }

  async function handleOpenBackupManager() {
    const trashLoaded = await loadTrash(false);

    if (!trashLoaded) {
      notify("无法读取垃圾箱状态，请稍后重试。");
      return;
    }

    setIsBackupManagerOpen(true);
  }

  async function handleRestorePrompt(promptId: string) {
    const library = await dataSource.restorePrompt(promptId);

    setPrompts(library.prompts);
    cachePrompts(library.prompts);
    await loadTrash(false);
    focusDefaultProject();
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
    focusDefaultProject();
  }

  async function handlePermanentlyDeleteMergeRecord(versionId: string) {
    await dataSource.permanentlyDeleteMergeRecord(versionId);
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

  function refreshOptimizeVersion(promptId: string) {
    dataSource
      .fetchOptimizeVersion(promptId)
      .then((response) =>
        setOptimizeVersionState({ promptId, version: response.version }),
      )
      .catch(() => setOptimizeVersionState({ promptId, version: null }));
  }

  function handleOptimizeSaved(library: PromptLibraryResponse) {
    const promptId = optimizePromptId;

    setPrompts(library.prompts);
    cachePrompts(library.prompts);
    setOptimizePromptId(null);

    if (promptId) {
      setSelectedPromptId(promptId);
      refreshOptimizeVersion(promptId);
    }

    notify("优化结果已保存，可以回到优化前");
  }

  async function handleRestoreOptimize(prompt: PromptCardData) {
    try {
      const library = await dataSource.restoreAiOptimize(prompt.id);

      setPrompts(library.prompts);
      cachePrompts(library.prompts);
      setOptimizeVersionState(null);
      notify("已回到优化前");
    } catch (error) {
      notify(error instanceof Error ? error.message : "回到优化前失败");
    }
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
    focusDefaultProject();

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
    focusDefaultProject();

    const resultText = [
      result.addCount > 0 ? `新增 ${result.addCount} 条` : "",
      result.updateCount > 0 ? `更新 ${result.updateCount} 条` : "",
      result.skipCount > 0 ? `跳过 ${result.skipCount} 条` : "",
    ]
      .filter(Boolean)
      .join("，");

    notify(resultText ? `本机数据已合并：${resultText}` : "本机数据已经同步");
  }

  function createEmptyState() {
    if (hasSearchQuery) {
      return {
        title: "没有找到匹配的资产",
        description: "换一个关键词，或清空搜索条件。",
        actionLabel: "清空搜索",
        action: "clear-search" as const,
      };
    }

    if (assetStatusFilter !== "active") {
      return {
        title: `没有${assetStatusLabels[assetStatusFilter]}资产`,
        description: "换一个状态，或回到默认的活跃资产。",
        actionLabel: "回到活跃资产",
        action: "reset-status" as const,
      };
    }

    if (assetTypeFilter === "rule" || assetTypeFilter === "document") {
      const typeLabel = assetTypeFilter === "rule" ? "规则" : "文档";

      return {
        title: `还没有${typeLabel}`,
        description: `当前项目里没有${typeLabel}资产。`,
        actionLabel: `新增${typeLabel}`,
        action: "create-asset" as const,
      };
    }

    if (!isDefaultProjectSelected) {
      return {
        title: "这个项目还没有资产",
        description:
          "新建项目从空状态开始，不会复制默认项目的提示词。",
        actionLabel: "回到默认项目",
        action: "default-project" as const,
      };
    }

    return {
      title: "还没有提示词",
      description: "创建第一条可复用提示词。",
      actionLabel: "新增提示词",
      action: "create-prompt" as const,
    };
  }

  const hasSearchQuery = Boolean(searchQuery.trim());
  const emptyState = createEmptyState();
  const searchPlaceholder =
    assetTypeFilter === "all"
      ? "搜索标题、分类、标签或正文"
      : `搜索${assetTypeFilterLabels[assetTypeFilter]}`;
  const isPromptTabVisible =
    assetTypeFilter === "prompt" || assetTypeFilter === "all";

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
                项目资产库
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
                {isLoading
                  ? "正在连接"
                  : `${assetTypeCounts.all} 项资产`}
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

      <section className="mx-auto w-full max-w-[1280px] px-5 pt-8 sm:px-8">
        <ProjectSwitcher
          activeProjectId={activeProjectId}
          disabled={isLoading || Boolean(loadError)}
          onCreateProject={() => setProjectDialog({ mode: "create" })}
          onOpenProjectSettings={() => {
            if (activeProjectId) {
              setProjectDialog({
                mode: "edit",
                projectId: activeProjectId,
              });
            }
          }}
          onSelectProject={handleSelectProject}
          projects={projects}
        />
      </section>

      <section className="mx-auto w-full max-w-[1280px] px-5 pb-12 pt-10 sm:px-8 sm:pb-16 sm:pt-12">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold text-blue-700">
            {isDefaultProjectSelected ? "个人 AI 资产库" : "项目工作区"}
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-normal text-slate-950 sm:text-5xl">
            {activeProject ? activeProject.name : "项目资产库"}
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">
            {activeProject?.description || "积累每一个好用的提示词"}
          </p>
          {activeProject && (
            <p className="mt-3 text-sm text-slate-500">
              {projectStageLabels[activeProject.stage]}
              {activeProject.status === "archived" &&
                ` · ${projectStatusLabels.archived}`}
              {" · "}
              {assetTypeCounts.all} 项资产
            </p>
          )}
        </div>

        <div className="mt-9 flex flex-wrap items-center gap-2">
          {assetTypeFilterOptions.map((option) => (
            <button
              aria-pressed={assetTypeFilter === option}
              className={`inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors ${
                assetTypeFilter === option
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-[#dbe7f5] bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700"
              }`}
              key={option}
              onClick={() => handleChangeAssetTypeFilter(option)}
              type="button"
            >
              {assetTypeFilterLabels[option]}
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  assetTypeFilter === option
                    ? "bg-white/20 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
              {assetTypeCounts[option]}
              </span>
            </button>
          ))}

          <label className="ml-auto flex items-center gap-2 rounded-lg border border-[#dbe7f5] bg-white px-3 py-2">
            <span className="text-xs font-semibold text-slate-500">状态</span>
            <select
              aria-label="按状态筛选资产"
              className="bg-transparent text-sm font-semibold text-slate-900 outline-none"
              onChange={(event) =>
                setAssetStatusFilter(event.target.value as AssetStatus)
              }
              value={assetStatusFilter}
            >
              {assetStatusFilterOptions.map((status) => (
                <option key={status} value={status}>
                  {assetStatusLabels[status]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-col gap-3 lg:flex-row">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">搜索资产</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            />
            <input
              className="h-11 w-full rounded-lg border border-[#dbe7f5] bg-white pl-10 pr-10 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              disabled={isLoading || Boolean(loadError)}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={searchPlaceholder}
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
              {isDefaultProjectSelected && isPromptTabVisible && (
                <>
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
                </>
              )}
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                disabled={isLoading || Boolean(loadError)}
                onClick={() => setIsSourcePackageImportOpen(true)}
                type="button"
              >
                <PackageOpen aria-hidden="true" className="size-4" />
                导入文档包
              </button>
              {(assetTypeFilter === "rule" ||
                assetTypeFilter === "all") && (
                <button
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-5 text-sm font-semibold text-emerald-700 transition-colors hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isLoading || Boolean(loadError)}
                  onClick={() =>
                    setAssetEditorState({
                      mode: "create",
                      assetType: "rule",
                    })
                  }
                  type="button"
                >
                  <Plus aria-hidden="true" className="size-4" />
                  新增规则
                </button>
              )}
              {(assetTypeFilter === "document" ||
                assetTypeFilter === "all") && (
                <button
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-5 text-sm font-semibold text-amber-700 transition-colors hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isLoading || Boolean(loadError)}
                  onClick={() =>
                    setAssetEditorState({
                      mode: "create",
                      assetType: "document",
                    })
                  }
                  type="button"
                >
                  <Plus aria-hidden="true" className="size-4" />
                  新增文档
                </button>
              )}
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#dbe7f5] bg-white px-5 text-sm font-semibold text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                disabled={isLoading || Boolean(loadError) || !activeProjectId}
                onClick={() =>
                  setAssetEditorState(
                    projectTechProfile
                      ? { mode: "edit", assetId: projectTechProfile.id }
                      : { mode: "create", assetType: "tech_profile" },
                  )
                }
                type="button"
              >
                <Layers3 aria-hidden="true" className="size-4" />
                {projectTechProfile ? "技术档案" : "新建技术档案"}
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
                onClick={() => void handleOpenBackupManager()}
                type="button"
              >
                <DatabaseBackup aria-hidden="true" className="size-4" />
                数据管理
              </button>
              {isDefaultProjectSelected && isPromptTabVisible && (
                <button
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={isLoading || Boolean(loadError)}
                  onClick={() => setEditorState({ mode: "create" })}
                  type="button"
                >
                  <Plus aria-hidden="true" className="size-4" />
                  新增提示词
                </button>
              )}
            </div>
          )}
        </div>

        {isLoading ? (
          <div
            aria-label="正在加载资产"
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
        ) : listEntries.length > 0 ? (
          <div className="mt-8 grid items-start gap-6 md:grid-cols-2 lg:grid-cols-3">
            {listEntries.map((entry, index) =>
              entry.kind === "prompt" ? (
                <PromptCard
                  canSelect={
                    selectedMergePromptIds.has(entry.prompt.id) ||
                    mergeSelectionCount < MAX_MERGE_PROMPTS
                  }
                  index={index}
                  isMergeTarget={
                    effectiveMergeSelection.targetPromptId ===
                    entry.prompt.id
                  }
                  key={`prompt-${entry.prompt.id}`}
                  onOpen={(selected) => setSelectedPromptId(selected.id)}
                  onSetMergeTarget={handleSetMergeTarget}
                  onToggleSelection={handleToggleMergeSelection}
                  prompt={entry.prompt}
                  selected={selectedMergePromptIds.has(entry.prompt.id)}
                  selectionMode={isMergeSelectionMode}
                />
              ) : (
                <AssetCard
                  asset={entry.asset}
                  index={index}
                  key={`asset-${entry.asset.id}`}
                  onOpen={(asset) => setAssetDetailId(asset.id)}
                />
              ),
            )}
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
              {emptyState.title}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {emptyState.description}
            </p>
            {emptyState.action && (
              <button
                className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                onClick={() => {
                  if (emptyState.action === "clear-search") {
                    setSearchQuery("");
                  } else if (emptyState.action === "reset-status") {
                    setAssetStatusFilter("active");
                  } else if (emptyState.action === "create-asset") {
                    setAssetEditorState({
                      mode: "create",
                      assetType:
                        assetTypeFilter === "document"
                          ? "document"
                          : "rule",
                    });
                  } else if (emptyState.action === "default-project") {
                    handleSelectProject(DEFAULT_PROJECT_ID);
                  } else {
                    setEditorState({ mode: "create" });
                  }
                }}
                type="button"
              >
                {hasSearchQuery ? (
                  <X aria-hidden="true" className="size-4" />
                ) : (
                  <Plus aria-hidden="true" className="size-4" />
                )}
                {emptyState.actionLabel}
              </button>
            )}
          </div>
        )}
      </section>

      {selectedPrompt && (
        <PromptDetailDrawer
          key={`detail-${selectedPrompt.id}`}
          onClose={() => {
            if (!editorState && !deletePromptId && !optimizePromptId) {
              setSelectedPromptId(null);
            }
          }}
          onDelete={(prompt) => setDeletePromptId(prompt.id)}
          onEdit={(prompt) =>
            setEditorState({ mode: "edit", promptId: prompt.id })
          }
          onOptimize={(prompt) => setOptimizePromptId(prompt.id)}
          onRestoreOptimize={handleRestoreOptimize}
          onNotify={notify}
          optimizeVersion={optimizeVersion}
          prompt={selectedPrompt}
        />
      )}

      {optimizePrompt && (
        <PromptOptimizeDrawer
          dataSource={dataSource}
          key={`optimize-${optimizePrompt.id}`}
          onClose={() => setOptimizePromptId(null)}
          onNotify={notify}
          onSaved={handleOptimizeSaved}
          prompt={optimizePrompt}
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
            editingPrompt
              ? `editor-${editingPrompt.id}`
              : editorState.mode === "create" && editorState.initialDraft
                ? "editor-ai-draft"
                : "editor-new-prompt"
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
          otherAssetCount={otherAssetCount}
          promptCount={prompts.length}
          prompts={prompts}
          trashedPromptIds={trashedPromptIds}
        />
      )}

      {isSourcePackageImportOpen && activeProjectId && (
        <SourcePackageImportDialog
          currentProjectId={activeProjectId}
          onClose={() => setIsSourcePackageImportOpen(false)}
          onImported={async () => {
            await reloadAssets();
            notify("导入完成，已创建项目和资产。");
          }}
          projects={projects}
        />
      )}

      {isTrashOpen && (
        <PromptTrashDialog
          isLoading={isTrashLoading}
          loadError={trashError}
          onClose={() => setIsTrashOpen(false)}
          onEmptyTrash={handleEmptyTrash}
          onNotify={notify}
          onPermanentlyDeleteMergeRecord={
            handlePermanentlyDeleteMergeRecord
          }
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

      {detailAsset && (
        <AssetDetailDrawer
          asset={detailAsset}
          allAssets={assets}
          dataSource={dataSource}
          key={`asset-detail-${detailAsset.id}`}
          onClose={() => setAssetDetailId(null)}
          onEdit={(asset) => {
            setAssetDetailId(null);
            setAssetEditorState({ mode: "edit", assetId: asset.id });
          }}
          onNotify={notify}
          onRestore={handleAssetRestore}
          onUpdateStatus={handleAssetStatusChange}
        />
      )}

      {assetEditorState && (
        <AssetEditorDrawer
          asset={editingAsset}
          assetType={
            assetEditorState.mode === "create"
              ? assetEditorState.assetType
              : (editingAsset?.assetType ?? "rule")
          }
          key={
            assetEditorState.mode === "edit"
              ? `asset-editor-${assetEditorState.assetId}`
              : `asset-editor-new-${assetEditorState.assetType}`
          }
          adrOptions={adrOptions}
          relationTargetOptions={relationTargetOptions}
          onClose={() => setAssetEditorState(null)}
          onSave={handleAssetSave}
        />
      )}

      {projectDialog && (
        <ProjectFormDialog
          key={
            projectDialog.mode === "edit"
              ? `project-${projectDialog.projectId}`
              : "project-create"
          }
          mode={projectDialog.mode}
          onArchive={
            projectDialog.mode === "edit"
              ? handleArchiveProject
              : undefined
          }
          onClose={() => setProjectDialog(null)}
          onReactivate={
            projectDialog.mode === "edit"
              ? handleReactivateProject
              : undefined
          }
          onSubmit={
            projectDialog.mode === "edit"
              ? handleUpdateProject
              : handleCreateProject
          }
          project={editingProject}
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
