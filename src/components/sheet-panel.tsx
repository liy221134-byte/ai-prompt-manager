"use client";

// 一页素材表的两个界面块：主题页上的模块列表、写纸用的抽屉。
//
// 界面上的硬约束只有一条，但它决定了整个交互：**没有「一键采纳 AI 建议」**。
// 检查结果只以清单形式摆在旁边，改不改由人在输入框里自己敲。
// 一旦提供采纳按钮，这张纸就变成 AI 写的，也就失去「检验我会不会」的作用（PRD 第 7 条）。

import { useEffect, useState } from "react";

import {
  SHEET_SECTIONS,
  describeProgress,
  emptySections,
  normalizeSections,
  type SheetSections,
} from "@/lib/learning/sheet";
import type { SheetReview } from "@/lib/learning/sheet-prompt";

export type SheetRow = {
  module_id: string;
  sections: unknown;
  updated_at: string;
};

/**
 * 主题页上的一块：按模块列出入口。
 *
 * 刻意**不判「模块学完」**：系统现在没有这个状态（矩阵只有覆盖率，覆盖 100% 也不等于会）。
 * 六段随时可写可改可空着——等真用起来看他什么时候开始动笔，再决定要不要加触发。
 */
export function SheetBoard({
  modules,
  sheets,
  onOpen,
}: {
  modules: Array<{ id: string; name: string }>;
  sheets: SheetRow[];
  onOpen: (moduleId: string) => void;
}) {
  const byModule = new Map(sheets.map((sheet) => [sheet.module_id, sheet]));

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">一页素材表</h2>
        <span className="text-xs text-slate-400">每个模块一张纸，自己写，AI 只挑毛病</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        考前一天只看这几张纸。写的时候不用求完整——先写下你记得的，漏的让 AI 指出来。
      </p>

      <ul className="mt-3 divide-y divide-slate-100">
        {modules.map((module) => {
          const sheet = byModule.get(module.id);
          const progress = sheet ? describeProgress(normalizeSections(sheet.sections)) : "还没写";
          return (
            <li key={module.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-slate-800">{module.name}</p>
                <p className="text-xs text-slate-400">
                  {progress}
                  {sheet ? ` · 上次 ${sheet.updated_at.slice(0, 10)}` : ""}
                </p>
              </div>
              <button
                className="shrink-0 rounded border border-[#dbe7f5] bg-white px-3 py-1 text-sm font-medium text-slate-700 transition-colors hover:border-blue-300"
                onClick={() => onOpen(module.id)}
                type="button"
              >
                {sheet ? "继续写" : "开始写"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function SheetDrawer({
  moduleName,
  initialSections,
  knowledgePoints,
  wrongQuestionTitles,
  onSave,
  onClose,
}: {
  moduleName: string;
  initialSections: SheetSections;
  knowledgePoints: string[];
  wrongQuestionTitles: string[];
  onSave: (sections: SheetSections) => Promise<void>;
  onClose: () => void;
}) {
  const [sections, setSections] = useState<SheetSections>(initialSections ?? emptySections());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [review, setReview] = useState<SheetReview | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(sections);
      setSaved(true);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "保存失败。");
    } finally {
      setSaving(false);
    }
  }

  async function check() {
    setReviewing(true);
    setReviewError(null);
    try {
      const response = await fetch("/api/learning/sheet-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moduleName,
          sections,
          knowledgePoints,
          wrongQuestionTitles,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { review?: SheetReview; error?: string }
        | null;
      if (!response.ok || !payload?.review) {
        throw new Error(payload?.error ?? "检查没有返回结果。");
      }
      setReview(payload.review);
    } catch (caught) {
      setReviewError(caught instanceof Error ? caught.message : "检查没跑起来。");
    } finally {
      setReviewing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-3xl flex-col border-l border-slate-200 bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{moduleName}</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              六段都空着也能存。先写你记得的，写完让 AI 看漏了没有。
            </p>
          </div>
          <button
            className="shrink-0 rounded px-2 py-1 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            onClick={onClose}
            type="button"
          >
            关闭
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">
            {SHEET_SECTIONS.map((section) => (
              <label key={section.key} className="block">
                <span className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-medium text-slate-700">{section.label}</span>
                  <span className="text-xs text-slate-400">{section.prompt}</span>
                </span>
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 text-slate-800 focus:border-blue-400 focus:outline-none"
                  onChange={(event) => {
                    setSections({ ...sections, [section.key]: event.target.value });
                    setSaved(false);
                  }}
                  placeholder={section.placeholder}
                  rows={section.rows}
                  value={sections[section.key]}
                />
              </label>
            ))}
          </div>

          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={saving}
                onClick={() => void save()}
                type="button"
              >
                {saving ? "保存中…" : saved ? "已保存" : "保存"}
              </button>
              <button
                className="rounded border border-[#dbe7f5] bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={reviewing}
                onClick={() => void check()}
                type="button"
              >
                {reviewing ? "正在看…" : "让 AI 看漏了什么"}
              </button>
              {saveError ? <span className="text-xs text-red-600">{saveError}</span> : null}
            </div>

            {reviewError ? (
              <p className="mt-2 text-sm text-amber-700">检查没跑起来：{reviewError}</p>
            ) : null}

            {review ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-700">它挑出的问题</p>
                  {/* 这句不是免责声明，是使用说明：清单要自己判断，不要照抄 */}
                  <span className="text-xs text-slate-400">只列清单，不替你改。改不改你自己定</span>
                </div>

                <ReviewList label="漏了什么" items={review.gaps} emptyText="该写的都写了" />
                <ReviewList label="可能写错" items={review.wrong} emptyText="没看出明显写错的地方" />
                <ReviewList label="建议补" items={review.suggest} emptyText="暂时没有建议" />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewList({
  label,
  items,
  emptyText,
}: {
  label: string;
  items: string[];
  emptyText: string;
}) {
  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-slate-500">
        {label}
        {items.length > 0 ? `（${items.length}）` : ""}
      </p>
      {items.length === 0 ? (
        <p className="mt-0.5 text-xs text-slate-400">{emptyText}</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {items.map((item) => (
            <li key={item} className="text-xs leading-5 text-slate-700">
              · {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
