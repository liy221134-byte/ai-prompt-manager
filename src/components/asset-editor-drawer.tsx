"use client";

import { FileText, ListChecks, LoaderCircle, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import {
  ruleScopes,
  ruleTypes,
  ruleLevels,
  ruleStages,
  rulePriorities,
  ruleLifecycles,
  ruleOverrideScopes,
  documentRoles,
  type AssetStatus,
  type DocumentRole,
  type RuleLevel,
  type RuleLifecycle,
  type RuleOverrideScope,
  type RulePriority,
  type RuleScope,
  type RuleStage,
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
  // 可以关联的 ADR 文档；偏离默认选型时必须选一条
  adrOptions?: Array<{ id: string; title: string }>;
  onClose: () => void;
  onSave: (draft: AssetDraft) => Promise<void>;
};

const inputClassName =
  "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

const labelClassName = "text-sm font-semibold text-slate-700";

const ruleLevelLabels: Record<RuleLevel, string> = {
  global: "全局",
  module: "模块",
  task: "任务",
  code: "代码",
};

const ruleStageLabels: Record<RuleStage, string> = {
  plan: "计划",
  implement: "实施",
  verify: "验证",
  release: "发布",
};

const rulePriorityLabels: Record<RulePriority, string> = {
  must: "必须",
  should: "应当",
  may: "可选",
};

const ruleLifecycleLabels: Record<RuleLifecycle, string> = {
  draft: "草稿",
  active: "活跃",
  deprecated: "已废弃",
  archived: "已归档",
};

const ruleOverrideScopeLabels: Record<RuleOverrideScope, string> = {
  none: "不允许覆盖",
  project: "项目内可覆盖",
  task: "任务内可覆盖",
};

const documentRoleLabels: Record<DocumentRole, string> = {
  source: "来源",
  working: "工作稿",
  authoritative: "权威版",
  compiled: "编译结果",
};

// 扩展元数据都是选填，这里统一用「未填写」的空值选项
function OptionalSelect<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: T | "";
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T | "") => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className={labelClassName}>{label}</span>
      <select
        className={inputClassName}
        onChange={(event) => onChange(event.target.value as T | "")}
        value={value}
      >
        <option value="">未填写</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option]}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className={labelClassName}>{label}</span>
      <input
        className={inputClassName}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

export function AssetEditorDrawer({
  assetType,
  asset,
  adrOptions = [],
  onClose,
  onSave,
}: AssetEditorDrawerProps) {
  const [draft, setDraft] = useState<AssetDraft>(() =>
    asset ? assetToDraft(asset) : createEmptyAssetDraft(assetType),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useModalBehavior(isSaving ? () => undefined : onClose, isSaving);

  const typeLabel =
    assetType === "rule"
      ? "规则"
      : assetType === "document"
        ? "文档"
        : "技术档案";
  const isEditing = Boolean(asset);

  function updateDraft(patch: Record<string, unknown>) {
    setDraft((current) => ({ ...current, ...patch }) as AssetDraft);
  }

  function updateStackRow(key: string, patch: Record<string, unknown>) {
    setDraft((current) =>
      current.assetType === "tech_profile"
        ? {
            ...current,
            stack: current.stack.map((row) =>
              row.key === key ? { ...row, ...patch } : row,
            ),
          }
        : current,
    );
  }

  function addStackRow() {
    setDraft((current) =>
      current.assetType === "tech_profile"
        ? {
            ...current,
            stack: [
              ...current.stack,
              {
                key: `stack-${Date.now()}-${current.stack.length}`,
                name: "",
                version: "",
                purpose: "",
                isDeviation: false,
                adrAssetId: "",
              },
            ],
          }
        : current,
    );
  }

  function removeStackRow(key: string) {
    setDraft((current) =>
      current.assetType === "tech_profile"
        ? {
            ...current,
            stack: current.stack.filter((row) => row.key !== key),
          }
        : current,
    );
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
              ) : draft.assetType === "document" ? (
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
              ) : (
                <p className="text-sm leading-6 text-slate-500 sm:col-span-2">
                  技术档案的基础字段在下面的「技术栈清单」里填，选型说明写在正文。
                </p>
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

            <details className="mt-5 rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                扩展元数据（都可以留空）
              </summary>

              {draft.assetType === "rule" ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <TextField
                    label="用途"
                    onChange={(value) => updateDraft({ purpose: value })}
                    placeholder="这条规则用来解决什么问题"
                    value={draft.purpose}
                  />
                  <TextField
                    label="技术上下文"
                    onChange={(value) => updateDraft({ techContext: value })}
                    placeholder="多个用逗号分隔，例如：Next.js，SQLite"
                    value={draft.techContext}
                  />
                  <OptionalSelect
                    label="作用层级"
                    labels={ruleLevelLabels}
                    onChange={(value) => updateDraft({ level: value })}
                    options={ruleLevels}
                    value={draft.level}
                  />
                  <OptionalSelect
                    label="执行阶段"
                    labels={ruleStageLabels}
                    onChange={(value) => updateDraft({ stage: value })}
                    options={ruleStages}
                    value={draft.stage}
                  />
                  <OptionalSelect
                    label="优先级"
                    labels={rulePriorityLabels}
                    onChange={(value) => updateDraft({ priority: value })}
                    options={rulePriorities}
                    value={draft.priority}
                  />
                  <OptionalSelect
                    label="生命周期"
                    labels={ruleLifecycleLabels}
                    onChange={(value) => updateDraft({ lifecycle: value })}
                    options={ruleLifecycles}
                    value={draft.lifecycle}
                  />
                  <OptionalSelect
                    label="覆盖权限"
                    labels={ruleOverrideScopeLabels}
                    onChange={(value) => updateDraft({ overrideScope: value })}
                    options={ruleOverrideScopes}
                    value={draft.overrideScope}
                  />
                  <TextField
                    label="来源证据"
                    onChange={(value) => updateDraft({ evidence: value })}
                    placeholder="这条规则是从哪里来的"
                    value={draft.evidence}
                  />
                  <TextField
                    label="验证方式"
                    onChange={(value) => updateDraft({ verification: value })}
                    placeholder="怎么确认这条规则被遵守了"
                    value={draft.verification}
                  />
                </div>
              ) : draft.assetType === "document" ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <OptionalSelect
                    label="文档角色"
                    labels={documentRoleLabels}
                    onChange={(value) => updateDraft({ role: value })}
                    options={documentRoles}
                    value={draft.role}
                  />
                  <TextField
                    label="所属模块"
                    onChange={(value) => updateDraft({ module: value })}
                    placeholder="这份文档属于哪个模块"
                    value={draft.module}
                  />
                  <TextField
                    label="生效版本"
                    onChange={(value) => updateDraft({ effectiveVersion: value })}
                    placeholder="例如：2.1.1"
                    value={draft.effectiveVersion}
                  />
                  <TextField
                    label="来源位置"
                    onChange={(value) => updateDraft({ sourceLocation: value })}
                    placeholder="例如：docs/product-brief.md"
                    value={draft.sourceLocation}
                  />
                  <TextField
                    label="更新触发条件"
                    onChange={(value) => updateDraft({ updateTrigger: value })}
                    placeholder="什么情况下需要更新这份文档"
                    value={draft.updateTrigger}
                  />
                  <TextField
                    label="新鲜度"
                    onChange={(value) => updateDraft({ freshness: value })}
                    placeholder="例如：30 天"
                    value={draft.freshness}
                  />
                  <TextField
                    label="最后验证时间"
                    onChange={(value) => updateDraft({ lastVerifiedAt: value })}
                    placeholder="例如：2026-09-22"
                    value={draft.lastVerifiedAt}
                  />
                  <label className="flex flex-col gap-2">
                    <span className={labelClassName}>是否权威来源</span>
                    <span className="flex h-11 items-center gap-2 text-sm text-slate-700">
                      <input
                        checked={draft.authority}
                        className="size-4"
                        onChange={(event) =>
                          updateDraft({ authority: event.target.checked })
                        }
                        type="checkbox"
                      />
                      这份文档是权威依据
                    </span>
                  </label>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">
                  技术档案暂时没有额外的元数据字段。
                </p>
              )}
            </details>

            {draft.status !== "active" && (
              <p className="mt-3 rounded-lg bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
                列表默认只显示活跃资产，保存后可以在状态筛选里找到这条记录。
              </p>
            )}

            {draft.assetType === "tech_profile" && (
              <section className="mt-5 rounded-lg border border-slate-200 px-4 py-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">
                    技术栈清单
                  </h3>
                  <button
                    className="text-xs font-semibold text-blue-700 hover:underline"
                    onClick={addStackRow}
                    type="button"
                  >
                    新增一行
                  </button>
                </div>

                {draft.stack.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-500">
                    还没有技术栈，点「新增一行」开始填。
                  </p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-3">
                    {draft.stack.map((row) => (
                      <li
                        className="rounded-lg border border-slate-200 px-3 py-3"
                        key={row.key}
                      >
                        <div className="grid gap-3 sm:grid-cols-3">
                          <input
                            aria-label="技术名称"
                            className={inputClassName}
                            onChange={(event) =>
                              updateStackRow(row.key, {
                                name: event.target.value,
                              })
                            }
                            placeholder="技术名称"
                            value={row.name}
                          />
                          <input
                            aria-label="版本"
                            className={inputClassName}
                            onChange={(event) =>
                              updateStackRow(row.key, {
                                version: event.target.value,
                              })
                            }
                            placeholder="版本，可留空"
                            value={row.version}
                          />
                          <input
                            aria-label="用途"
                            className={inputClassName}
                            onChange={(event) =>
                              updateStackRow(row.key, {
                                purpose: event.target.value,
                              })
                            }
                            placeholder="用来做什么"
                            value={row.purpose}
                          />
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <label className="flex items-center gap-2 text-xs text-slate-600">
                            <input
                              checked={row.isDeviation}
                              onChange={(event) =>
                                updateStackRow(row.key, {
                                  isDeviation: event.target.checked,
                                })
                              }
                              type="checkbox"
                            />
                            偏离默认选型
                          </label>

                          {row.isDeviation && (
                            <select
                              aria-label="关联 ADR"
                              className="h-9 rounded-lg border border-slate-300 px-2 text-sm"
                              onChange={(event) =>
                                updateStackRow(row.key, {
                                  adrAssetId: event.target.value,
                                })
                              }
                              value={row.adrAssetId}
                            >
                              <option value="">选择 ADR（必填）</option>
                              {adrOptions.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.title}
                                </option>
                              ))}
                            </select>
                          )}

                          <button
                            className="ml-auto text-xs font-semibold text-red-600 hover:underline"
                            onClick={() => removeStackRow(row.key)}
                            type="button"
                          >
                            删除这一行
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {adrOptions.length === 0 && (
                  <p className="mt-3 text-xs text-slate-500">
                    当前项目还没有 ADR 文档。要标记偏离默认选型，先在「文档」里新增一条类型为
                    ADR 的文档。
                  </p>
                )}
              </section>
            )}

            <label className="mt-5 flex flex-col gap-2">
              <span className={labelClassName}>
                {assetType === "rule"
                  ? "规则正文"
                  : assetType === "document"
                    ? "文档正文"
                    : "选型说明"}
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
