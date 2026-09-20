"use client";

import {
  AlertTriangle,
  Check,
  Eye,
  FilePenLine,
  LoaderCircle,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import { MarkdownContent } from "@/components/markdown-content";
import {
  promptCategories,
  type PromptCardData,
  type PromptDraft,
} from "@/data/prompts";
import { useModalBehavior } from "@/hooks/use-modal-behavior";
import { diffPromptLines } from "@/lib/prompt-diff";
import type { PromptOptimizeDraft } from "@/lib/prompt-ai";
import type { PromptLibraryResponse } from "@/lib/prompt-api";
import { getMergeErrorMessage } from "@/lib/prompt-merge-draft";
import {
  createOptimizeVersionId,
  normalizeOptimizeDraft,
} from "@/lib/prompt-optimize-draft";
import type { PromptDataSource } from "@/lib/prompt-source";
import { normalizeTags } from "@/lib/prompt-utils";

type PromptOptimizeDrawerProps = {
  prompt: PromptCardData;
  onClose: () => void;
  onSaved: (library: PromptLibraryResponse) => void;
  onNotify: (message: string) => void;
  dataSource: PromptDataSource;
};

type OptimizeResponse = {
  draft?: PromptOptimizeDraft;
  error?: string;
};

type FormErrors = Partial<
  Record<"title" | "category" | "content" | "useCase", string>
>;

const inputClassName =
  "mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

const textareaClassName =
  "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

const VARIABLE_CHANGE_LABELS = {
  added: "新增变量",
  removed: "删除变量",
  normalized: "统一写法",
} as const;

export function PromptOptimizeDrawer({
  prompt,
  onClose,
  onSaved,
  onNotify,
  dataSource,
}: PromptOptimizeDrawerProps) {
  const [instruction, setInstruction] = useState("");
  const [allowVariableChanges, setAllowVariableChanges] = useState(false);
  const [draft, setDraft] = useState<PromptDraft | null>(null);
  const [optimizationSummary, setOptimizationSummary] = useState<string[]>([]);
  const [variableChanges, setVariableChanges] = useState<
    PromptOptimizeDraft["variableChanges"]
  >([]);
  const [tagDraft, setTagDraft] = useState("");
  const [contentMode, setContentMode] = useState<"edit" | "preview">("edit");
  const [showFullDiff, setShowFullDiff] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const isBusy = isGenerating || isSaving;

  useModalBehavior(onClose, isBusy);

  const diff = useMemo(
    () =>
      draft ? diffPromptLines(prompt.content, draft.content) : [],
    [draft, prompt.content],
  );
  const addedCount = diff.filter((line) => line.type === "added").length;
  const removedCount = diff.filter((line) => line.type === "removed").length;
  const changedCount = addedCount + removedCount;
  const visibleDiff = showFullDiff
    ? diff
    : diff.filter((line) => line.type !== "same").slice(0, 12);
  const lengthDelta = draft
    ? draft.content.length - prompt.content.length
    : 0;
  const isShrunk =
    draft !== null &&
    prompt.content.length > 0 &&
    -lengthDelta > prompt.content.length * 0.2;

  function updateDraft(patch: Partial<PromptDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function addTags(rawValue: string) {
    const nextTags = rawValue
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean);

    if (nextTags.length === 0) {
      return;
    }

    updateDraft({ tags: normalizeTags([...(draft?.tags ?? []), ...nextTags]) });
    setTagDraft("");
  }

  function validateForm() {
    const nextErrors: FormErrors = {};

    if (!draft) {
      return false;
    }

    if (!draft.title.trim()) {
      nextErrors.title = "标题不能为空";
    }

    if (!draft.category.trim()) {
      nextErrors.category = "分类不能为空";
    }

    if (!draft.content.trim()) {
      nextErrors.content = "正文不能为空";
    }

    if (!draft.useCase.trim()) {
      nextErrors.useCase = "适用场景不能为空";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleGenerate() {
    if (isBusy) {
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/ai/optimize-prompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          instruction,
          allowVariableChanges,
        }),
      });
      const responseBody = (await response.json().catch(() => {
        throw new SyntaxError("AI 返回内容无法识别，请稍后重试。");
      })) as OptimizeResponse;

      if (
        !response.ok ||
        !responseBody.draft ||
        !Array.isArray(responseBody.draft.optimizationSummary) ||
        responseBody.draft.optimizationSummary.length === 0
      ) {
        throw new Error(
          responseBody.error ?? "AI 优化草稿生成失败，请稍后重试。",
        );
      }

      const nextDraft = responseBody.draft;

      setDraft({
        title: nextDraft.title,
        category: nextDraft.category,
        tags: [...nextDraft.tags],
        content: nextDraft.content,
        useCase: nextDraft.useCase,
      });
      setOptimizationSummary(nextDraft.optimizationSummary);
      setVariableChanges(nextDraft.variableChanges ?? []);
      setShowFullDiff(false);
      onNotify("优化草稿已生成，请确认后保存");
    } catch (error) {
      setErrorMessage(
        getMergeErrorMessage(error, "AI 优化草稿生成失败，请稍后重试。"),
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft || isBusy || !validateForm()) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const library = await dataSource.commitAiOptimize({
        prompt: {
          ...prompt,
          ...normalizeOptimizeDraft(draft),
          updatedAt: new Date().toISOString(),
        },
        versionId: createOptimizeVersionId(),
      });

      onSaved(library);
    } catch (error) {
      setErrorMessage(getMergeErrorMessage(error, "保存优化结果失败。"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        aria-label="关闭 AI 优化"
        className="absolute inset-0 cursor-default bg-slate-950/35 backdrop-blur-[2px]"
        onClick={onClose}
        type="button"
      />

      <aside
        aria-labelledby="prompt-optimize-title"
        aria-modal="true"
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl sm:max-w-3xl"
        role="dialog"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold text-blue-700">AI 优化</p>
            <h2
              className="mt-1 text-lg font-semibold text-slate-950"
              id="prompt-optimize-title"
            >
              {prompt.title}
            </h2>
          </div>

          <button
            aria-label="关闭 AI 优化"
            className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>

        <form
          className="flex flex-1 flex-col overflow-hidden"
          onSubmit={handleSave}
        >
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
            <section className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold text-slate-600">当前提示词</p>
              <p className="mt-1 text-sm text-slate-800">
                {prompt.category}
                {prompt.tags.length > 0 ? ` · ${prompt.tags.join(" / ")}` : ""}
              </p>
              <p className="mt-1 text-xs text-slate-600">{prompt.useCase}</p>
            </section>

            <section>
              <label
                className="text-sm font-medium text-slate-800"
                htmlFor="prompt-optimize-instruction"
              >
                整理要求（可选）
              </label>
              <textarea
                className={textareaClassName}
                id="prompt-optimize-instruction"
                maxLength={2000}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder="例如：统一成 Markdown 小节、保留原有示例"
                rows={3}
                value={instruction}
              />
            </section>

            <section className="flex items-start gap-3 rounded-xl border border-slate-200 px-4 py-3">
              <input
                checked={allowVariableChanges}
                className="mt-1 size-4 rounded border-slate-300"
                id="prompt-optimize-variables"
                onChange={(event) =>
                  setAllowVariableChanges(event.target.checked)
                }
                type="checkbox"
              />
              <label
                className="text-sm text-slate-800"
                htmlFor="prompt-optimize-variables"
              >
                允许调整变量
                <span className="mt-1 block text-xs text-slate-600">
                  勾选后 AI 可以删除牵强变量、改名或补充变量；预览里会列出全部变化。
                  不勾选时，变量只能统一写法，不能增删改名。
                </span>
              </label>
            </section>

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={isBusy}
                onClick={handleGenerate}
                type="button"
              >
                {isGenerating ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin"
                  />
                ) : (
                  <Sparkles aria-hidden="true" className="size-4" />
                )}
                {draft ? "重新生成" : "开始优化"}
              </button>
              <p className="text-xs text-slate-500">
                点击后会把这条提示词的完整内容发送给 AI 服务。
              </p>
            </div>

            {errorMessage && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorMessage}
              </p>
            )}

            {draft && (
              <>
                <section className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                  <p className="text-xs font-semibold text-blue-800">
                    AI 优化说明（只读）
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-blue-900">
                    {optimizationSummary.map((item) => (
                      <li className="flex gap-2" key={item}>
                        <Check
                          aria-hidden="true"
                          className="mt-0.5 size-4 shrink-0"
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                {variableChanges.length > 0 && (
                  <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-xs font-semibold text-amber-900">
                      变量变化
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-amber-900">
                      {variableChanges.map((change) => (
                        <li key={`${change.type}-${change.name}`}>
                          {VARIABLE_CHANGE_LABELS[change.type]}：{change.name}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section className="rounded-xl border border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
                    <p className="text-sm font-medium text-slate-800">
                      正文差异：新增 {addedCount} 行，删除 {removedCount} 行
                    </p>
                    {changedCount > visibleDiff.length && (
                      <button
                        className="text-xs font-medium text-blue-700 hover:text-blue-800"
                        onClick={() => setShowFullDiff(true)}
                        type="button"
                      >
                        展开全文对比
                      </button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto px-4 py-3 font-mono text-xs leading-6">
                    {visibleDiff.length === 0 && (
                      <p className="font-sans text-sm text-slate-500">
                        正文没有变化。
                      </p>
                    )}
                    {visibleDiff.map((line, index) => (
                      <p
                        className={
                          line.type === "added"
                            ? "bg-emerald-50 text-emerald-800"
                            : line.type === "removed"
                              ? "bg-red-50 text-red-700 line-through"
                              : "text-slate-600"
                        }
                        key={`${line.type}-${index}-${line.text}`}
                      >
                        {line.type === "added"
                          ? "+ "
                          : line.type === "removed"
                            ? "- "
                            : "  "}
                        {line.text}
                      </p>
                    ))}
                  </div>
                </section>

                {isShrunk && (
                  <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <AlertTriangle
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0"
                    />
                    优化后的正文比原文短了不少，请确认没有丢掉重要要求。
                  </p>
                )}

                <section className="space-y-4">
                  <div>
                    <label
                      className="text-sm font-medium text-slate-800"
                      htmlFor="prompt-optimize-title-input"
                    >
                      标题
                    </label>
                    <input
                      className={inputClassName}
                      id="prompt-optimize-title-input"
                      maxLength={60}
                      onChange={(event) =>
                        updateDraft({ title: event.target.value })
                      }
                      value={draft.title}
                    />
                    {errors.title && (
                      <p className="mt-1 text-xs text-red-600">{errors.title}</p>
                    )}
                  </div>

                  <div>
                    <label
                      className="text-sm font-medium text-slate-800"
                      htmlFor="prompt-optimize-category-input"
                    >
                      分类
                    </label>
                    <input
                      className={inputClassName}
                      id="prompt-optimize-category-input"
                      list="prompt-optimize-categories"
                      maxLength={30}
                      onChange={(event) =>
                        updateDraft({ category: event.target.value })
                      }
                      value={draft.category}
                    />
                    <datalist id="prompt-optimize-categories">
                      {promptCategories.map((category) => (
                        <option key={category} value={category} />
                      ))}
                    </datalist>
                    {errors.category && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors.category}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      className="text-sm font-medium text-slate-800"
                      htmlFor="prompt-optimize-tags-input"
                    >
                      标签
                    </label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {draft.tags.map((tag) => (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700"
                          key={tag}
                        >
                          {tag}
                          <button
                            aria-label={`移除标签 ${tag}`}
                            className="text-slate-500 hover:text-red-600"
                            onClick={() =>
                              updateDraft({
                                tags: draft.tags.filter(
                                  (item) => item !== tag,
                                ),
                              })
                            }
                            type="button"
                          >
                            <X aria-hidden="true" className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <input
                      className={inputClassName}
                      id="prompt-optimize-tags-input"
                      onChange={(event) => setTagDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === ",") {
                          event.preventDefault();
                          addTags(tagDraft);
                        }
                      }}
                      placeholder="输入后按回车添加"
                      value={tagDraft}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label
                        className="text-sm font-medium text-slate-800"
                        htmlFor="prompt-optimize-content-input"
                      >
                        正文
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          className={`inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium transition ${
                            contentMode === "edit"
                              ? "bg-blue-100 text-blue-800"
                              : "text-slate-600 hover:bg-slate-100"
                          }`}
                          onClick={() => setContentMode("edit")}
                          type="button"
                        >
                          <FilePenLine aria-hidden="true" className="size-3" />
                          编辑
                        </button>
                        <button
                          className={`inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium transition ${
                            contentMode === "preview"
                              ? "bg-blue-100 text-blue-800"
                              : "text-slate-600 hover:bg-slate-100"
                          }`}
                          onClick={() => setContentMode("preview")}
                          type="button"
                        >
                          <Eye aria-hidden="true" className="size-3" />
                          预览
                        </button>
                      </div>
                    </div>

                    {contentMode === "edit" ? (
                      <textarea
                        className={textareaClassName}
                        id="prompt-optimize-content-input"
                        onChange={(event) =>
                          updateDraft({ content: event.target.value })
                        }
                        rows={12}
                        value={draft.content}
                      />
                    ) : (
                      <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-slate-200 px-3 py-2">
                        <MarkdownContent content={draft.content} />
                      </div>
                    )}
                    {errors.content && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors.content}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      className="text-sm font-medium text-slate-800"
                      htmlFor="prompt-optimize-usecase-input"
                    >
                      适用场景
                    </label>
                    <textarea
                      className={textareaClassName}
                      id="prompt-optimize-usecase-input"
                      maxLength={240}
                      onChange={(event) =>
                        updateDraft({ useCase: event.target.value })
                      }
                      rows={2}
                      value={draft.useCase}
                    />
                    {errors.useCase && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors.useCase}
                      </p>
                    )}
                  </div>
                </section>
              </>
            )}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 sm:px-6">
            <p className="text-xs text-slate-500">
              保存后会保留优化前版本，30 天内可以回到优化前。
            </p>
            <div className="flex items-center gap-2">
              <button
                className="h-10 rounded-lg px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
                onClick={onClose}
                type="button"
              >
                取消
              </button>
              <button
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={!draft || isBusy}
                type="submit"
              >
                {isSaving ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin"
                  />
                ) : (
                  <Save aria-hidden="true" className="size-4" />
                )}
                保存优化结果
              </button>
            </div>
          </footer>
        </form>
      </aside>
    </div>
  );
}
