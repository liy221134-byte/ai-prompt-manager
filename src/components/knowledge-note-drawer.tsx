"use client";

import { useEffect } from "react";

import { MarkdownContent } from "@/components/markdown-content";

// 知识点讲义抽屉。
//
// 为什么是抽屉而不是独立页面：
//   读讲义的时机是「马上要做这一块题」或「刚做错一道题」。跳页会把做题的上下文丢掉
//   ——回来还得重新找到那一格。抽屉盖在页面上，关掉就在原地。
//
// 为什么导出成独立组件而不是写在主题页里：
//   下一步要在练习页也挂同一个入口（做错时立刻看）。组件化之后，两边调用同一份，
//   讲义的呈现只在这一处定义。

export type KnowledgeNote = {
  id: string;
  name: string;
  ref: string | null;
  summary: string | null;
  note_md: string | null;
};

export function KnowledgeNoteDrawer({
  note,
  onClose,
}: {
  note: KnowledgeNote;
  onClose: () => void;
}) {
  // Esc 关闭。挂在 window 上而不是容器上：抽屉打开时焦点未必在容器里，
  // 挂在容器上会出现「按了 Esc 没反应」。
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // 抽屉打开时锁住背景滚动，否则滚轮会带着下面的矩阵一起动
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{note.name}</h2>
            {note.ref ? <p className="mt-0.5 text-xs text-slate-400">{note.ref}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded px-2 py-1 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
          >
            关闭
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {note.summary ? (
            // 一句话定义单独提出来加底色：它是这个知识点的「锚」，
            // 后面所有细节都是它的展开。混在正文里会被跳过。
            <p className="rounded-lg border-l-2 border-blue-500 bg-blue-50/60 px-3 py-2 text-sm leading-6 text-slate-800">
              {note.summary}
            </p>
          ) : null}

          {note.note_md ? (
            <div className="mt-4 text-sm leading-6 text-slate-700">
              <MarkdownContent content={note.note_md} />
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">这个知识点还没有讲义。</p>
          )}
        </div>
      </div>
    </div>
  );
}
