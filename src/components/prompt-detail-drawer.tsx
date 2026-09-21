"use client";

import {
  Braces,
  Check,
  Copy,
  History,
  LoaderCircle,
  Pencil,
  Sparkles,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { MarkdownContent } from "@/components/markdown-content";
import type { PromptCardData, PromptVersionData } from "@/data/prompts";
import { useModalBehavior } from "@/hooks/use-modal-behavior";
import { applyVariables, extractVariables } from "@/lib/prompt-utils";

type PromptDetailDrawerProps = {
  prompt: PromptCardData;
  onClose: () => void;
  onEdit: (prompt: PromptCardData) => void;
  onDelete: (prompt: PromptCardData) => void;
  onOptimize: (prompt: PromptCardData) => void;
  onRestoreOptimize: (
    prompt: PromptCardData,
    versionId: string,
  ) => Promise<void>;
  optimizeVersion: PromptVersionData | null;
  onNotify: (message: string) => void;
};

async function writeToClipboard(content: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(content);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = content;
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand("copy");
  textArea.remove();
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PromptDetailDrawer({
  prompt,
  onClose,
  onEdit,
  onDelete,
  onOptimize,
  onRestoreOptimize,
  optimizeVersion,
  onNotify,
}: PromptDetailDrawerProps) {
  const [variableValues, setVariableValues] = useState<Record<string, string>>(
    {},
  );
  const [copied, setCopied] = useState(false);
  const [isConfirmingRestore, setIsConfirmingRestore] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const copyTimer = useRef<number | null>(null);
  const variables = useMemo(
    () => extractVariables(prompt.content),
    [prompt.content],
  );
  const finalContent = applyVariables(prompt.content, variableValues);
  const hasMissingVariables = variables.some(
    (variable) => !variableValues[variable]?.trim(),
  );

  useModalBehavior(onClose);

  useEffect(
    () => () => {
      if (copyTimer.current) {
        window.clearTimeout(copyTimer.current);
      }
    },
    [],
  );

  async function handleCopy() {
    if (hasMissingVariables) {
      return;
    }

    try {
      await writeToClipboard(finalContent);
      setCopied(true);
      onNotify("提示词已复制");

      if (copyTimer.current) {
        window.clearTimeout(copyTimer.current);
      }

      copyTimer.current = window.setTimeout(() => {
        setCopied(false);
      }, 2200);
    } catch {
      onNotify("复制失败，请稍后重试");
    }
  }

  async function handleRestoreOptimize() {
    if (!optimizeVersion || isRestoring) {
      return;
    }

    setIsRestoring(true);

    try {
      await onRestoreOptimize(prompt, optimizeVersion.versionId);
      setIsConfirmingRestore(false);
    } finally {
      setIsRestoring(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="关闭提示词详情"
        className="absolute inset-0 cursor-default bg-slate-950/35 backdrop-blur-[2px]"
        onClick={onClose}
        type="button"
      />

      <aside
        aria-labelledby="prompt-detail-title"
        aria-modal="true"
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl sm:max-w-2xl"
        role="dialog"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold text-blue-700">提示词详情</p>
            <h2
              className="mt-1 text-lg font-semibold text-slate-950"
              id="prompt-detail-title"
            >
              {prompt.title}
            </h2>
          </div>

          <div className="flex items-center gap-1">
            <button
              aria-label="整理变量"
              className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-700"
              onClick={() => onEdit(prompt)}
              title="整理变量"
              type="button"
            >
              <Braces aria-hidden="true" className="size-5" />
            </button>
            <button
              aria-label="AI 优化提示词"
              className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-700"
              onClick={() => onOptimize(prompt)}
              title="AI 优化"
              type="button"
            >
              <Sparkles aria-hidden="true" className="size-5" />
            </button>
            <button
              aria-label="编辑提示词"
              className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
              onClick={() => onEdit(prompt)}
              title="编辑提示词"
              type="button"
            >
              <Pencil aria-hidden="true" className="size-5" />
            </button>
            <button
              aria-label="删除提示词"
              className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-red-50 hover:text-red-700"
              onClick={() => onDelete(prompt)}
              title="删除提示词"
              type="button"
            >
              <Trash2 aria-hidden="true" className="size-5" />
            </button>
            <button
              aria-label="关闭提示词详情"
              className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
              onClick={onClose}
              type="button"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">
              {prompt.category}
            </span>
            {prompt.tags.map((tag) => (
              <span
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                key={tag}
              >
                {tag}
              </span>
            ))}
          </div>

          {optimizeVersion && (
            <section className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex items-start gap-2">
                <History
                  aria-hidden="true"
                  className="mt-0.5 size-4 text-amber-700"
                />
                <div>
                  <p className="text-sm font-medium text-amber-900">
                    可以回到优化前
                  </p>
                  <p className="mt-1 text-xs text-amber-800">
                    优化前版本保存于 {formatDateTime(optimizeVersion.createdAt)}
                    ，保留到 {formatDateTime(optimizeVersion.expiresAt)}
                  </p>
                </div>
              </div>
              <button
                className="inline-flex h-9 items-center rounded-lg border border-amber-300 bg-white px-3 text-sm font-medium text-amber-900 transition hover:bg-amber-100"
                onClick={() => setIsConfirmingRestore(true)}
                type="button"
              >
                回到优化前
              </button>
            </section>
          )}

          {optimizeVersion && isConfirmingRestore && (
            <section className="mt-3 rounded-xl border border-amber-300 bg-white px-4 py-3">
              <p className="text-sm text-slate-800">
                确定回到优化前吗？当前的标题、正文和标签都会被替换成优化前的版本。
                回退前的内容会另外存一份，可以再退回来。
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-amber-600 px-3 text-sm font-medium text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={isRestoring}
                  onClick={handleRestoreOptimize}
                  type="button"
                >
                  {isRestoring ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                  ) : null}
                  确定回到优化前
                </button>
                <button
                  className="h-9 rounded-lg px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
                  disabled={isRestoring}
                  onClick={() => setIsConfirmingRestore(false)}
                  type="button"
                >
                  取消
                </button>
              </div>
            </section>
          )}

          <section className="mt-7">
            <div className="flex items-center gap-2">
              <Target aria-hidden="true" className="size-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-slate-900">适用场景</h3>
            </div>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              {prompt.useCase}
            </p>
          </section>

          {variables.length > 0 && (
            <section className="mt-8 border-t border-slate-200 pt-7">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Braces aria-hidden="true" className="size-4 text-blue-600" />
                  <h3 className="text-sm font-semibold text-slate-900">
                    填写变量
                  </h3>
                </div>
                <span className="text-xs text-slate-500">
                  已填写{" "}
                  {
                    variables.filter(
                      (variable) => variableValues[variable]?.trim(),
                    ).length
                  }
                  /{variables.length}
                </span>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {variables.map((variable) => (
                  <label className="block" key={variable}>
                    <span className="text-sm font-medium text-slate-700">
                      {variable}
                    </span>
                    <input
                      className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      onChange={(event) =>
                        setVariableValues((currentValues) => ({
                          ...currentValues,
                          [variable]: event.target.value,
                        }))
                      }
                      placeholder={`填写${variable}`}
                      value={variableValues[variable] ?? ""}
                    />
                  </label>
                ))}
              </div>
            </section>
          )}

          <section className="mt-8 border-t border-slate-200 pt-7">
            <h3 className="text-sm font-semibold text-slate-900">
              {variables.length > 0 ? "最终预览" : "提示词正文"}
            </h3>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-5 sm:px-5">
              <MarkdownContent content={finalContent} />
            </div>
          </section>
        </div>

        <footer className="border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
          <button
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={hasMissingVariables}
            onClick={handleCopy}
            type="button"
          >
            {copied ? (
              <Check aria-hidden="true" className="size-4" />
            ) : (
              <Copy aria-hidden="true" className="size-4" />
            )}
            {hasMissingVariables
              ? `还需填写 ${variables.filter((variable) => !variableValues[variable]?.trim()).length} 个变量`
              : copied
                ? "已复制"
                : "一键复制"}
          </button>
        </footer>
      </aside>
    </div>
  );
}
