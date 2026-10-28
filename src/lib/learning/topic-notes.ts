// 知识点讲义的取用口。
//
// 讲义内容不在数据库里，随主题包编译进 bundle —— 理由见生成脚本顶部：
// 它是随主题包分发的静态内容，有读无写，不参与判分与统计。
// 库里只存「有哪些知识点」（id / 名字 / 所属模块 / 教材位置），
// 讲义按 (topicId, 知识点 id) 从常量里补上。
//
// 这一层存在的意义是**别让组件知道讲义从哪来**。
// 将来若真的要把讲义挪进数据库（比如要做全文检索），只改这一个文件。

// 带 .ts 扩展名是刻意的：Node 跑单测时直接 import 本文件，无扩展名的相对
// 导入在 ESM 下解析不了。项目已开 allowImportingTsExtensions，Next 也认这种写法。
import { TOPIC_NOTES, type TopicNoteEntry } from "./topic-notes.generated.ts";

/** 讲义的空值形态：知识点存在但还没写讲义 */
const NO_NOTE: TopicNoteEntry = { summary: "", note_md: "" };

/**
 * 取一个主题下所有讲义。
 *
 * 返回空对象而不是抛错：主题存在但一份讲义都没写是正常状态
 * （29 个知识点现在只有 5 份），页面该显示「讲义待补」，不该报错。
 */
export function getTopicNotes(topicId: string): Record<string, TopicNoteEntry> {
  return TOPIC_NOTES[topicId] ?? {};
}

/** 单个知识点的讲义。没有就返回空值形态，调用方照常渲染「还没有讲义」。 */
export function getKnowledgeNote(topicId: string, knowledgePointId: string): TopicNoteEntry {
  return getTopicNotes(topicId)[knowledgePointId] ?? NO_NOTE;
}

/**
 * 把讲义贴到从库里取出来的知识点行上。
 *
 * 库里那几行只有 id / 名字 / 模块，讲义的 summary 与 note_md 由这里补成
 * `string | null`（null 表示「这个知识点没讲义」），下游组件不必区分来源。
 *
 * 用空字符串判空而不是判 undefined：主题包里写了 summary 但正文为空的坏数据
 * 在生成阶段就被挡住了，能走到这里的要么两句都有，要么整条不存在。
 */
export function attachTopicNotes<T extends { id: string }>(
  topicId: string,
  rows: T[],
): (T & { summary: string | null; note_md: string | null })[] {
  const notes = getTopicNotes(topicId);

  return rows.map((row) => {
    const note = notes[row.id];
    if (!note || !note.note_md) {
      return { ...row, summary: null, note_md: null };
    }
    return { ...row, summary: note.summary || null, note_md: note.note_md };
  });
}
