"use client";

import {
  BookOpenText,
  CheckCircle2,
  DatabaseBackup,
  FileCode2,
  FilePlus2,
  Filter,
  FolderTree,
  GitBranch,
  GitMerge,
  Layers3,
  LibraryBig,
  ListChecks,
  LogOut,
  LoaderCircle,
  PackageOpen,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  Target,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
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
import { RulePackDetailDrawer } from "@/components/rule-pack-detail-drawer";
import { PublicAssetPickerDrawer } from "@/components/public-asset-picker-drawer";
import { RulePackCreateDialog } from "@/components/rule-pack-create-dialog";
import { RulePackImportDialog } from "@/components/rule-pack-import-dialog";
import { RuleCompileDrawer } from "@/components/rule-compile-drawer";
import { GraphViewDrawer } from "@/components/graph-view-drawer";
import { EngineeringImportDrawer } from "@/components/engineering-import-drawer";
import { EngineeringBaselineDrawer } from "@/components/engineering-baseline-drawer";
import { buildGateItemsFromLevel } from "@/lib/release-record";
import { AiMergeDrawer } from "@/components/ai-merge-drawer";
import { BackupManagerDialog } from "@/components/backup-manager-dialog";
import { SourcePackageImportDialog } from "@/components/source-package-import-dialog";
import {
  findProjectTechProfile,
  listAdrCandidates,
} from "@/lib/tech-profile";
import {
  createRulePackFileFromAssets,
  createRulePackFileFromSelection,
  listPackMembers,
  listPackMembersForInstall,
  listProjectPacks,
  planRulePackImport,
  planRulePackInstall,
  toRulePackMember,
} from "@/lib/rule-pack";
import type { RulePackFile } from "@/lib/seed-pack-import";
import {
  compileRuleDrafts,
  listCompileCandidates,
  listConflictCandidates,
  type CompiledDraft,
} from "@/lib/rule-compile";
import {
  compileWithTemplate,
  listProjectTemplates,
  templateDraftToAsset,
  templateFileToDraft,
} from "@/lib/template-asset";
import {
  findNodeWithSameCode,
  listProjectGraphNodes,
} from "@/lib/graph-node";
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
import { ToolbarMoreMenu } from "@/components/toolbar-more-menu";
import type {
  AssetData,
  AssetStatus,
  AssetVersionData,
  GraphNodeType,
  RuleAssetData,
} from "@/data/assets";
import {
  DEFAULT_PROJECT_ID,
  archiveProject,
  createProjectData,
  type ProjectRiskLevel,
  createProjectId,
  isDefaultProject,
  projectRiskLevelLabels,
  projectStageLabels,
  projectStatusLabels,
  reactivateProject,
  resolveActiveProject,
  updateProjectDetails,
  updateProjectRiskLevel,
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
  buildAssetSearchText,
  filterProjectAssets,
  listProjectTags,
  listRelationTargetOptions,
  listRelationTargets,
  matchesPromptLibraryFilters,
  matchesAssetTypeFilter,
  matchesWorkspaceViewAsset,
  readTypeFilterDescription,
  readTypeFilterLabel,
  resetMissingFilter,
  resolveWorkspaceTypeFilter,
  workspaceViewTypeOptions,
  type AssetTypeFilter,
  type WorkspaceView,
} from "@/lib/asset-list";
import {
  assetToDraft,
  buildCompileDecisionInput,
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
import { groupDocumentsByStage } from "@/lib/document-flow";
import {
  loadLastBackupAt,
  loadStoredPromptLibrary,
  saveLastBackupAt,
  savePromptLibrary,
} from "@/lib/prompt-storage";
import { downloadAssetBackup, downloadRulePack } from "@/lib/backup-download";
import { buildPromptSearchText } from "@/lib/prompt-utils";
import {
  loadActiveProjectId,
  loadWorkspaceView,
  saveActiveProjectId,
  saveWorkspaceView,
} from "@/lib/project-storage";
import { ensureDefaultProject } from "@/lib/project-workspace";
import {
  type AssetImportPlan,
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
  | {
      mode: "create";
      assetType: EditableAssetType;
      initialNodeType?: GraphNodeType;
      initialDocumentType?: string;
      initialTitle?: string;
      initialNodeId?: string;
      initialGates?: Array<{
        key: string;
        label: string;
        done: boolean;
        note: string;
      }>;
      initialStack?: Array<{ name: string; version?: string }>;
      initialContent?: string;
    }
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
  // 首屏分成两个视图：公共资产（账号共享的方法库）和单个项目。
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("public");
  const [assetTypeFilter, setAssetTypeFilter] =
    useState<AssetTypeFilter>("prompt");
  const [assetStatusFilter, setAssetStatusFilter] =
    useState<AssetStatus>("active");
  // 组合筛选：标签和关系目标（空字符串表示不筛）
  const [assetTagFilter, setAssetTagFilter] = useState("");
  const [assetRelationFilter, setAssetRelationFilter] = useState("");
  const [assetPackFilter, setAssetPackFilter] = useState("");
  // 标签、状态、关系和规则包四个筛选收进「筛选」面板，默认收起，把位置让给搜索框。
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
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
  const [isRulePackImportOpen, setIsRulePackImportOpen] = useState(false);
  const [isRulePackCreateOpen, setIsRulePackCreateOpen] = useState(false);
  const [isPublicAssetPickerOpen, setIsPublicAssetPickerOpen] = useState(false);
  const [compileOpenedAt, setCompileOpenedAt] = useState<string | null>(null);
  const [compileTemplateId, setCompileTemplateId] = useState("");
  const [isGraphViewOpen, setIsGraphViewOpen] = useState(false);
  const [isEngineeringBaselineOpen, setIsEngineeringBaselineOpen] =
    useState(false);
  const [isEngineeringImportOpen, setIsEngineeringImportOpen] = useState(false);
  const templateFileInputRef = useRef<HTMLInputElement>(null);
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

  // 资产接口返回的是单个项目的列表，重新拉全量，保证其他项目的数据不丢。
  const reloadAssets = useCallback(async () => {
    setAssets(await dataSource.fetchAssets());
  }, [dataSource]);

  // 提示词和统一资产是同一批数据的两种读法：提示词一变就跟着刷新资产快照，
  // 否则关系目标、标签筛选和「被谁引用」会一直用旧标题和旧状态。
  const applyPromptLibrary = useCallback(
    (nextPrompts: PromptCardData[]) => {
      setPrompts(nextPrompts);
      cachePrompts(nextPrompts);
      // 刷新失败不阻塞保存，下次加载会补齐。
      void reloadAssets().catch(() => undefined);
    },
    [cachePrompts, reloadAssets],
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

      let storedView: WorkspaceView | null = null;

      try {
        storedView = loadWorkspaceView();
      } catch {
        storedView = null;
      }

      const nextActiveProject = resolveActiveProject(
        projectList,
        storedProjectId,
      );

      // 视图决定能看哪些资产类型：停在「项目」视图时不能还挂在提示词标签上。
      const nextView: WorkspaceView = storedView ?? "public";
      // 项目视图必须落在一个真实项目上：公共资产库（默认项目）不算项目。
      const nextViewProject =
        nextView === "project" &&
        (!nextActiveProject || isDefaultProject(nextActiveProject))
          ? (projectList.find((project) => !isDefaultProject(project)) ??
            nextActiveProject)
          : nextActiveProject;

      setProjects(projectList);
      setAssets(assetList);
      setActiveProjectId(nextViewProject?.id ?? null);

      setWorkspaceView(nextView);
      setAssetTypeFilter((current) =>
        resolveWorkspaceTypeFilter(nextView, current),
      );

      if (nextViewProject) {
        try {
          saveActiveProjectId(nextViewProject.id);
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
  // 项目视图只认真实项目：公共资产库（默认项目）不算项目。
  const projectViewProjects = useMemo(
    () =>
      workspaceView === "project"
        ? projects.filter((project) => !isDefaultProject(project))
        : projects,
    [projects, workspaceView],
  );
  const hasProjectInView = workspaceView === "project"
    ? Boolean(activeProject) && !isDefaultProjectSelected
    : Boolean(activeProject);
  // 组合筛选用到的选项：标签和「被指向过的目标」
  const tagFilterOptions = useMemo(
    () => (activeProjectId ? listProjectTags(assets, activeProjectId) : []),
    [activeProjectId, assets],
  );
  const relationFilterOptions = useMemo(
    () =>
      activeProjectId ? listRelationTargets(assets, activeProjectId) : [],
    [activeProjectId, assets],
  );
  // 按规则包筛选：当前项目里装过哪些包
  const packFilterOptions = useMemo(
    () => (activeProjectId ? listProjectPacks(assets, activeProjectId) : []),
    [activeProjectId, assets],
  );
  // 筛选目标被删除或归档后，下拉选项会消失。这时按「没有筛选」处理，
  // 免得列表变成空的、又看不出是哪个条件造成的。
  const effectiveTagFilter = resetMissingFilter(
    assetTagFilter,
    tagFilterOptions,
  );
  const effectiveRelationFilter = resetMissingFilter(
    assetRelationFilter,
    relationFilterOptions.map((asset) => asset.id),
  );
  const effectivePackFilter = resetMissingFilter(
    assetPackFilter,
    packFilterOptions.map((option) => option.packId),
  );
  // 「筛选」按钮上的角标：有几个筛选条件在生效（状态默认是「活跃」，不算条件）
  const activeFilterCount =
    (assetStatusFilter !== "active" ? 1 : 0) +
    (effectiveTagFilter ? 1 : 0) +
    (effectiveRelationFilter ? 1 : 0) +
    (effectivePackFilter ? 1 : 0);
  // 2.0.0 过渡规则：提示词仍由现有提示词数据源提供，并且都属于默认项目。
  // 统一资产表当前承载规则、文档等新类型，写入路径切换后这里会统一。
  const projectPrompts = useMemo(
    () =>
      // 提示词不属于任何规则包，按包筛选时提示词要一起隐藏
      workspaceView === "public" &&
      assetStatusFilter === "active" &&
      !effectivePackFilter
        ? prompts.filter((prompt) =>
            matchesPromptLibraryFilters(prompt, {
              ...(effectiveTagFilter ? { tag: effectiveTagFilter } : {}),
              ...(effectiveRelationFilter
                ? { relationTargetId: effectiveRelationFilter }
                : {}),
            }),
          )
        : [],
    [
      assetStatusFilter,
      effectiveRelationFilter,
      effectiveTagFilter,
      effectivePackFilter,
      prompts,
      workspaceView,
    ],
  );
  const projectAssetEntries = useMemo(() => {
    if (!activeProjectId || !hasProjectInView) {
      return [];
    }

    const visibleAssets = filterProjectAssets(assets, {
      projectId: activeProjectId,
      status: assetStatusFilter,
      ...(effectiveTagFilter ? { tag: effectiveTagFilter } : {}),
      ...(effectiveRelationFilter
        ? { relationTargetId: effectiveRelationFilter }
        : {}),
      ...(effectivePackFilter ? { packId: effectivePackFilter } : {}),
    });

    // 视图决定列表里出现哪些类型；提示词由提示词数据源单独提供，这里去掉重复的那份。
    return visibleAssets.filter(
      (asset) =>
        asset.assetType !== "prompt" &&
        matchesWorkspaceViewAsset(workspaceView, asset.assetType),
    );
  }, [
    activeProjectId,
    assetStatusFilter,
    assets,
    effectiveRelationFilter,
    effectiveTagFilter,
    effectivePackFilter,
    hasProjectInView,
    workspaceView,
  ]);
  // 顶部「N 项资产」和标签上的数字必须同一口径：都只算当前视图列出的类型。
  const assetTypeCounts = useMemo<Record<AssetTypeFilter, number>>(() => {
    const counts: Record<AssetTypeFilter, number> = {
      all: 0,
      prompt: projectPrompts.length,
      rule: projectAssetEntries.filter((asset) => asset.assetType === "rule")
        .length,
      document: projectAssetEntries.filter(
        (asset) => asset.assetType === "document",
      ).length,
      tech_profile: projectAssetEntries.filter(
        (asset) => asset.assetType === "tech_profile",
      ).length,
      template: projectAssetEntries.filter(
        (asset) => asset.assetType === "template",
      ).length,
      rule_pack: projectAssetEntries.filter(
        (asset) => asset.assetType === "rule_pack",
      ).length,
      graph_node: projectAssetEntries.filter(
        (asset) => asset.assetType === "graph_node",
      ).length,
      evidence: projectAssetEntries.filter(
        (asset) => asset.assetType === "evidence",
      ).length,
      release_record: projectAssetEntries.filter(
        (asset) => asset.assetType === "release_record",
      ).length,
    };

    counts.all = workspaceViewTypeOptions[workspaceView]
      .filter((option) => option !== "all")
      .reduce((total, option) => total + counts[option], 0);

    return counts;
  }, [projectAssetEntries, projectPrompts, workspaceView]);

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
  const relationTargetOptions = useMemo(() => {
    // 提示词和资产走两套编辑器，正在编辑的那条都要从候选里去掉，
    // 否则会建出「指向自己」的关系。
    const editingIds = [
      assetEditorState?.mode === "edit" ? assetEditorState.assetId : null,
      editorState?.mode === "edit" ? editorState.promptId : null,
    ].filter((id): id is string => id !== null);

    return listRelationTargetOptions(assets, {
      projectId: activeProjectId ?? "",
      excludeAssetIds: editingIds,
    });
  }, [activeProjectId, assetEditorState, editorState, assets]);
  // 规则编译：候选集和「可能打架的规则」都从当前项目的资产里算
  // 项目图谱：当前项目的节点，以及编辑器里可选的父节点（同类型、不含自己）
  const graphNodes = useMemo(
    () => (activeProjectId ? listProjectGraphNodes(assets, activeProjectId) : []),
    [activeProjectId, assets],
  );
  const graphNodeOptions = useMemo(
    () =>
      graphNodes.map((node) => ({
        id: node.id,
        title: node.title,
        code: node.metadata.code,
        nodeType: node.metadata.nodeType,
      })),
    [graphNodes],
  );
  const templatesInProject = useMemo(
    () => (activeProjectId ? listProjectTemplates(assets, activeProjectId) : []),
    [activeProjectId, assets],
  );
  // 技术档案里的技术栈摘要，编译产物头部会带上一行
  const techStackSummary = useMemo(() => {
    const profile = activeProjectId
      ? findProjectTechProfile(assets, activeProjectId)
      : null;
    const stack =
      profile && profile.assetType === "tech_profile"
        ? profile.metadata.stack
        : [];

    return stack.length > 0
      ? [
          ...new Set(
            stack
              .map((entry) =>
                [entry.name, entry.version].filter(Boolean).join(" "),
              )
              .filter(Boolean),
          ),
        ].join(" / ")
      : "";
  }, [activeProjectId, assets]);
  const compileCandidates = useMemo(
    () => (activeProjectId ? listCompileCandidates(assets, activeProjectId) : null),
    [activeProjectId, assets],
  );
  const compileConflicts = useMemo(
    () =>
      compileCandidates
        ? listConflictCandidates(
            compileCandidates.included.map((candidate) => candidate.rule),
          )
        : [],
    [compileCandidates],
  );
  const packTitles = useMemo(() => {
    const titles: Record<string, string> = {};

    for (const asset of assets) {
      if (asset.assetType === "rule_pack") {
        titles[asset.id] = asset.title;
      }
    }

    return titles;
  }, [assets]);
  const compileDrafts = useMemo(() => {
    if (!compileOpenedAt || !compileCandidates) {
      return null;
    }

    return compileRuleDrafts({
      projectName: activeProject?.name ?? "当前项目",
      rules: compileCandidates.included.map((candidate) => candidate.rule),
      packTitles,
      excludedCount: compileCandidates.excluded.length,
      ...(techStackSummary ? { profileSummary: `技术档案：${techStackSummary}` } : {}),
      now: compileOpenedAt,
    });
  }, [
    activeProject,
    compileCandidates,
    compileOpenedAt,
    packTitles,
    techStackSummary,
  ]);
  // 选中的模板只套在主产物上，START_PROMPT.md 保持内置结构
  const compileResult = useMemo(() => {
    if (!compileDrafts || !compileOpenedAt) {
      return null;
    }

    const template = templatesInProject.find(
      (item) => item.id === compileTemplateId,
    );

    if (!template) {
      return {
        drafts: compileDrafts,
        pendingVariables: [] as string[],
        rulesAppended: false,
      };
    }

    const compiled = compileWithTemplate({
      template,
      projectName: activeProject?.name ?? "当前项目",
      projectGoal: activeProject?.description?.trim() ?? "",
      techStack: techStackSummary,
      rulesDraft: compileDrafts.agents,
      now: compileOpenedAt,
    });

    return {
      drafts: {
        agents: {
          target: compiled.target,
          fileName: compiled.fileName,
          content: compiled.content,
          ruleCount: compiled.ruleCount,
        },
        startPrompt: compileDrafts.startPrompt,
      },
      pendingVariables: compiled.pendingVariables,
      rulesAppended: compiled.rulesAppended,
    };
  }, [
    activeProject,
    compileDrafts,
    compileOpenedAt,
    compileTemplateId,
    techStackSummary,
    templatesInProject,
  ]);
  // 提示词详情要显示关系目标，这里把目标标题和「还能不能用」一起备好。
  // 目标可能是别的提示词、垃圾箱里的提示词，或已归档的规则/文档/技术档案。
  const promptRelationTargets = useMemo(() => {
    const targets = new Map<
      string,
      { id: string; title: string; unavailable: boolean }
    >();

    // 资产快照覆盖全部类型和垃圾箱，先垫底
    for (const item of assets) {
      targets.set(item.id, {
        id: item.id,
        title: item.title,
        unavailable: Boolean(item.deletedAt) || item.status === "archived",
      });
    }

    // 提示词列表和垃圾箱比资产快照新，用它覆盖标题和状态
    for (const item of prompts) {
      targets.set(item.id, {
        id: item.id,
        title: item.title,
        unavailable: false,
      });
    }

    for (const item of trashPrompts) {
      targets.set(item.id, {
        id: item.id,
        title: item.title,
        unavailable: true,
      });
    }

    return [...targets.values()];
  }, [assets, prompts, trashPrompts]);
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

    if (!match) {
      return null;
    }

    // 规则包有自己的一套详情（成员清单、安装、导出）
    return isEditableAssetData(match) || match.assetType === "rule_pack"
      ? match
      : null;
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

      applyPromptLibrary(library.prompts);
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

    applyPromptLibrary(library.prompts);
    setEditorState(null);
    setSelectedPromptId(newPrompt.id);
    notify("提示词已保存");
  }

  async function handleDelete() {
    if (!promptToDelete) {
      return;
    }

    const library = await dataSource.deletePrompt(promptToDelete.id);

    applyPromptLibrary(library.prompts);
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

  // 备份导入、本机数据合并和垃圾箱恢复都会写回公共资产库，完成后切过去让结果可见。
  function focusDefaultProject() {
    if (workspaceView !== "public") {
      setWorkspaceView("public");

      try {
        saveWorkspaceView("public");
      } catch {
        // 存不上只影响下次刷新，不影响这次操作
      }
    }

    if (!isDefaultProjectSelected) {
      handleSelectProject(DEFAULT_PROJECT_ID);
    }
  }

  // 切视图：公共资产固定看默认项目（账号方法库）；项目视图必须落在一个具体项目上。
  function handleClearFilters() {
    setAssetStatusFilter("active");
    setAssetTagFilter("");
    setAssetRelationFilter("");
    setAssetPackFilter("");
  }

  // 打包成规则包：只生成文件并下载，不动库里的资产。
  function handleDownloadPackedRulePack(input: {
    title: string;
    assets: AssetData[];
  }) {
    const file = createRulePackFileFromSelection({
      packId: `rule-pack-${Date.now()}`,
      title: input.title,
      summary: `在公共资产库勾选打包生成：共 ${input.assets.length} 条资产。`,
      assets: input.assets,
      now: new Date().toISOString(),
    });

    downloadRulePack(file);
    setIsRulePackCreateOpen(false);
    notify(`规则包已生成：${file.members.length} 条成员`);
  }

  function handleChangeWorkspaceView(nextView: WorkspaceView) {
    if (nextView === workspaceView) {
      return;
    }

    setWorkspaceView(nextView);
    setAssetTypeFilter((current) =>
      resolveWorkspaceTypeFilter(nextView, current),
    );
    setSelectedPromptId(null);
    setIsMergeSelectionMode(false);
    setMergeSelection(createEmptySelection());

    if (nextView === "public") {
      handleSelectProject(DEFAULT_PROJECT_ID);
    } else if (isDefaultProjectSelected) {
      const nextProject = projects.find(
        (project) => !isDefaultProject(project),
      );

      if (nextProject) {
        handleSelectProject(nextProject.id);
      }
    }

    try {
      saveWorkspaceView(nextView);
    } catch {
      notify("视图选择没有保存到本机");
    }
  }

  async function handleCreateProject(values: ProjectFormValues) {
    const project = createProjectData({
      id: createProjectId(),
      name: values.name,
      description: values.description,
      stage: values.stage,
      riskLevel: values.riskLevel,
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

  // 工程基线里切换质量等级：只改等级，其他项目字段原样带回
  async function handleChangeProjectLevel(level: ProjectRiskLevel) {
    if (!activeProject) {
      return;
    }

    const nextProjects = await dataSource.updateProject(
      updateProjectRiskLevel(activeProject, level),
    );

    setProjects(nextProjects);
    notify(`质量等级已改为「${projectRiskLevelLabels[level]}」`);
  }

  // 缺哪份基线文档就从这里进编辑器，标题和文档类型已经填好
  function handleCreateBaselineDocument(input: {
    title: string;
    documentType: string;
  }) {
    setIsEngineeringBaselineOpen(false);
    setAssetEditorState({
      mode: "create",
      assetType: "document",
      initialTitle: input.title,
      initialDocumentType: input.documentType,
    });
  }

  // 缺口里的「新建验收记录」：进编辑器时已经选好对应的需求节点
  function handleCreateRequirementEvidence(input: {
    nodeId: string;
    title: string;
  }) {
    setIsEngineeringBaselineOpen(false);
    setAssetEditorState({
      mode: "create",
      assetType: "evidence",
      initialTitle: input.title,
      initialNodeId: input.nodeId,
    });
  }

  // 工程基线里的「新建发布记录」：门禁清单按当前项目的质量等级带出来
  function handleCreateReleaseRecord() {
    if (!activeProject) {
      return;
    }

    setIsEngineeringBaselineOpen(false);
    setAssetEditorState({
      mode: "create",
      assetType: "release_record",
      initialGates: buildGateItemsFromLevel(activeProject.riskLevel),
    });
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

function readAssetTypeLabel(assetType: EditableAssetType) {
  if (assetType === "rule") {
    return "规则";
  }

  if (assetType === "template") {
    return "模板";
  }

  if (assetType === "graph_node") {
    return "图谱节点";
  }

  return assetType === "tech_profile" ? "技术档案" : "文档";
}

  async function handleAssetSave(draft: AssetDraft) {
    const now = new Date().toISOString();
    const typeLabel = readAssetTypeLabel(draft.assetType);

    // 图谱节点的编号在同一个项目、同一类型里必须唯一
    if (draft.assetType === "graph_node") {
      const conflict = findNodeWithSameCode(graphNodes, {
        id:
          assetEditorState?.mode === "edit" ? assetEditorState.assetId : "",
        nodeType: draft.nodeType,
        code: draft.code,
      });

      if (conflict) {
        throw new Error(
          `编号「${conflict.metadata.code}」已经被「${conflict.title}」用了，换一个。`,
        );
      }
    }

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

  // 安装规则包：把成员复制进目标项目，装过的跳过、不覆盖
  async function handleInstallRulePack(projectId: string) {
    if (detailAsset?.assetType !== "rule_pack") {
      return;
    }

    const packAsset = detailAsset;

    try {
      const plan = planRulePackInstall({
        pack: packAsset,
        members: listPackMembersForInstall(
          assets,
          packAsset.id,
          packAsset.projectId,
        ).map(toRulePackMember),
        existingAssets: assets,
        targetProjectId: projectId,
        now: new Date().toISOString(),
      });

      for (const asset of plan.assetsToCreate) {
        await dataSource.createAsset({
          asset,
          versionId: asset.currentVersionId,
          changeReason: "安装规则包",
          versionReason: "initial",
        });
      }

      await reloadAssets();

      const projectName =
        projects.find((project) => project.id === projectId)?.name ?? projectId;

      notify(
        `已安装到「${projectName}」：新增 ${plan.assetsToCreate.length} 条、跳过 ${plan.skipped.length} 条`,
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "安装规则包失败");
    }
  }

  function handleExportRulePack() {
    if (detailAsset?.assetType !== "rule_pack") {
      return;
    }

    const file = createRulePackFileFromAssets({
      pack: detailAsset,
      members: listPackMembers(assets, detailAsset.id),
      exportedAt: new Date().toISOString(),
    });

    downloadRulePack(file);
    notify(`规则包已导出：${file.members.length} 条成员`);
  }

  // 从文件导入规则包：库里没有这个包就先建包资产，再装成员
  // 导入模板：一次选多个 Markdown，每个文件直接建成一条模板资产（不走 AI）
  async function handleImportTemplateFiles(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    if (!activeProjectId) {
      notify("请先选择项目。");
      return;
    }

    const now = new Date().toISOString();
    let created = 0;

    try {
      for (const file of files) {
        const draft = templateFileToDraft({
          fileName: file.name,
          content: await file.text(),
        });
        const asset = templateDraftToAsset({
          id: createAssetId("template"),
          projectId: activeProjectId,
          draft,
          originalFilename: file.name,
          now,
        });

        await dataSource.createAsset({
          asset,
          versionId: asset.currentVersionId,
          changeReason: "导入模板",
          versionReason: "initial",
        });
        created += 1;
      }
    } catch (error) {
      notify(
        error instanceof Error
          ? `导入模板失败：${error.message}`
          : "导入模板失败",
      );
      return;
    }

    await reloadAssets();
    setAssetTypeFilter("template");
    notify(`已导入 ${created} 个模板`);
  }

  async function handleCompileDecision(
    rule: RuleAssetData,
    decision: "included" | "excluded",
    note: string,
  ) {
    await dataSource.updateAsset(
      buildCompileDecisionInput(rule, decision, note, {
        versionId: createAssetVersionId(),
        now: new Date().toISOString(),
      }),
    );
    await reloadAssets();
  }

  function handleExcludeFromCompile(rule: RuleAssetData, note: string) {
    return handleCompileDecision(rule, "excluded", note).then(() =>
      notify(`「${rule.title}」不再参与编译`),
    );
  }

  function handleIncludeInCompile(rule: RuleAssetData) {
    return handleCompileDecision(rule, "included", "").then(() =>
      notify(`「${rule.title}」恢复参与编译`),
    );
  }

  // 编译草稿存成文档资产：文档类型写文件名，角色标「编译结果」
  async function handleSaveCompiledDraft(draft: CompiledDraft) {
    if (!activeProjectId) {
      throw new Error("请先选择项目。");
    }

    const assetId = createAssetId("document");
    const input = buildCreateAssetInput({
      id: assetId,
      projectId: activeProjectId,
      draft: {
        assetType: "document",
        title: draft.fileName,
        summary: `编译结果 · 参与编译 ${draft.ruleCount} 条规则`,
        content: draft.content,
        status: "active",
        documentType: draft.fileName,
        role: "compiled",
        authority: false,
        module: "",
        effectiveVersion: "",
        sourceLocation: "",
        updateTrigger: "",
        freshness: "",
        lastVerifiedAt: "",
        relations: [],
      },
      now: new Date().toISOString(),
    });

    await dataSource.createAsset(input);
    await reloadAssets();
    setAssetDetailId(assetId);
    notify(`${draft.fileName} 已保存为文档资产`);
  }

  async function handleInstallRulePackFile(
    file: RulePackFile,
    projectId: string,
    options?: {
      changeReason?: string;
      successMessage?: (counts: {
        created: number;
        skipped: number;
        projectName: string;
      }) => string;
    },
  ) {
    const now = new Date().toISOString();
    const plan = planRulePackImport({
      file,
      existingAssets: assets,
      targetProjectId: projectId,
      now,
    });
    const changeReason = options?.changeReason ?? "安装规则包";

    if (plan.packAsset) {
      await dataSource.createAsset({
        asset: plan.packAsset,
        versionId: plan.packAsset.currentVersionId,
        changeReason: "导入规则包",
        versionReason: "initial",
      });
    }

    for (const asset of plan.assetsToCreate) {
      await dataSource.createAsset({
        asset,
        versionId: asset.currentVersionId,
        changeReason,
        versionReason: "initial",
      });
    }

    await reloadAssets();

    const projectName =
      projects.find((project) => project.id === projectId)?.name ?? projectId;

    const counts = {
      created: plan.assetsToCreate.length,
      skipped: plan.skipped.length,
      projectName,
    };

    notify(
      options?.successMessage?.(counts) ??
        `规则包已装到「${projectName}」：新增 ${plan.assetsToCreate.length} 条、跳过 ${plan.skipped.length} 条`,
    );
  }

  // 从公共资产库挑资产带进项目：走和「安装规则包」同一条复制与去重路径。
  // 模板 → 用这个模板新建一份文档实例（正文带进编辑器，保存前还能改）
  function handleCreateDocumentFromTemplate(asset: AssetData) {
    if (asset.assetType !== "template") {
      return;
    }

    setAssetDetailId(null);
    setAssetEditorState({
      mode: "create",
      assetType: "document",
      initialTitle: asset.title,
      initialContent: asset.content,
    });
  }

  // 文档 → 另存为模板：进公共资产库的模板层（正文原样复制，占位符自己改）
  async function handleSaveDocumentAsTemplate(asset: AssetData) {
    if (asset.assetType !== "document") {
      return;
    }

    const now = new Date().toISOString();
    const draft = templateFileToDraft({
      fileName: `${asset.title}.md`,
      content: asset.content,
    });
    const templateAsset = templateDraftToAsset({
      id: createAssetId("template"),
      projectId: DEFAULT_PROJECT_ID,
      draft,
      originalFilename: `${asset.title}.md`,
      now,
    });

    try {
      await dataSource.createAsset({
        asset: templateAsset,
        versionId: templateAsset.currentVersionId,
        changeReason: "另存为模板",
        versionReason: "initial",
      });
      await reloadAssets();
      setAssetDetailId(null);
      notify(
        "已另存为模板，放进了公共资产库的模板页签（正文原样复制，占位符自己改）",
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "另存为模板失败");
    }
  }

  async function handlePickPublicAssets(selected: AssetData[]) {
    if (!activeProjectId || selected.length === 0) {
      return;
    }

    const file = createRulePackFileFromSelection({
      packId: "rule-pack-public-library",
      title: "公共资产库挑入",
      summary: "从公共资产库挑进项目的资产，用来记住它是从哪来的。",
      assets: selected,
      now: new Date().toISOString(),
    });
    const projectId = activeProjectId;

    await handleInstallRulePackFile(file, projectId, {
      changeReason: "从公共资产库挑入",
      successMessage: ({ created, skipped }) =>
        `已从公共资产库带进 ${created} 条资产${skipped > 0 ? `，跳过 ${skipped} 条（之前挑过）` : ""}`,
    });
    setIsPublicAssetPickerOpen(false);
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

    applyPromptLibrary(library.prompts);
    await loadTrash(false);
    focusDefaultProject();
  }

  async function handlePermanentlyDeletePrompt(promptId: string) {
    const library = await dataSource.permanentlyDeletePrompt(promptId);

    applyPromptLibrary(library.prompts);
    await loadTrash(false);
  }

  async function handleEmptyTrash() {
    const library = await dataSource.emptyTrash();

    applyPromptLibrary(library.prompts);
    await loadTrash(false);
  }

  async function handleRestoreMergeRecord(versionId: string) {
    const library = await dataSource.restoreMergeRecord(versionId);

    applyPromptLibrary(library.prompts);
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

    applyPromptLibrary(library.prompts);
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

    applyPromptLibrary(library.prompts);
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

      applyPromptLibrary(library.prompts);
      setOptimizeVersionState(null);
      notify("已回到优化前");
    } catch (error) {
      notify(error instanceof Error ? error.message : "回到优化前失败");
    }
  }

  function handleExport() {
    // 2.1.2 起导出 v2：项目、提示词、规则、文档、技术档案和关系一起走
    const exportedAt = downloadAssetBackup({ projects, assets });

    saveLastBackupAt(exportedAt);
    setLastBackupAt(exportedAt);
    return exportedAt;
  }

  async function handleImportAssets(plan: AssetImportPlan) {
    for (const project of plan.projectsToCreate) {
      await dataSource.createProject(project);
    }

    for (const asset of plan.assetsToCreate) {
      await dataSource.createAsset({
        asset,
        versionId: asset.currentVersionId,
        changeReason: "导入备份",
        versionReason: "initial",
      });
    }

    await loadFromServer();
    setIsBackupManagerOpen(false);
    notify(
      `导入完成：新增项目 ${plan.projectsToCreate.length} 个、资产 ${plan.assetsToCreate.length} 条、跳过 ${plan.skippedAssetIds.length} 条`,
    );
  }

  async function handleImport(plan: PromptImportPlan) {
    const result = await dataSource.mergePrompts(
      plan.backup.prompts,
    );

    applyPromptLibrary(result.prompts);
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

    applyPromptLibrary(result.prompts);
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

    // 项目视图必须落在一个真实项目上：一个都没有时先引导新建项目
    if (workspaceView === "project" && !hasProjectInView) {
      return {
        title: "还没有项目",
        description: "新建一个项目，再决定从公共资产库里挑哪些资产带过去。",
        actionLabel: "新建项目",
        action: "create-project" as const,
      };
    }

    if (assetTypeFilter === "rule" || assetTypeFilter === "document") {
      const typeLabel = assetTypeFilter === "rule" ? "规则" : "文档";

      return {
        title: `还没有${typeLabel}`,
        description:
          workspaceView === "project"
            ? `这个项目里没有${typeLabel}资产，可以从公共资产库挑，或者自己新增。`
            : `公共资产库里没有${typeLabel}资产。`,
        actionLabel: `新增${typeLabel}`,
        action: "create-asset" as const,
      };
    }

    if (workspaceView === "project") {
      return {
        title: "这个项目还没有资产",
        description:
          "三条来源：从公共资产库挑、装一个规则包、导入工程；也可以自己新建。",
        actionLabel: "从公共资产库挑资产",
        action: "pick-public-assets" as const,
      };
    }

    return {
      title: "公共资产库还没有内容",
      description: "采集第一条提示词，或者导入一个规则包。",
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
  // 项目视图的「文档」标签按链路分组显示（需求 / 规格与计划 / 交付 / 验收与发布）
  const isDocumentFlowView =
    workspaceView === "project" && assetTypeFilter === "document";
  const documentFlowGroups = useMemo(
    () =>
      groupDocumentsByStage(
        listEntries
          .filter((entry) => entry.kind === "asset")
          .map((entry) => entry.asset),
      ),
    [listEntries],
  );

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
          activeProjectId={
            workspaceView === "project" && !hasProjectInView
              ? null
              : activeProjectId
          }
          disabled={isLoading || Boolean(loadError)}
          onChangeView={handleChangeWorkspaceView}
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
          projects={projectViewProjects}
          view={workspaceView}
        />
      </section>

      <section className="mx-auto w-full max-w-[1280px] px-5 pb-12 pt-10 sm:px-8 sm:pb-16 sm:pt-12">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold text-blue-700">
            {workspaceView === "public" ? "账号公共资产" : "项目工作区"}
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-normal text-slate-950 sm:text-5xl">
            {workspaceView === "public"
              ? "公共资产库"
              : hasProjectInView
                ? (activeProject?.name ?? "项目资产库")
                : "项目资产库"}
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">
            {workspaceView === "public"
              ? "所有项目共用的提示词、规则和模板，在这里积累一次、多项目复用。"
              : hasProjectInView
                ? activeProject?.description || "这个项目自己的资产"
                : "先新建一个项目，再从公共资产库里挑资产带过去。"}
          </p>
          {activeProject && workspaceView === "project" && hasProjectInView && (
            <p className="mt-3 text-sm text-slate-500">
              {projectStageLabels[activeProject.stage]}
              {activeProject.status === "archived" &&
                ` · ${projectStatusLabels.archived}`}
              {" · "}
              {assetTypeCounts.all} 项资产
            </p>
          )}
          {workspaceView === "public" && (
            <p className="mt-3 text-sm text-slate-500">
              {assetTypeCounts.all} 项资产
            </p>
          )}
        </div>

        <div className="mt-9 flex flex-wrap items-center gap-2">
          {workspaceViewTypeOptions[workspaceView].map((option) => (
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
              {readTypeFilterLabel(workspaceView, option)}
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
        </div>

        {assetTypeFilter !== "all" && (
          <p className="mt-3 text-sm leading-6 text-slate-500">
            {readTypeFilterDescription(workspaceView, assetTypeFilter)}
          </p>
        )}

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

          {!isMergeSelectionMode && (
            <button
              aria-expanded={isFilterPanelOpen}
              className={`inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors ${
                isFilterPanelOpen
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-[#dbe7f5] bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700"
              }`}
              onClick={() => setIsFilterPanelOpen((current) => !current)}
              type="button"
            >
              <Filter aria-hidden="true" className="size-4" />
              筛选
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}

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
              {workspaceView === "public" && isPromptTabVisible && (
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
              <input
                accept=".md,.markdown,text/markdown,text/plain"
                aria-label="选择模板文件"
                className="hidden"
                multiple
                onChange={(event) => void handleImportTemplateFiles(event)}
                ref={templateFileInputRef}
                type="file"
              />
              {workspaceView === "project" && (
                <>
                  <button
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition-colors hover:border-teal-300 hover:text-teal-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    disabled={
                      isLoading || Boolean(loadError) || !hasProjectInView
                    }
                    onClick={() => setIsGraphViewOpen(true)}
                    type="button"
                  >
                    <GitBranch aria-hidden="true" className="size-4" />
                    项目图谱
                  </button>
                  <button
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition-colors hover:border-sky-300 hover:text-sky-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    disabled={
                      isLoading || Boolean(loadError) || !hasProjectInView
                    }
                    onClick={() => setIsEngineeringBaselineOpen(true)}
                    type="button"
                  >
                    <ShieldCheck aria-hidden="true" className="size-4" />
                    工程基线
                  </button>
                  {(assetTypeFilter === "all" ||
                    assetTypeFilter === "rule") && (
                    <button
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      disabled={
                        isLoading ||
                        Boolean(loadError) ||
                        !hasProjectInView ||
                        !compileCandidates
                      }
                      onClick={() =>
                        setCompileOpenedAt(new Date().toISOString())
                      }
                      type="button"
                    >
                      <FileCode2 aria-hidden="true" className="size-4" />
                      规则编译
                    </button>
                  )}
                  {assetTypeFilter === "rule" && (
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
                  {assetTypeFilter === "document" && (
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
                  {assetTypeFilter === "template" && (
                    <button
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-5 text-sm font-semibold text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isLoading || Boolean(loadError)}
                      onClick={() =>
                        setAssetEditorState({
                          mode: "create",
                          assetType: "template",
                        })
                      }
                      type="button"
                    >
                      <Plus aria-hidden="true" className="size-4" />
                      新建模板
                    </button>
                  )}
                </>
              )}
              {workspaceView === "public" && isPromptTabVisible && (
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

              <ToolbarMoreMenu
                items={
                  workspaceView === "public"
                    ? [
                        {
                          key: "import-source-package",
                          label: "导入文档包",
                          icon: (
                            <PackageOpen aria-hidden="true" className="size-4" />
                          ),
                          disabled: isLoading || Boolean(loadError),
                          onSelect: () => setIsSourcePackageImportOpen(true),
                        },
                        {
                          key: "import-rule-pack",
                          label: "导入规则包",
                          icon: (
                            <Layers3 aria-hidden="true" className="size-4" />
                          ),
                          disabled:
                            isLoading ||
                            Boolean(loadError) ||
                            projects.length === 0,
                          onSelect: () => setIsRulePackImportOpen(true),
                        },
                        {
                          key: "import-template",
                          label: "导入模板",
                          icon: (
                            <FilePlus2 aria-hidden="true" className="size-4" />
                          ),
                          disabled:
                            isLoading || Boolean(loadError) || !activeProjectId,
                          onSelect: () => templateFileInputRef.current?.click(),
                        },
                        {
                          key: "compile-rules",
                          label: "规则编译",
                          icon: (
                            <FileCode2 aria-hidden="true" className="size-4" />
                          ),
                          disabled:
                            isLoading ||
                            Boolean(loadError) ||
                            !activeProjectId ||
                            !compileCandidates,
                          onSelect: () =>
                            setCompileOpenedAt(new Date().toISOString()),
                        },
                        {
                          key: "pack-assets",
                          label: "打包成规则包",
                          icon: (
                            <Layers3 aria-hidden="true" className="size-4" />
                          ),
                          disabled:
                            isLoading || Boolean(loadError) || !activeProjectId,
                          onSelect: () => setIsRulePackCreateOpen(true),
                        },
                        {
                          key: "trash",
                          label: "垃圾箱",
                          icon: (
                            <Trash2 aria-hidden="true" className="size-4" />
                          ),
                          disabled: isLoading || Boolean(loadError),
                          onSelect: handleOpenTrash,
                        },
                        {
                          key: "backup",
                          label: "数据管理",
                          icon: (
                            <DatabaseBackup
                              aria-hidden="true"
                              className="size-4"
                            />
                          ),
                          disabled: isLoading || Boolean(loadError),
                          onSelect: () => void handleOpenBackupManager(),
                        },
                      ]
                    : [
                        {
                          key: "import-code",
                          label: "导入工程",
                          icon: (
                            <FolderTree aria-hidden="true" className="size-4" />
                          ),
                          disabled:
                            isLoading || Boolean(loadError) || !activeProjectId,
                          onSelect: () => setIsEngineeringImportOpen(true),
                        },
                        {
                          key: "pick-public-assets",
                          label: "从公共资产库挑资产",
                          icon: (
                            <LibraryBig aria-hidden="true" className="size-4" />
                          ),
                          disabled:
                            isLoading || Boolean(loadError) || !activeProjectId,
                          onSelect: () => setIsPublicAssetPickerOpen(true),
                        },
                        {
                          key: "create-rule",
                          label: "新增规则",
                          icon: <Plus aria-hidden="true" className="size-4" />,
                          disabled: isLoading || Boolean(loadError),
                          onSelect: () =>
                            setAssetEditorState({
                              mode: "create",
                              assetType: "rule",
                            }),
                        },
                        {
                          key: "create-document",
                          label: "新增文档",
                          icon: <Plus aria-hidden="true" className="size-4" />,
                          disabled: isLoading || Boolean(loadError),
                          onSelect: () =>
                            setAssetEditorState({
                              mode: "create",
                              assetType: "document",
                            }),
                        },
                        {
                          key: "create-template",
                          label: "新建模板",
                          icon: <Plus aria-hidden="true" className="size-4" />,
                          disabled: isLoading || Boolean(loadError),
                          onSelect: () =>
                            setAssetEditorState({
                              mode: "create",
                              assetType: "template",
                            }),
                        },
                        {
                          key: "trash",
                          label: "垃圾箱",
                          icon: (
                            <Trash2 aria-hidden="true" className="size-4" />
                          ),
                          disabled: isLoading || Boolean(loadError),
                          onSelect: handleOpenTrash,
                        },
                        {
                          key: "backup",
                          label: "数据管理",
                          icon: (
                            <DatabaseBackup
                              aria-hidden="true"
                              className="size-4"
                            />
                          ),
                          disabled: isLoading || Boolean(loadError),
                          onSelect: () => void handleOpenBackupManager(),
                        },
                      ]
                }
              />
            </div>
          )}
        </div>

        {isFilterPanelOpen && !isMergeSelectionMode && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-[#dbe7f5] bg-white px-4 py-3">
            <label className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">状态</span>
              <select
                aria-label="按状态筛选资产"
                className="h-9 rounded-lg border border-[#dbe7f5] bg-white px-2 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500"
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

            {tagFilterOptions.length > 0 && (
              <label className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">
                  标签
                </span>
                <select
                  aria-label="按标签筛选资产"
                  className="h-9 rounded-lg border border-[#dbe7f5] bg-white px-2 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500"
                  onChange={(event) => setAssetTagFilter(event.target.value)}
                  value={effectiveTagFilter}
                >
                  <option value="">全部标签</option>
                  {tagFilterOptions.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {relationFilterOptions.length > 0 && (
              <label className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">
                  关系目标
                </span>
                <select
                  aria-label="按关系目标筛选资产"
                  className="h-9 rounded-lg border border-[#dbe7f5] bg-white px-2 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500"
                  onChange={(event) =>
                    setAssetRelationFilter(event.target.value)
                  }
                  value={effectiveRelationFilter}
                >
                  <option value="">全部目标</option>
                  {relationFilterOptions.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.title}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {packFilterOptions.length > 0 && (
              <label className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">
                  规则包
                </span>
                <select
                  aria-label="按规则包筛选资产"
                  className="h-9 rounded-lg border border-[#dbe7f5] bg-white px-2 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500"
                  onChange={(event) => {
                    const nextPackId = event.target.value;

                    setAssetPackFilter(nextPackId);

                    // 提示词不属于任何规则包，停在「提示词」标签会看到空列表
                    if (nextPackId && assetTypeFilter === "prompt") {
                      setAssetTypeFilter("all");
                    }
                  }}
                  value={effectivePackFilter}
                >
                  <option value="">全部规则包</option>
                  {packFilterOptions.map((option) => (
                    <option key={option.packId} value={option.packId}>
                      {option.title}（{option.memberCount}）
                    </option>
                  ))}
                </select>
              </label>
            )}

            {activeFilterCount > 0 && (
              <button
                className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg border border-[#dbe7f5] px-3 text-sm font-semibold text-slate-600 transition-colors hover:border-blue-300 hover:text-blue-700"
                onClick={handleClearFilters}
                type="button"
              >
                <X aria-hidden="true" className="size-4" />
                清空筛选
              </button>
            )}
          </div>
        )}

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
        ) : isDocumentFlowView ? (
          // 项目文档按链路分组：需求 → 规格与计划 → 交付 → 验收与发布
          <div className="mt-8 flex flex-col gap-7">
            {documentFlowGroups.map((group) => (
              <section key={group.stage}>
                <div className="flex flex-wrap items-baseline gap-3">
                  <h2 className="text-base font-semibold text-slate-900">
                    {group.label}
                  </h2>
                  <span className="text-xs text-slate-500">
                    {group.documents.length > 0
                      ? `${group.documents.length} 份`
                      : `还没有。这一格放：${group.hint}`}
                  </span>
                </div>
                {group.documents.length > 0 && (
                  <div className="mt-3 grid items-start gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {group.documents.map((asset, index) => (
                      <AssetCard
                        asset={asset}
                        index={index}
                        key={`asset-${asset.id}`}
                        onOpen={(next) => setAssetDetailId(next.id)}
                      />
                    ))}
                  </div>
                )}
              </section>
            ))}
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
                  } else if (emptyState.action === "create-project") {
                    setProjectDialog({ mode: "create" });
                  } else if (emptyState.action === "pick-public-assets") {
                    setIsPublicAssetPickerOpen(true);
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
          relationTargets={promptRelationTargets}
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
          relationTargetOptions={relationTargetOptions}
        />
      )}

      {isBackupManagerOpen && (
        <BackupManagerDialog
          lastBackupAt={lastBackupAt}
          onClose={() => setIsBackupManagerOpen(false)}
          onExport={handleExport}
          onImport={handleImport}
          onImportAssets={handleImportAssets}
          existingAssets={assets}
          existingProjects={projects}
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

      {isRulePackImportOpen && (
        <RulePackImportDialog
          activeProjectId={activeProjectId}
          onClose={() => setIsRulePackImportOpen(false)}
          onInstall={handleInstallRulePackFile}
          projects={projects}
        />
      )}

      {isRulePackCreateOpen && (
        <RulePackCreateDialog
          assets={assets.filter(
            (asset) =>
              asset.projectId === activeProjectId &&
              asset.status !== "archived",
          )}
          onClose={() => setIsRulePackCreateOpen(false)}
          onDownload={handleDownloadPackedRulePack}
        />
      )}

      {isPublicAssetPickerOpen && (
        <PublicAssetPickerDrawer
          assets={assets.filter(
            (asset) => asset.projectId === DEFAULT_PROJECT_ID,
          )}
          onClose={() => setIsPublicAssetPickerOpen(false)}
          onPick={handlePickPublicAssets}
          projectName={activeProject?.name ?? "当前项目"}
        />
      )}

      {compileOpenedAt && compileCandidates && compileResult && (
        <RuleCompileDrawer
          candidates={compileCandidates}
          conflicts={compileConflicts}
          drafts={compileResult.drafts}
          isBusy={isLoading}
          onClose={() => {
            setCompileOpenedAt(null);
            setCompileTemplateId("");
          }}
          onExcludeRule={handleExcludeFromCompile}
          onIncludeRule={handleIncludeInCompile}
          onNotify={notify}
          onSaveDraft={handleSaveCompiledDraft}
          onSelectTemplate={setCompileTemplateId}
          packTitles={packTitles}
          pendingVariables={compileResult.pendingVariables}
          projectName={activeProject?.name ?? "当前项目"}
          rulesAppended={compileResult.rulesAppended}
          selectedTemplateId={compileTemplateId}
          templates={templatesInProject}
        />
      )}

      {isGraphViewOpen && activeProjectId && (
        <GraphViewDrawer
          assets={assets}
          nodes={graphNodes}
          onClose={() => setIsGraphViewOpen(false)}
          onCreateNode={(nodeType) =>
            setAssetEditorState({
              mode: "create",
              assetType: "graph_node",
              initialNodeType: nodeType,
            })
          }
          onOpenAsset={(asset) => {
            setIsGraphViewOpen(false);
            setAssetDetailId(asset.id);
          }}
          projectName={activeProject?.name ?? "当前项目"}
        />
      )}

      {isEngineeringImportOpen && activeProjectId && (
        <EngineeringImportDrawer
          dataMode={dataMode}
          documents={assets
            .filter(
              (asset) =>
                asset.projectId === activeProjectId &&
                asset.assetType === "document" &&
                !asset.deletedAt,
            )
            .map((asset) => ({ id: asset.id, title: asset.title }))}
          nodes={graphNodes}
          onClose={() => setIsEngineeringImportOpen(false)}
          onCreateAsset={async (input) => {
            await dataSource.createAsset(input);
          }}
          onImported={async (createdCount) => {
            await reloadAssets();
            notify(`已从现有工程导入 ${createdCount} 个图谱节点。`);
          }}
          projectId={activeProjectId}
          projectName={activeProject?.name ?? "当前项目"}
        />
      )}

      {isEngineeringBaselineOpen && activeProject && (
        <EngineeringBaselineDrawer
          assets={assets}
          onChangeLevel={handleChangeProjectLevel}
          onClose={() => setIsEngineeringBaselineOpen(false)}
          onCreateDocument={handleCreateBaselineDocument}
          onCreateEvidence={handleCreateRequirementEvidence}
          onCreateRelease={handleCreateReleaseRecord}
          onOpenAsset={(assetId) => {
            setIsEngineeringBaselineOpen(false);
            setAssetDetailId(assetId);
          }}
          project={activeProject}
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

      {detailAsset?.assetType === "rule_pack" && (
        <RulePackDetailDrawer
          activeProjectId={activeProjectId}
          key={`pack-detail-${detailAsset.id}`}
          members={listPackMembers(assets, detailAsset.id)}
          onClose={() => setAssetDetailId(null)}
          onExport={handleExportRulePack}
          onInstall={handleInstallRulePack}
          onOpenMember={(asset) => setAssetDetailId(asset.id)}
          pack={detailAsset}
          projects={projects}
        />
      )}

      {detailAsset && isEditableAssetData(detailAsset) && (
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
          onCreateDocumentFromTemplate={handleCreateDocumentFromTemplate}
          onSaveDocumentAsTemplate={(asset) =>
            void handleSaveDocumentAsTemplate(asset)
          }
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
              : `asset-editor-new-${assetEditorState.assetType}-${assetEditorState.initialNodeType ?? ""}-${assetEditorState.initialDocumentType ?? ""}`
          }
          adrOptions={adrOptions}
          graphNodeOptions={graphNodeOptions}
          initialDocumentType={
            assetEditorState.mode === "create"
              ? assetEditorState.initialDocumentType
              : undefined
          }
          initialNodeType={
            assetEditorState.mode === "create"
              ? assetEditorState.initialNodeType
              : undefined
          }
          initialNodeId={
            assetEditorState.mode === "create"
              ? assetEditorState.initialNodeId
              : undefined
          }
          initialGates={
            assetEditorState.mode === "create"
              ? assetEditorState.initialGates
              : undefined
          }
          initialTitle={
            assetEditorState.mode === "create"
              ? assetEditorState.initialTitle
              : undefined
          }
          initialStack={
            assetEditorState.mode === "create"
              ? assetEditorState.initialStack
              : undefined
          }
          initialContent={
            assetEditorState.mode === "create"
              ? assetEditorState.initialContent
              : undefined
          }
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
          hasTechProfile={Boolean(projectTechProfile)}
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
          onOpenTechProfile={() => {
            setProjectDialog(null);
            setAssetEditorState(
              projectTechProfile
                ? { mode: "edit", assetId: projectTechProfile.id }
                : { mode: "create", assetType: "tech_profile" },
            );
          }}
          onDraftTechStack={(stack) => {
            setProjectDialog(null);
            setAssetEditorState({
              mode: "create",
              assetType: "tech_profile",
              initialStack: stack,
            });
          }}
          techStack={
            projectTechProfile?.assetType === "tech_profile"
              ? projectTechProfile.metadata.stack.map((entry) => ({
                  name: entry.name,
                  ...(entry.version ? { version: entry.version } : {}),
                }))
              : []
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
