"use client";

import {
  BookOpenText,
  CheckCircle2,
  Layers3,
  Plus,
  Search,
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
import { PromptCard } from "@/components/prompt-card";
import { PromptDetailDrawer } from "@/components/prompt-detail-drawer";
import { PromptEditorDrawer } from "@/components/prompt-editor-drawer";
import {
  promptCards,
  type PromptCardData,
  type PromptDraft,
} from "@/data/prompts";
import {
  loadPromptLibrary,
  savePromptLibrary,
} from "@/lib/prompt-storage";
import { buildPromptSearchText } from "@/lib/prompt-utils";

type EditorState =
  | {
      mode: "create";
    }
  | {
      mode: "edit";
      promptId: string;
    };

function createPromptId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `prompt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function PromptLibrary() {
  const [prompts, setPrompts] = useState<PromptCardData[]>(promptCards);
  const [isStorageReady, setIsStorageReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [deletePromptId, setDeletePromptId] = useState<string | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    const loadTimer = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      try {
        setPrompts(loadPromptLibrary());
      } catch {
        notify("本地数据无法读取，当前显示示例提示词");
      } finally {
        setIsStorageReady(true);
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(loadTimer);
    };
  }, [notify]);

  useEffect(() => {
    if (!isStorageReady) {
      return;
    }

    let errorTimer: number | undefined;

    try {
      savePromptLibrary(prompts);
    } catch {
      errorTimer = window.setTimeout(() => {
        notify("本地保存失败，请检查浏览器存储设置");
      }, 0);
    }

    return () => {
      if (errorTimer) {
        window.clearTimeout(errorTimer);
      }
    };
  }, [isStorageReady, notify, prompts]);

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
  const promptToDelete = prompts.find(
    (prompt) => prompt.id === deletePromptId,
  );
  const editingPrompt =
    editorState?.mode === "edit"
      ? prompts.find((prompt) => prompt.id === editorState.promptId)
      : undefined;

  function handleSave(draft: PromptDraft) {
    const now = new Date().toISOString();

    if (editorState?.mode === "edit" && editingPrompt) {
      setPrompts((currentPrompts) =>
        currentPrompts.map((prompt) =>
          prompt.id === editingPrompt.id
            ? {
                ...prompt,
                ...draft,
                updatedAt: now,
              }
            : prompt,
        ),
      );
      setEditorState(null);
      notify("提示词已更新");
      return;
    }

    const newPrompt: PromptCardData = {
      id: createPromptId(),
      ...draft,
      createdAt: now,
      updatedAt: now,
    };

    setPrompts((currentPrompts) => [newPrompt, ...currentPrompts]);
    setEditorState(null);
    setSelectedPromptId(newPrompt.id);
    notify("提示词已保存");
  }

  function handleDelete() {
    if (!promptToDelete) {
      return;
    }

    setPrompts((currentPrompts) =>
      currentPrompts.filter((prompt) => prompt.id !== promptToDelete.id),
    );
    setDeletePromptId(null);

    if (selectedPromptId === promptToDelete.id) {
      setSelectedPromptId(null);
    }

    notify("提示词已删除");
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
              <p className="text-xs text-slate-500">个人工作台</p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-[#dbe7f5] bg-white px-3 py-2 text-sm text-slate-600">
            <Layers3 aria-hidden="true" className="size-4 text-blue-600" />
            <span>{prompts.length} 条提示词</span>
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

        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">搜索提示词</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            />
            <input
              className="h-11 w-full rounded-lg border border-[#dbe7f5] bg-white pl-10 pr-10 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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

          <button
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            onClick={() => setEditorState({ mode: "create" })}
            type="button"
          >
            <Plus aria-hidden="true" className="size-4" />
            新增提示词
          </button>
        </div>

        {filteredPrompts.length > 0 ? (
          <div className="mt-8 grid items-start gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredPrompts.map((prompt, index) => (
              <PromptCard
                index={index}
                key={prompt.id}
                onOpen={(selected) => setSelectedPromptId(selected.id)}
                prompt={prompt}
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

      {editorState && (
        <PromptEditorDrawer
          key={editingPrompt?.id ?? "new-prompt"}
          mode={editorState.mode}
          onClose={() => setEditorState(null)}
          onSave={handleSave}
          prompt={editingPrompt}
        />
      )}

      {promptToDelete && (
        <DeleteConfirmDialog
          onCancel={() => setDeletePromptId(null)}
          onConfirm={handleDelete}
          prompt={promptToDelete}
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
