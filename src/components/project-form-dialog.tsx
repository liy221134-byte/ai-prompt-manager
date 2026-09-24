"use client";

import {
  Archive,
  FolderPlus,
  Layers3,
  LoaderCircle,
  RotateCcw,
  Settings2,
  X,
} from "lucide-react";
import { useState } from "react";

import {
  projectRiskLevelOptions,
  projectStageOptions,
  type ProjectData,
  type ProjectRiskLevel,
  type ProjectStage,
} from "@/data/projects";
import { useModalBehavior } from "@/hooks/use-modal-behavior";
import { assetTypeDescriptions } from "@/lib/asset-list";

export type ProjectFormValues = {
  name: string;
  description: string;
  stage: ProjectStage;
  riskLevel: ProjectRiskLevel;
};

type ProjectFormDialogProps = {
  mode: "create" | "edit";
  project: ProjectData | null;
  hasTechProfile?: boolean;
  onClose: () => void;
  onSubmit: (values: ProjectFormValues) => Promise<void>;
  onArchive?: () => Promise<void>;
  onReactivate?: () => Promise<void>;
  onOpenTechProfile?: () => void;
};

export function ProjectFormDialog({
  mode,
  project,
  hasTechProfile = false,
  onClose,
  onSubmit,
  onArchive,
  onReactivate,
  onOpenTechProfile,
}: ProjectFormDialogProps) {
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [stage, setStage] = useState<ProjectStage>(
    project?.stage ?? "development",
  );
  const [riskLevel, setRiskLevel] = useState<ProjectRiskLevel>(
    project?.riskLevel ?? "personal",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useModalBehavior(isSubmitting ? () => undefined : onClose, isSubmitting);

  const isEdit = mode === "edit";
  const isArchived = project?.status === "archived";

  async function runAction(action: () => Promise<void>, fallbackMessage: string) {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await action();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : fallbackMessage,
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim()) {
      setErrorMessage("请先填写项目名称。");
      return;
    }

    await runAction(
      () => onSubmit({ name, description, stage, riskLevel }),
      isEdit ? "项目更新失败。" : "项目创建失败。",
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-5">
      <button
        aria-label="关闭项目设置"
        className="absolute inset-0 cursor-default bg-slate-950/45 backdrop-blur-[2px]"
        onClick={isSubmitting ? undefined : onClose}
        type="button"
      />

      <section
        aria-labelledby="project-dialog-title"
        aria-modal="true"
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-2xl"
        role="dialog"
      >
        <button
          aria-label="关闭项目设置"
          className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isSubmitting}
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" className="size-5" />
        </button>

        <span className="flex size-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
          {isEdit ? (
            <Settings2 aria-hidden="true" className="size-5" />
          ) : (
            <FolderPlus aria-hidden="true" className="size-5" />
          )}
        </span>

        <h2
          className="mt-5 text-lg font-semibold text-slate-950"
          id="project-dialog-title"
        >
          {isEdit ? "项目设置" : "新建项目"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {isEdit
            ? "项目只能归档，不能删除。归档后资产仍然保留。"
            : "新项目从空状态开始，不会复制默认项目的资产。"}
        </p>

        <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-slate-700">
              项目名称
            </span>
            <input
              autoFocus
              className="h-11 rounded-lg border border-[#dbe7f5] bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：资产底座 2.0"
              value={name}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-slate-700">
              项目目标
            </span>
            <textarea
              className="min-h-20 rounded-lg border border-[#dbe7f5] bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              onChange={(event) => setDescription(event.target.value)}
              placeholder="一句话说明这个项目要解决什么问题"
              value={description}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-slate-700">
              当前阶段
            </span>
            <select
              className="h-11 rounded-lg border border-[#dbe7f5] bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              onChange={(event) =>
                setStage(event.target.value as ProjectStage)
              }
              value={stage}
            >
              {projectStageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-slate-700">
              质量等级
            </span>
            <select
              className="h-11 rounded-lg border border-[#dbe7f5] bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              onChange={(event) =>
                setRiskLevel(event.target.value as ProjectRiskLevel)
              }
              value={riskLevel}
            >
              {projectRiskLevelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="text-xs leading-5 text-slate-500">
              等级决定这个项目该有哪些工程文档、发布前要做哪些检查。
              工具栏「工程基线」里能看到缺口对照。
            </span>
          </label>

          {errorMessage && (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <button
              className="h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSubmitting}
              onClick={onClose}
              type="button"
            >
              取消
            </button>
            <button
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting && (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 animate-spin"
                />
              )}
              {isEdit ? "保存修改" : "创建项目"}
            </button>
          </div>
        </form>

        {isEdit && onOpenTechProfile && (
          <section className="mt-6 rounded-lg border border-[#dbe7f5] bg-slate-50 px-4 py-4">
            <h3 className="text-sm font-semibold text-slate-700">技术档案</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {assetTypeDescriptions.tech_profile}
            </p>
            <button
              className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg border border-[#dbe7f5] bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSubmitting}
              onClick={onOpenTechProfile}
              type="button"
            >
              <Layers3 aria-hidden="true" className="size-4" />
              {hasTechProfile ? "打开技术档案" : "新建技术档案"}
            </button>
          </section>
        )}

        {isEdit && (onArchive || onReactivate) && (
          <div className="mt-6 border-t border-slate-100 pt-5">
            <p className="text-sm font-semibold text-slate-700">
              {isArchived ? "重新激活项目" : "归档项目"}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              {isArchived
                ? "重新激活后，项目会回到进行中列表，资产不变。"
                : "归档后项目移出进行中列表，资产和历史记录都会保留。"}
            </p>

            {isArchived ? (
              <button
                className="mt-3 inline-flex h-11 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSubmitting}
                onClick={() =>
                  void runAction(
                    onReactivate ?? (async () => undefined),
                    "重新激活项目失败。",
                  )
                }
                type="button"
              >
                <RotateCcw aria-hidden="true" className="size-4" />
                重新激活项目
              </button>
            ) : confirmingArchive ? (
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  className="inline-flex h-11 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={isSubmitting}
                  onClick={() =>
                    void runAction(
                      onArchive ?? (async () => undefined),
                      "归档项目失败。",
                    )
                  }
                  type="button"
                >
                  <Archive aria-hidden="true" className="size-4" />
                  确认归档
                </button>
                <button
                  className="h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isSubmitting}
                  onClick={() => setConfirmingArchive(false)}
                  type="button"
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                className="mt-3 inline-flex h-11 items-center gap-2 rounded-lg border border-[#dbe7f5] bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:border-red-300 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSubmitting}
                onClick={() => setConfirmingArchive(true)}
                type="button"
              >
                <Archive aria-hidden="true" className="size-4" />
                归档项目
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
