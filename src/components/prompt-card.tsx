import {
  ArrowRight,
  CalendarDays,
  Check,
  FileText,
  Tags,
  Target,
} from "lucide-react";

import type { PromptCardData } from "@/data/prompts";
import { extractVariables } from "@/lib/prompt-utils";

type PromptCardProps = {
  prompt: PromptCardData;
  index: number;
  onOpen: (prompt: PromptCardData) => void;
  selectionMode?: boolean;
  selected?: boolean;
  isMergeTarget?: boolean;
  canSelect?: boolean;
  onToggleSelection?: (prompt: PromptCardData) => void;
  onSetMergeTarget?: (prompt: PromptCardData) => void;
};

const categoryStyles: Record<string, string> = {
  产品设计: "bg-amber-50 text-amber-700 ring-amber-200",
  软件开发: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  AI效能: "bg-violet-50 text-violet-700 ring-violet-200",
};

const fallbackCategoryStyle = "bg-blue-50 text-blue-700 ring-blue-200";

function formatDate(date: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}

export function PromptCard({
  prompt,
  index,
  onOpen,
  selectionMode = false,
  selected = false,
  isMergeTarget = false,
  canSelect = true,
  onToggleSelection,
  onSetMergeTarget,
}: PromptCardProps) {
  const categoryStyle =
    categoryStyles[prompt.category] ?? fallbackCategoryStyle;
  const variableCount = extractVariables(prompt.content).length;
  const cardClassName = selectionMode
    ? `flex h-full flex-col overflow-hidden rounded-lg border bg-white transition-shadow ${
        isMergeTarget
          ? "border-blue-500 ring-2 ring-blue-100"
          : selected
            ? "border-blue-300 ring-2 ring-blue-50"
            : "border-[#dbe7f5] shadow-[0_10px_28px_rgba(30,64,175,0.07)] hover:shadow-[0_16px_36px_rgba(30,64,175,0.12)]"
      }`
    : "flex h-full flex-col overflow-hidden rounded-lg border border-[#dbe7f5] bg-white shadow-[0_10px_28px_rgba(30,64,175,0.07)] transition-shadow hover:shadow-[0_16px_36px_rgba(30,64,175,0.12)]";

  return (
    <article className={cardClassName}>
      <div className="border-b border-slate-100 px-5 pb-5 pt-5">
        <div className="flex items-start justify-between gap-4">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${categoryStyle}`}
          >
            {prompt.category}
          </span>
          {selectionMode ? (
            <div className="flex shrink-0 items-center gap-2">
              {isMergeTarget && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-1 text-xs font-semibold text-white">
                  <Target aria-hidden="true" className="size-3" />
                  目标
                </span>
              )}
              <button
                aria-checked={selected}
                aria-label={
                  selected ? `取消选择 ${prompt.title}` : `选择 ${prompt.title}`
                }
                className={`flex size-7 items-center justify-center rounded-md border transition-colors ${
                  selected
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-300 bg-white text-transparent hover:border-blue-400"
                } disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-transparent`}
                disabled={!selected && !canSelect}
                onClick={() => onToggleSelection?.(prompt)}
                role="checkbox"
                type="button"
              >
                <Check aria-hidden="true" className="size-4" />
              </button>
            </div>
          ) : (
            <span className="font-mono text-xs font-medium text-slate-400">
              {String(index + 1).padStart(2, "0")}
            </span>
          )}
        </div>

        <h2 className="mt-4 text-xl font-semibold leading-7 text-slate-950">
          {prompt.title}
        </h2>

        <div className="mt-3 flex flex-wrap gap-2">
          {prompt.tags.map((tag) => (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
              key={tag}
            >
              <Tags aria-hidden="true" className="size-3" />
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col px-5 py-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <Target aria-hidden="true" className="size-4" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              适用场景
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-700">
              {prompt.useCase}
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2 border-t border-slate-100 pt-5">
          <FileText aria-hidden="true" className="size-4 text-slate-400" />
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            提示词正文
          </p>
        </div>

        <div className="mt-3 flex-1 border-l-2 border-blue-200 pl-4">
          <p className="prompt-preview whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">
            {prompt.content}
          </p>
        </div>
      </div>

      <footer className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-5 py-3">
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <CalendarDays aria-hidden="true" className="size-3.5" />
          更新于 {formatDate(prompt.updatedAt)}
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          {variableCount > 0 ? `${variableCount} 个变量` : "可直接复制"}
        </span>
        <div className="flex shrink-0 items-center gap-3">
          {selectionMode && selected && !isMergeTarget && onSetMergeTarget && (
            <button
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 transition-colors hover:text-blue-900"
              onClick={() => onSetMergeTarget(prompt)}
              type="button"
            >
              <Target aria-hidden="true" className="size-4" />
              设为目标
            </button>
          )}
          <button
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 transition-colors hover:text-blue-900"
            onClick={() => onOpen(prompt)}
            type="button"
          >
            查看详情
            <ArrowRight aria-hidden="true" className="size-4" />
          </button>
        </div>
      </footer>
    </article>
  );
}
