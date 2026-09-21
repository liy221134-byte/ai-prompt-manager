"use client";

import {
  Braces,
  Eye,
  FilePenLine,
  LoaderCircle,
  Plus,
  Save,
  X,
} from "lucide-react";
import { FormEvent, useMemo, useRef, useState } from "react";

import { MarkdownContent } from "@/components/markdown-content";
import {
  promptCategories,
  type PromptCardData,
  type PromptDraft,
} from "@/data/prompts";
import { useModalBehavior } from "@/hooks/use-modal-behavior";
import {
  demotePromptVariable,
  insertPromptVariable,
  renamePromptVariable,
  setSelectionAsVariable,
  validatePromptVariables,
} from "@/lib/prompt-variables";
import { extractVariables, normalizeTags } from "@/lib/prompt-utils";

type PromptEditorDrawerProps = {
  mode: "create" | "edit";
  prompt?: PromptCardData;
  initialDraft?: PromptDraft;
  onClose: () => void;
  onSave: (draft: PromptDraft) => Promise<void>;
};

type FormErrors = Partial<
  Record<
    "title" | "category" | "content" | "useCase" | "variables",
    string
  >
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
  const [variableDraft, setVariableDraft] = useState("");
  const [editingVariable, setEditingVariable] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [variableError, setVariableError] = useState<string | null>(null);
  const [selectionRange, setSelectionRange] = useState({
    start: 0,
    end: 0,
  });
  const [contentMode, setContentMode] = useState<"edit" | "preview">("edit");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const contentTextAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const variables = useMemo(() => extractVariables(content), [content]);

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

  function updateContentFromVariable(nextContent: string, cursorIndex: number) {
    setContent(nextContent);
    setVariableError(null);
    setErrors((currentErrors) => ({
      ...currentErrors,
      content: undefined,
      variables: undefined,
    }));

    window.requestAnimationFrame(() => {
      contentTextAreaRef.current?.focus();
      contentTextAreaRef.current?.setSelectionRange(cursorIndex, cursorIndex);
      setSelectionRange({ start: cursorIndex, end: cursorIndex });
    });
  }

  function startRenamingVariable(variable: string) {
    setEditingVariable(variable);
    setRenameDraft(variable);
    setVariableError(null);
  }

  function confirmRenameVariable() {
    if (!editingVariable) {
      return;
    }

    try {
      const nextContent = renamePromptVariable(
        content,
        editingVariable,
        renameDraft,
      );

      updateContentFromVariable(nextContent, 0);
      setEditingVariable(null);
      setRenameDraft("");
    } catch (error) {
      setVariableError(
        error instanceof Error ? error.message : "变量改名失败。",
      );
    }
  }

  function handleDemoteVariable(variable: string) {
    try {
      updateContentFromVariable(
        demotePromptVariable(content, variable),
        0,
      );
    } catch (error) {
      setVariableError(
        error instanceof Error ? error.message : "变量降级失败。",
      );
    }
  }

  function handleSetSelectionAsVariable() {
    try {
      const result = setSelectionAsVariable(
        content,
        selectionRange.start,
        selectionRange.end,
      );

      updateContentFromVariable(result.content, result.selectionStart);
    } catch (error) {
      setVariableError(
        error instanceof Error ? error.message : "设为变量失败。",
      );
    }
  }

  function handleInsertVariable() {
    try {
      const result = insertPromptVariable(
        content,
        selectionRange.end,
        variableDraft,
      );

      updateContentFromVariable(result.content, result.selectionStart);
      setVariableDraft("");

      if (result.isExisting) {
        setVariableError("该变量已存在，将新增一处使用。");
      }
    } catch (error) {
      setVariableError(
        error instanceof Error ? error.message : "插入变量失败。",
      );
    }
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

    const variableValidationError = validatePromptVariables(content);

    if (variableValidationError) {
      nextErrors.variables = variableValidationError;
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
              {mode === "create"
                ? initialDraft
                  ? "AI 识别结果"
                  : "新增提示词"
                : "编辑提示词"}
            </p>
            <h2
              className="mt-1 text-lg font-semibold text-slate-950"
              id="prompt-editor-title"
            >
              {mode === "create"
                ? initialDraft
                  ? "确认变量和内容后保存"
                  : "创建一条可复用的提示词"
                : prompt?.title}
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

              <section className="mt-3 rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Braces
                      aria-hidden="true"
                      className="size-4 text-blue-700"
                    />
                    <h3 className="text-sm font-semibold text-slate-900">
                      变量管理
                    </h3>
                    <span className="text-xs text-slate-500">
                      {variables.length} 个变量
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="h-8 rounded-lg border border-blue-200 bg-white px-3 text-xs font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50"
                      onClick={handleSetSelectionAsVariable}
                      type="button"
                    >
                      选区设为变量
                    </button>
                    <div className="flex h-8 items-center overflow-hidden rounded-lg border border-blue-200 bg-white">
                      <input
                        aria-label="新变量名"
                        className="h-full w-28 bg-transparent px-2 text-xs text-slate-800 outline-none placeholder:text-slate-400"
                        onChange={(event) =>
                          setVariableDraft(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleInsertVariable();
                          }
                        }}
                        placeholder="变量名"
                        value={variableDraft}
                      />
                      <button
                        className="h-full border-l border-blue-200 px-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-50"
                        onClick={handleInsertVariable}
                        type="button"
                      >
                        插入
                      </button>
                    </div>
                  </div>
                </div>

                {(variableError || errors.variables) && (
                  <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-red-700">
                    {variableError ?? errors.variables}
                  </p>
                )}

                {variables.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {variables.map((variable) => (
                      <div
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-100 bg-white px-3 py-2"
                        key={variable}
                      >
                        {editingVariable === variable ? (
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <input
                              autoFocus
                              className="h-8 min-w-0 flex-1 rounded-md border border-blue-300 px-2 font-mono text-xs text-slate-900 outline-none focus:border-blue-500"
                              onChange={(event) =>
                                setRenameDraft(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  confirmRenameVariable();
                                }

                                if (event.key === "Escape") {
                                  setEditingVariable(null);
                                  setRenameDraft("");
                                }
                              }}
                              value={renameDraft}
                            />
                            <button
                              className="h-8 rounded-md bg-blue-600 px-2.5 text-xs font-semibold text-white transition hover:bg-blue-700"
                              onClick={confirmRenameVariable}
                              type="button"
                            >
                              确认
                            </button>
                            <button
                              className="h-8 rounded-md px-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                              onClick={() => {
                                setEditingVariable(null);
                                setRenameDraft("");
                              }}
                              type="button"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="min-w-0 truncate font-mono text-xs font-semibold text-blue-800">
                              {`{{${variable}}}`}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                className="rounded-md px-2 py-1 text-xs font-medium text-blue-700 transition hover:bg-blue-50"
                                onClick={() => startRenamingVariable(variable)}
                                type="button"
                              >
                                改名
                              </button>
                              <button
                                className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                                onClick={() =>
                                  handleDemoteVariable(variable)
                                }
                                type="button"
                              >
                                降级为正文
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {contentMode === "edit" ? (
                <textarea
                  aria-invalid={Boolean(errors.content)}
                  className="mt-3 min-h-[340px] w-full resize-y rounded-lg border border-slate-300 bg-slate-50 px-4 py-4 font-mono text-sm leading-7 text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                  onChange={(event) => {
                    setContent(event.target.value);
                    setSelectionRange({
                      start: event.currentTarget.selectionStart,
                      end: event.currentTarget.selectionEnd,
                    });
                    setErrors((currentErrors) => ({
                      ...currentErrors,
                      content: undefined,
                      variables: undefined,
                    }));
                    setVariableError(null);
                  }}
                  onSelect={(event) =>
                    setSelectionRange({
                      start: event.currentTarget.selectionStart,
                      end: event.currentTarget.selectionEnd,
                    })
                  }
                  placeholder="# 角色&#10;你是一名..."
                  ref={contentTextAreaRef}
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
