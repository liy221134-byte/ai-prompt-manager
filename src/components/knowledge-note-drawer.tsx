"use client";

import { DrawerShell } from "@/components/drawer-shell";
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
//
// 外壳（遮罩、标题栏、Esc、滚动锁）统一在 DrawerShell 里，这里只管讲义怎么排。

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
  return (
    <DrawerShell onClose={onClose} subtitle={note.ref ?? undefined} title={note.name}>
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
    </DrawerShell>
  );
}
