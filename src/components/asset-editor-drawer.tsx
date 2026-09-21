"use client";

import { FileText, ListChecks, LoaderCircle, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import {
  ruleScopes,
  ruleTypes,
  type AssetStatus,
  type RuleScope,
  type RuleType,
} from "@/data/assets";
import { useModalBehavior } from "@/hooks/use-modal-behavior";
import {
  ASSET_TITLE_MAX_LENGTH,
  assetToDraft,
  createEmptyAssetDraft,
  editableAssetStatuses,
  validateAssetDraft,
  type AssetDraft,
  type EditableAssetData,
  type EditableAssetType,
} from "@/lib/asset-draft";
import {
  assetStatusLabels,
  documentTypeOptions,
  ruleScopeLabels,
  ruleTypeLabels,
} from "@/lib/asset-list";

type AssetEditorDrawerProps = {
  assetType: EditableAssetType;
  asset: EditableAssetData | null;
  onClose: () => void;
  onSave: (draft: AssetDraft) => Promise<void>;
};

const inputClassName =
  "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

const labelClassName = "text-sm font-semibold text-slate-700";

export function AssetEditorDrawer({
  assetType,
  asset,
  onClose,
  onSave,
}: AssetEditorDrawerProps) {
  const [draft, setDraft] = useState<AssetDraft>(() =>
    asset ? assetToDraft(asset) : createEmptyAssetDraft(assetType),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useModalBehavior(isSaving ? () => undefined : onClose, isSaving);

  const typeLabel = assetType === "rule" ? "规则" : "文档";
  const isEditing = Boolean(asset);

  function updateDraft(patch: Record<string, unknown>) {
    setDraft((current) => ({ ...current, ...patch }) as AssetDraft);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validateAssetDraft(draft);

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      await onSave(draft);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : `保存${typeLabel}失败。`,
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label={`关闭${typeLabel}编辑器`}
        className="absolute inset-0 cursor-default bg-slate-950/35 backdrop-blur-[2px]"
        onClick={isSaving ? undefined : onClose}
        type="button"
      />

      <aside
        aria-labelledby="asset-editor-title"
        aria-modal="true"
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl sm:max-w-2xl"
        role="dialog"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              {assetType === "rule" ? (
                <ListChecks aria-hidden="true" className="size-5" />
              ) : (
                <FileText aria-hidden="true" className="size-5" />
              )}
            </span>
            <div>
              <h2
                className="text-base font-semibold text-slate-950"
                id="asset-editor-title"
              >
                {isEditing ? `编辑${typeLabel}` : `新增${typeLabel}`}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                正式保存后会产生一个不可变版本
              </p>
            </div>
          </div>

          <button
            aria-label={`关闭${typeLabel}编辑器`}
            className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={handleSubmit}
        >
          <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-6">
            <label className="flex flex-col gap-2">
              <span className={labelClassName}>标题</span>
              <input
                className={inputClassName}
                maxLength={ASSET_TITLE_MAX_LENGTH}
                onChange={(event) => updateDraft({ title: event.target.value })}
                placeholder={
                  assetType === "rule"
                    ? "例如：提交前必须通过完整检查"
                    : "例如：2.0.0 项目资产底座设计"
                }
                value={draft.title}
              />
            </label>

            <label className="mt-5 flex flex-col gap-2">
              <span className={labelClassName}>一句话说明</span>
              <textarea
                className="min-h-20 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                onChange={(event) =>
                  updateDraft({ summary: event.target.value })
                }
                placeholder="留空时列表会显示正文首行"
                value={draft.summary}
              />
            </label>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {draft.assetType === "rule" ? (
                <>
                  <label className="flex flex-col gap-2">
                    <span className={labelClassName}>规则类型</span>
                    <select
                      className={inputClassName}
                      onChange={(event) =>
                        updateDraft({
                          ruleType: event.target.value as RuleType,
                        })
                      }
                      value={draft.ruleType}
                    >
                      {ruleTypes.map((ruleType) => (
                        <option key={ruleType} value={ruleType}>
                          {ruleTypeLabels[ruleType]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-2">
                    <span className={labelClassName}>适用范围</span>
                    <select
                      className={inputClassName}
                      onChange={(event) =>
                        updateDraft({ scope: event.target.value as RuleScope })
                      }
                      value={draft.scope}
                    >
                      {ruleScopes.map((scope) => (
                        <option key={scope} value={scope}>
                          {ruleScopeLabels[scope]}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <label className="flex flex-col gap-2">
                  <span className={labelClassName}>文档类型</span>
                  <select
                    className={inputClassName}
                    onChange={(event) =>
                      updateDraft({ documentType: event.target.value })
                    }
                    value={draft.documentType}
                  >
                    {documentTypeOptions.map((documentType) => (
                      <option key={documentType} value={documentType}>
                        {documentType}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="flex flex-col gap-2">
                <span className={labelClassName}>状态</span>
                <select
                  className={inputClassName}
                  onChange={(event) =>
                    updateDraft({
                      status: event.target.value as AssetStatus,
                    })
                  }
                  value={draft.status}
                >
                  {editableAssetStatuses.map((status) => (
                    <option key={status} value={status}>
                      {assetStatusLabels[status]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {draft.status !== "active" && (
              <p className="mt-3 rounded-lg bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
                列表默认只显示活跃资产，保存后可以在状态筛选里找到这条记录。
              </p>
            )}

            <label className="mt-5 flex flex-col gap-2">
              <span className={labelClassName}>
                {assetType === "rule" ? "规则正文" : "文档正文"}
              </span>
              <textarea
                className="min-h-72 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm leading-7 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                onChange={(event) =>
                  updateDraft({ content: event.target.value })
                }
                placeholder="支持 Markdown"
                value={draft.content}
              />
            </label>

            {errorMessage && (
              <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </p>
            )}
          </div>

          <footer className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-4 sm:px-6">
            <button
              className="h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSaving}
              onClick={onClose}
              type="button"
            >
              取消
            </button>
            <button
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={isSaving}
              type="submit"
            >
              {isSaving && (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 animate-spin"
                />
              )}
              {isEditing ? "保存修改" : `创建${typeLabel}`}
            </button>
          </footer>
        </form>
      </aside>
    </div>
  );
}
