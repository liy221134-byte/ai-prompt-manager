"use client";

import {
  Eye,
  FilePenLine,
  GitMerge,
  LoaderCircle,
  Plus,
  Save,
  Sparkles,
  Target,
  WandSparkles,
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
import type { PromptMergeDraft } from "@/lib/prompt-ai";
import type { PromptLibraryResponse } from "@/lib/prompt-api";
import { createMergeVersion } from "@/lib/prompt-merge-draft";
import type { PromptDataSource } from "@/lib/prompt-source";
import { normalizeTags } from "@/lib/prompt-utils";

type AiMergeDrawerProps = {
  prompts: PromptCardData[];
  targetPromptId: string;
  onClose: () => void;
  onSaved: (library: PromptLibraryResponse) => void;
  onNotify: (message: string) => void;
  dataSource: PromptDataSource;
};

type MergeResponse = {
  draft?: PromptMergeDraft;
  error?: string;
};

type FormErrors = Partial<
  Record<"title" | "category" | "content" | "useCase", string>
>;

const inputClassName =
  "mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export function AiMergeDrawer({
  prompts,
  targetPromptId,
  onClose,
  onSaved,
  onNotify,
  dataSource,
}: AiMergeDrawerProps) {
  const target = useMemo(
    () =>
      prompts.find((prompt) => prompt.id === targetPromptId) ??
      prompts[0] ??
      null,
    [prompts, targetPromptId],
  );
  const sourceCount = Math.max(0, prompts.length - 1);
  const [mergeInstruction, setMergeInstruction] = useState("");
  const [draft, setDraft] = useState<PromptDraft | null>(null);
  const [mergeSummary, setMergeSummary] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [contentMode, setContentMode] = useState<"edit" | "preview">("edit");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});

  useModalBehavior(onClose);

  function addTags(rawValue: string) {
    const nextTags = rawValue
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean);

    if (nextTags.length === 0) {
      return;
    }

    setDraft((currentDraft) =>
      currentDraft
        ? {
            ...currentDraft,
            tags: normalizeTags([...currentDraft.tags, ...nextTags]).slice(
              0,
              12,
            ),
          }
        : currentDraft,
    );
    setTagDraft("");
  }

  function removeTag(tagToRemove: string) {
    setDraft((currentDraft) =>
      currentDraft
        ? {
            ...currentDraft,
            tags: currentDraft.tags.filter((tag) => tag !== tagToRemove),
          }
        : currentDraft,
    );
  }

  function validateForm() {
    const nextErrors: FormErrors = {};

    if (!draft) {
      return false;
    }

    if (!draft.title.trim()) {
      nextErrors.title = "请填写提示词标题";
    } else if (draft.title.trim().length > 60) {
      nextErrors.title = "标题最多 60 个字";
    }

    if (!draft.category.trim()) {
      nextErrors.category = "请填写提示词分类";
    }

    if (!draft.useCase.trim()) {
      nextErrors.useCase = "请填写适用场景";
    }

    if (!draft.content.trim()) {
      nextErrors.content = "请填写提示词正文";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleGenerate() {
    if (prompts.length < 2 || isGenerating) {
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/ai/merge-prompts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompts,
          mergeInstruction,
        }),
      });
      const responseBody = (await response.json()) as MergeResponse;

      if (
        !response.ok ||
        !responseBody.draft ||
        !Array.isArray(responseBody.draft.mergeSummary) ||
        responseBody.draft.mergeSummary.length === 0
      ) {
        throw new Error(
          responseBody.error ?? "AI 合并草稿生成失败，请稍后重试。",
        );
      }

      const {
        mergeSummary: nextMergeSummary,
        ...editableDraft
      } = responseBody.draft;

      setDraft({
        ...editableDraft,
        tags: [...editableDraft.tags],
      });
      setMergeSummary(nextMergeSummary);
      onNotify("AI 合并草稿已生成，请确认后保存");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "AI 合并草稿生成失败，请稍后重试。",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft || !target || prompts.length < 2 || !validateForm()) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const now = new Date().toISOString();
    const sourcePromptIds = prompts.map((prompt) => prompt.id);
    const version = createMergeVersion({
      target,
      sourcePromptIds,
      createdAt: now,
    });

    try {
      const library = await dataSource.commitAiMerge({
        prompt: {
          ...target,
          ...draft,
          tags: normalizeTags(draft.tags),
          updatedAt: now,
        },
        sourcePromptIds,
        version,
      });

      onSaved(library);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "保存合并结果失败。",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const saveDisabled = !draft || !target || prompts.length < 2 || isSaving;
  const targetTitle = draft?.title.trim() || target?.title || "目标提示词";

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="关闭 AI 合并面板"
        className="absolute inset-0 cursor-default bg-slate-950/35 backdrop-blur-[2px]"
        onClick={onClose}
        type="button"
      />

      <aside
        aria-labelledby="ai-merge-title"
        aria-modal="true"
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl sm:max-w-2xl"
        role="dialog"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <GitMerge aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-xs font-semibold text-blue-700">AI 合并</p>
              <h2
                className="mt-1 text-lg font-semibold text-slate-950"
                id="ai-merge-title"
              >
                生成并确认合并结果
              </h2>
            </div>
          </div>

          <button
            aria-label="关闭 AI 合并面板"
            className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={handleSave}
        >
          <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-6">
            <section aria-label="已选提示词">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  已选提示词
                </h3>
                <span className="text-xs text-slate-500">
                  目标：{target?.title ?? "未选择"}
                </span>
              </div>

              <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                {prompts.map((prompt) => {
                  const isTarget = prompt.id === target?.id;

                  return (
                    <div
                      className={`flex items-start gap-3 px-4 py-3 ${
                        isTarget ? "bg-blue-50/70" : "bg-white"
                      }`}
                      key={prompt.id}
                    >
                      <span
                        className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md ${
                          isTarget
                            ? "bg-blue-600 text-white"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        <Target aria-hidden="true" className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-semibold text-slate-900">
                            {prompt.title}
                          </h4>
                          <span className="text-xs text-slate-500">
                            {prompt.category}
                          </span>
                          {isTarget && (
                            <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
                              目标
                            </span>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                          {prompt.useCase}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="mt-7 border-t border-slate-200 pt-7">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  合并要求（可选）
                </span>
                <textarea
                  className="mt-2 min-h-24 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  maxLength={2000}
                  onChange={(event) => setMergeInstruction(event.target.value)}
                  placeholder="例如：合并成通用版本，并保留严格的输出格式"
                  value={mergeInstruction}
                />
              </label>

              <div className="mt-3 flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Sparkles aria-hidden="true" className="size-3.5" />
                  内容将发送到已配置的 AI 服务生成草稿。
                </span>
                <button
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={isGenerating || prompts.length < 2}
                  onClick={handleGenerate}
                  type="button"
                >
                  {isGenerating ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                  ) : (
                    <WandSparkles aria-hidden="true" className="size-4" />
                  )}
                  {isGenerating ? "正在生成" : "生成合并草稿"}
                </button>
              </div>
            </section>

            {errorMessage && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
                {errorMessage}
              </p>
            )}

            {draft ? (
              <section className="mt-7 border-t border-slate-200 pt-7">
                <h3 className="text-sm font-semibold text-slate-900">
                  确认合并草稿
                </h3>

                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="text-sm font-medium text-slate-700">
                      标题
                    </span>
                    <input
                      aria-invalid={Boolean(errors.title)}
                      className={inputClassName}
                      maxLength={60}
                      onChange={(event) => {
                        setDraft((currentDraft) =>
                          currentDraft
                            ? { ...currentDraft, title: event.target.value }
                            : currentDraft,
                        );
                        setErrors((currentErrors) => ({
                          ...currentErrors,
                          title: undefined,
                        }));
                      }}
                      placeholder="合并后的提示词标题"
                      value={draft.title}
                    />
                    {errors.title && (
                      <span className="mt-1.5 block text-xs text-red-600">
                        {errors.title}
                      </span>
                    )}
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">
                      分类
                    </span>
                    <input
                      aria-invalid={Boolean(errors.category)}
                      className={inputClassName}
                      list="ai-merge-category-options"
                      onChange={(event) => {
                        setDraft((currentDraft) =>
                          currentDraft
                            ? { ...currentDraft, category: event.target.value }
                            : currentDraft,
                        );
                        setErrors((currentErrors) => ({
                          ...currentErrors,
                          category: undefined,
                        }));
                      }}
                      placeholder="例如：产品设计"
                      value={draft.category}
                    />
                    <datalist id="ai-merge-category-options">
                      {promptCategories.map((categoryOption) => (
                        <option key={categoryOption} value={categoryOption} />
                      ))}
                    </datalist>
                    {errors.category && (
                      <span className="mt-1.5 block text-xs text-red-600">
                        {errors.category}
                      </span>
                    )}
                  </label>

                  <div className="block">
                    <span className="text-sm font-medium text-slate-700">
                      标签
                    </span>
                    <div className="mt-2 flex min-h-11 flex-wrap items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 transition focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
                      {draft.tags.map((tag) => (
                        <button
                          className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
                          key={tag}
                          onClick={() => removeTag(tag)}
                          title={`删除标签 ${tag}`}
                          type="button"
                        >
                          {tag}
                          <X aria-hidden="true" className="size-3" />
                        </button>
                      ))}
                      <input
                        className="h-7 min-w-24 flex-1 bg-transparent text-sm text-slate-900 outline-none"
                        maxLength={20}
                        onBlur={() => addTags(tagDraft)}
                        onChange={(event) => setTagDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === ",") {
                            event.preventDefault();
                            addTags(tagDraft);
                          }
                        }}
                        placeholder="添加标签"
                        value={tagDraft}
                      />
                      <button
                        aria-label="添加标签"
                        className="flex size-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-blue-700"
                        onClick={() => addTags(tagDraft)}
                        type="button"
                      >
                        <Plus aria-hidden="true" className="size-4" />
                      </button>
                    </div>
                  </div>

                  <label className="block sm:col-span-2">
                    <span className="text-sm font-medium text-slate-700">
                      适用场景
                    </span>
                    <textarea
                      aria-invalid={Boolean(errors.useCase)}
                      className="mt-2 min-h-24 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      maxLength={240}
                      onChange={(event) => {
                        setDraft((currentDraft) =>
                          currentDraft
                            ? { ...currentDraft, useCase: event.target.value }
                            : currentDraft,
                        );
                        setErrors((currentErrors) => ({
                          ...currentErrors,
                          useCase: undefined,
                        }));
                      }}
                      placeholder="说明合并后的提示词最适合解决什么问题"
                      value={draft.useCase}
                    />
                    {errors.useCase && (
                      <span className="mt-1.5 block text-xs text-red-600">
                        {errors.useCase}
                      </span>
                    )}
                  </label>
                </div>

                <div className="mt-6">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-medium text-slate-700">
                      正文
                    </span>
                    <div
                      aria-label="正文显示方式"
                      className="flex rounded-lg border border-slate-200 bg-slate-50 p-1"
                      role="tablist"
                    >
                      <button
                        aria-selected={contentMode === "edit"}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition ${
                          contentMode === "edit"
                            ? "bg-white text-blue-700 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                        onClick={() => setContentMode("edit")}
                        role="tab"
                        type="button"
                      >
                        <FilePenLine aria-hidden="true" className="size-3.5" />
                        编辑
                      </button>
                      <button
                        aria-selected={contentMode === "preview"}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition ${
                          contentMode === "preview"
                            ? "bg-white text-blue-700 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                        onClick={() => setContentMode("preview")}
                        role="tab"
                        type="button"
                      >
                        <Eye aria-hidden="true" className="size-3.5" />
                        预览
                      </button>
                    </div>
                  </div>

                  {contentMode === "edit" ? (
                    <textarea
                      aria-invalid={Boolean(errors.content)}
                      className="mt-3 min-h-[340px] w-full resize-y rounded-lg border border-slate-300 bg-slate-50 px-4 py-4 font-mono text-sm leading-7 text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                      onChange={(event) => {
                        setDraft((currentDraft) =>
                          currentDraft
                            ? { ...currentDraft, content: event.target.value }
                            : currentDraft,
                        );
                        setErrors((currentErrors) => ({
                          ...currentErrors,
                          content: undefined,
                        }));
                      }}
                      placeholder="# 角色&#10;你是一名..."
                      value={draft.content}
                    />
                  ) : (
                    <div className="mt-3 min-h-[340px] rounded-lg border border-slate-200 bg-slate-50 px-5 py-5">
                      {draft.content.trim() ? (
                        <MarkdownContent content={draft.content} />
                      ) : (
                        <p className="text-sm text-slate-400">暂无可预览内容</p>
                      )}
                    </div>
                  )}

                  {errors.content && (
                    <span className="mt-1.5 block text-xs text-red-600">
                      {errors.content}
                    </span>
                  )}
                </div>

                <section className="mt-7 border-t border-slate-200 pt-7">
                  <div className="flex items-center gap-2">
                    <GitMerge aria-hidden="true" className="size-4 text-blue-600" />
                    <h3 className="text-sm font-semibold text-slate-900">
                      AI 合并说明
                    </h3>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {mergeSummary.map((summary, index) => (
                      <li
                        className="flex items-start gap-2 text-sm leading-6 text-slate-600"
                        key={`${summary}-${index}`}
                      >
                        <span
                          aria-hidden="true"
                          className="mt-2.5 size-1.5 shrink-0 rounded-full bg-blue-500"
                        />
                        {summary}
                      </li>
                    ))}
                  </ul>
                </section>
              </section>
            ) : (
              <div className="mt-7 rounded-lg border border-dashed border-blue-200 bg-white/70 px-5 py-10 text-center">
                <GitMerge aria-hidden="true" className="mx-auto size-8 text-blue-300" />
                <p className="mt-3 text-sm font-semibold text-slate-700">
                  尚未生成合并草稿
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  填写可选要求后点击“生成合并草稿”。
                </p>
              </div>
            )}
          </div>

          <footer className="border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
            <div className="flex items-center justify-end gap-3">
              <button
                className="h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSaving || isGenerating}
                onClick={onClose}
                type="button"
              >
                取消
              </button>
              <button
                className="inline-flex h-11 min-w-32 max-w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={saveDisabled}
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
                {isSaving
                  ? "正在保存"
                  : (
                      <span className="max-w-52 truncate">
                        更新《{targetTitle}》并归档 {sourceCount} 条来源
                      </span>
                    )}
              </button>
            </div>
          </footer>
        </form>
      </aside>
    </div>
  );
}
