"use client";

import {
  Eye,
  FilePenLine,
  LoaderCircle,
  Plus,
  Save,
  X,
} from "lucide-react";
import { FormEvent, useState } from "react";

import { MarkdownContent } from "@/components/markdown-content";
import {
  promptCategories,
  type PromptCardData,
  type PromptDraft,
} from "@/data/prompts";
import { useModalBehavior } from "@/hooks/use-modal-behavior";
import { normalizeTags } from "@/lib/prompt-utils";

type PromptEditorDrawerProps = {
  mode: "create" | "edit";
  prompt?: PromptCardData;
  initialDraft?: PromptDraft;
  onClose: () => void;
  onSave: (draft: PromptDraft) => Promise<void>;
};

type FormErrors = Partial<
  Record<"title" | "category" | "content" | "useCase", string>
>;

const inputClassName =
  "mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export function PromptEditorDrawer({
  mode,
  prompt,
  initialDraft,
  onClose,
  onSave,
}: PromptEditorDrawerProps) {
  const initialValue = prompt ?? initialDraft;
  const [title, setTitle] = useState(initialValue?.title ?? "");
  const [category, setCategory] = useState(initialValue?.category ?? "");
  const [useCase, setUseCase] = useState(initialValue?.useCase ?? "");
  const [content, setContent] = useState(initialValue?.content ?? "");
  const [tags, setTags] = useState<string[]>(initialValue?.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [contentMode, setContentMode] = useState<"edit" | "preview">("edit");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useModalBehavior(onClose);

  function addTags(rawValue: string) {
    const nextTags = rawValue
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean);

    if (nextTags.length === 0) {
      return;
    }

    setTags((currentTags) =>
      normalizeTags([...currentTags, ...nextTags]).slice(0, 12),
    );
    setTagDraft("");
  }

  function removeTag(tagToRemove: string) {
    setTags((currentTags) =>
      currentTags.filter((tag) => tag !== tagToRemove),
    );
  }

  function validateForm() {
    const nextErrors: FormErrors = {};

    if (!title.trim()) {
      nextErrors.title = "请填写提示词标题";
    } else if (title.trim().length > 60) {
      nextErrors.title = "标题最多 60 个字";
    }

    if (!category.trim()) {
      nextErrors.category = "请填写提示词分类";
    }

    if (!useCase.trim()) {
      nextErrors.useCase = "请填写适用场景";
    }

    if (!content.trim()) {
      nextErrors.content = "请填写提示词正文";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      await onSave({
        title: title.trim(),
        category: category.trim(),
        tags: normalizeTags(tags),
        content: content.trim(),
        useCase: useCase.trim(),
      });
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "保存提示词失败。",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="关闭提示词编辑器"
        className="absolute inset-0 cursor-default bg-slate-950/35 backdrop-blur-[2px]"
        onClick={onClose}
        type="button"
      />

      <aside
        aria-labelledby="prompt-editor-title"
        aria-modal="true"
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl sm:max-w-2xl"
        role="dialog"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold text-blue-700">
              {mode === "create" ? "新增提示词" : "编辑提示词"}
            </p>
            <h2
              className="mt-1 text-lg font-semibold text-slate-950"
              id="prompt-editor-title"
            >
              {mode === "create" ? "创建一条可复用的提示词" : prompt?.title}
            </h2>
          </div>

          <button
            aria-label="关闭提示词编辑器"
            className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
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
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-slate-700">标题</span>
                <input
                  aria-invalid={Boolean(errors.title)}
                  autoFocus
                  className={inputClassName}
                  maxLength={60}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setErrors((currentErrors) => ({
                      ...currentErrors,
                      title: undefined,
                    }));
                  }}
                  placeholder="例如：产品需求评审助手"
                  value={title}
                />
                {errors.title && (
                  <span className="mt-1.5 block text-xs text-red-600">
                    {errors.title}
                  </span>
                )}
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">分类</span>
                <input
                  aria-invalid={Boolean(errors.category)}
                  className={inputClassName}
                  list="prompt-category-options"
                  onChange={(event) => {
                    setCategory(event.target.value);
                    setErrors((currentErrors) => ({
                      ...currentErrors,
                      category: undefined,
                    }));
                  }}
                  placeholder="例如：产品设计"
                  value={category}
                />
                <datalist id="prompt-category-options">
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
                <span className="text-sm font-medium text-slate-700">标签</span>
                <div className="mt-2 flex min-h-11 flex-wrap items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 transition focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
                  {tags.map((tag) => (
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
                    setUseCase(event.target.value);
                    setErrors((currentErrors) => ({
                      ...currentErrors,
                      useCase: undefined,
                    }));
                  }}
                  placeholder="说明这条提示词最适合解决什么问题"
                  value={useCase}
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
                <span className="text-sm font-medium text-slate-700">正文</span>
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
                    setContent(event.target.value);
                    setErrors((currentErrors) => ({
                      ...currentErrors,
                      content: undefined,
                    }));
                  }}
                  placeholder="# 角色&#10;你是一名..."
                  value={content}
                />
              ) : (
                <div className="mt-3 min-h-[340px] rounded-lg border border-slate-200 bg-slate-50 px-5 py-5">
                  {content.trim() ? (
                    <MarkdownContent content={content} />
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
          </div>

          <footer className="border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
            {saveError && (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {saveError}
              </p>
            )}
            <div className="flex items-center justify-end gap-3">
              <button
                className="h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSaving}
                onClick={onClose}
                type="button"
              >
                取消
              </button>
              <button
                className="inline-flex h-11 min-w-28 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={isSaving}
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
                {isSaving ? "正在保存" : "保存提示词"}
              </button>
            </div>
          </footer>
        </form>
      </aside>
    </div>
  );
}
