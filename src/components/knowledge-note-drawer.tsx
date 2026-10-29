"use client";

import { DrawerShell } from "@/components/drawer-shell";
import { MarkdownContent } from "@/components/markdown-content";

// 知识点讲义阅读层。
//
// 为什么是覆盖层而不是独立页面：
//   读讲义的时机是「马上要做这一块题」或「刚做错一道题」。跳页会把做题的上下文丢掉
//   ——回来还得重新找到那一格。盖在页面上，关掉就在原地。
//
// 为什么用 fullscreen 而不是右侧侧栏：
//   讲义是长文，一份 body 通常两三千字、带三到五个表格。侧栏只有 672px 宽，
//   表格要横向滚动、正文一行被压到三十字出头还要频繁换行，读十几分钟非常累。
//   全屏把页面背景彻底盖掉，视觉上只剩正文，这是长文该有的形态。
//   （对比：追问抽屉是对话流、素材表是六段表单，都是「填完就关」，仍用侧栏。）
//
// 为什么正文用 reading 字号档：
//   默认的 .markdown-body 是 14px，是按「扫一眼题目解析」定的。
//   讲义要连续读，17px + 1.9 行高才不至于凑近看。
//
// 外壳（Esc、滚动锁、标题栏）统一在 DrawerShell 里，这里只管讲义怎么排。

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
    <DrawerShell
      variant="fullscreen"
      onClose={onClose}
      subtitle={note.ref ? `知识点讲义 · ${note.ref}` : "知识点讲义"}
      title={note.name}
    >
      {note.summary ? (
        // 一句话定义单独提出来加底色：它是这个知识点的「锚」，
        // 后面所有细节都是它的展开。混在正文里会被跳过。
        <p className="mb-8 rounded-xl border-l-4 border-blue-500 bg-blue-50/70 px-5 py-4 text-lg leading-8 text-slate-800">
          {note.summary}
        </p>
      ) : null}

      {note.note_md ? (
        <MarkdownContent content={note.note_md} variant="reading" />
      ) : (
        <p className="text-base text-slate-500">这个知识点还没有讲义。</p>
      )}

      {/* 读到末尾给一个出口。全屏形态没有「点遮罩关闭」，只靠右上角与 Esc，
          长文滚到底后容易找不到退出的位置，所以末尾再放一个。 */}
      <div className="mt-12 border-t border-slate-100 pt-6">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
        >
          读完，返回学习计划
        </button>
      </div>
    </DrawerShell>
  );
}
