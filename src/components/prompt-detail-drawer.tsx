"use client";

import {
  Braces,
  Check,
  Copy,
  Pencil,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { MarkdownContent } from "@/components/markdown-content";
import type { PromptCardData } from "@/data/prompts";
import { useModalBehavior } from "@/hooks/use-modal-behavior";
import { applyVariables, extractVariables } from "@/lib/prompt-utils";

type PromptDetailDrawerProps = {
  prompt: PromptCardData;
  onClose: () => void;
  onEdit: (prompt: PromptCardData) => void;
  onDelete: (prompt: PromptCardData) => void;
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

export function PromptDetailDrawer({
  prompt,
  onClose,
  onEdit,
  onDelete,
  onNotify,
}: PromptDetailDrawerProps) {
  const [variableValues, setVariableValues] = useState<Record<string, string>>(
    {},
  );
  const [copied, setCopied] = useState(false);
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
