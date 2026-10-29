// 静态内容常量生成器：把主题包里「只读、不判分、有读无写」的内容编成 TS 常量。
//
// 现在管两样东西，共用同一套理由与同一条门禁（`--check`）：
//   1) 讲义 knowledge_points[].note  → src/lib/learning/topic-notes.generated.ts
//   2) 论文真题 essay_prompts[]      → src/lib/learning/essay-prompts.generated.ts
// 论文题目后加进来的，为什么不单开一个脚本：它跟讲义的性质完全一样
// （随主题包分发的静态内容、不参与判分、有读无写），又都要拦「改了 yaml 忘了重新生成」。
// 单开脚本就多一条门禁、两次漂移，收益只是文件名好听。
//
// 为什么这些内容不存进数据库、也不在运行时读 yaml：
//   1) 运行时读 yaml 在生产会 404。Next.js 只把被 import 的文件打进产物，
//      docs/ 目录不在其中——Vercel 上 process.cwd() 里找不到 docs/learning/topics。
//   2) 存库要一次 DDL（knowledge_points 加两列 / 新建论文题目表）。这类内容是
//      随主题包分发的静态内容，不是用户产生的数据：它不参与判分、不参与统计、有读无写。
//      给只读内容建副本，等于给自己多养一份必须同步的真源。
//   生成成常量两头都不欠：编译进 bundle，没有运行时 IO，也没有迁移依赖。
//   主题包仍是唯一内容源，本文件是派生物——`--check` 负责拦「改了 yaml 忘了重新生成」。
//
// 用法：
//   node scripts/build-topic-notes.mjs          重新生成上面两份常量
//   node scripts/build-topic-notes.mjs --check  只比对不写盘，不一致退 1（测试与 CI 用）

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import yaml from "js-yaml";

import { validateNote } from "./import-topic-pack.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const TOPICS_DIR = join(ROOT, "docs/learning/topics");
export const OUTPUT_FILE = join(ROOT, "src/lib/learning/topic-notes.generated.ts");
export const ESSAY_OUTPUT_FILE = join(ROOT, "src/lib/learning/essay-prompts.generated.ts");

/**
 * 扫主题包目录，抽出所有带讲义的知识点。
 *
 * 返回 { notes, errors } 而不是直接抛：一份主题包缺 id、一份讲义少「怎么考」，
 * 都该一次性全报出来，改完一次过，别让人反复跑一遍发现下一处。
 *
 * 没写 note 的知识点不进结果表——讲义允许渐进补，新加的知识点可以先只有骨架。
 * 空表项与「没写」在下游是两件事：前者会渲染出一个点开只有「还没有讲义」的抽屉。
 */
export function collectTopicNotes(topicsDir = TOPICS_DIR) {
  const files = readdirSync(topicsDir)
    .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"))
    .sort();

  const notes = {};
  const errors = [];

  for (const file of files) {
    const pack = yaml.load(readFileSync(join(topicsDir, file), "utf8"));
    const topicId = pack?.topic?.id;

    if (typeof topicId !== "string" || !topicId.trim()) {
      errors.push(`${file}: 缺 topic.id，无法确定讲义归哪个主题`);
      continue;
    }

    const bucket = {};
    const points = Array.isArray(pack.knowledge_points) ? pack.knowledge_points : [];

    points.forEach((kp, index) => {
      const at = `${file} knowledge_points[${index}]`;

      if (typeof kp?.id !== "string" || !kp.id.trim()) {
        errors.push(`${at}: 缺 id`);
        return;
      }

      // 没写讲义 = 跳过，不是错误。校验器（validateNote）会放行 null。
      if (kp.note == null) return;

      const noteErrors = validateNote(kp.note, at);
      if (noteErrors.length > 0) {
        errors.push(...noteErrors);
        return;
      }

      bucket[kp.id] = {
        summary: kp.note.summary.trim(),
        note_md: kp.note.body.trim(),
      };
    });

    if (Object.keys(bucket).length > 0) notes[topicId] = bucket;
  }

  return { notes, errors };
}

/** 把讲义表渲染成 TS 源码。稳定排序，同样的输入永远产出同样的字节。 */
export function renderTopicNotes(notes) {
  const topicIds = Object.keys(notes).sort();
  const lines = [
    "// ⚠️ 本文件由 scripts/build-topic-notes.mjs 生成，不要手改。",
    "// 改讲义请改 docs/learning/topics/*.yaml，然后 npm run gen:topic-notes。",
    "// 为什么讲义不落库：见生成脚本顶部说明，或 docs/learning/topic-pack-schema.md 第四节。",
    "",
    "export type TopicNoteEntry = {",
    "  /** 一句话定义，抽屉顶部与列表摘要用 */",
    "  summary: string;",
    "  /** 讲义正文（markdown），固定含「### 要素」「### 例题」「### 怎么考」三段 */",
    "  note_md: string;",
    "};",
    "",
    "/** 主题 id → 知识点 id → 讲义。没有讲义的知识点不会出现在这里 */",
    "export const TOPIC_NOTES: Record<string, Record<string, TopicNoteEntry>> = {",
  ];

  for (const topicId of topicIds) {
    lines.push(`  ${JSON.stringify(topicId)}: {`);
    for (const kpId of Object.keys(notes[topicId])) {
      const entry = notes[topicId][kpId];
      lines.push(`    ${JSON.stringify(kpId)}: {`);
      lines.push(`      summary: ${JSON.stringify(entry.summary)},`);
      lines.push(`      note_md: ${JSON.stringify(entry.note_md)},`);
      lines.push("    },");
    }
    lines.push("  },");
  }

  lines.push("};", "");
  return lines.join("\n");
}

/** 生成一份并返回源码。测试拿它跟磁盘上的文件比，判断是否需要重新生成。 */
export function buildTopicNotesSource(topicsDir = TOPICS_DIR) {
  const { notes, errors } = collectTopicNotes(topicsDir);
  if (errors.length > 0) {
    throw new Error(`主题包里的讲义有 ${errors.length} 处问题：\n- ${errors.join("\n- ")}`);
  }
  return { source: renderTopicNotes(notes), notes };
}

// ── 论文真题 ──────────────────────────────────────────────

/**
 * 扫主题包目录，抽出论文真题。
 *
 * 校验比讲义严一档：题面（prompt_md）和来源（source_note）都必须写。
 * 题面缺了这条记录没意义；来源缺了就等于把「学员回忆版」当官方原文在用，
 * 而批改结论的可信度上限正是被这个来源卡住的——软考官方从不公布真题。
 *
 * id 全局唯一（跨主题包查重），因为它要被存进批改记录当外键用。
 */
export function collectEssayPrompts(topicsDir = TOPICS_DIR) {
  const files = readdirSync(topicsDir)
    .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"))
    .sort();

  const prompts = {};
  const errors = [];
  const seenIds = new Map();

  for (const file of files) {
    const pack = yaml.load(readFileSync(join(topicsDir, file), "utf8"));
    const topicId = pack?.topic?.id;

    if (typeof topicId !== "string" || !topicId.trim()) {
      errors.push(`${file}: 缺 topic.id，无法确定论文题目归哪个主题`);
      continue;
    }

    const list = Array.isArray(pack.essay_prompts) ? pack.essay_prompts : [];
    if (list.length === 0) continue;

    const bucket = [];

    list.forEach((item, index) => {
      const at = `${file} essay_prompts[${index}]`;
      const id = typeof item?.id === "string" ? item.id.trim() : "";

      if (!id) {
        errors.push(`${at}: 缺 id`);
        return;
      }
      if (seenIds.has(id)) {
        errors.push(`${at}: id「${id}」重复出现（${seenIds.get(id)} 已用过）`);
        return;
      }
      seenIds.set(id, at);

      const kpId = typeof item?.kp_id === "string" ? item.kp_id.trim() : "";
      const title = typeof item?.title === "string" ? item.title.trim() : "";
      const promptMd = typeof item?.prompt_md === "string" ? item.prompt_md.trim() : "";
      const sourceNote = typeof item?.source_note === "string" ? item.source_note.trim() : "";

      if (!kpId) errors.push(`${at}（${id}）: 缺 kp_id`);
      if (!title) errors.push(`${at}（${id}）: 缺 title`);
      // 40 字是个下限而不是标准：真题题面连题干带小题都远超这个数，
      // 短于 40 字的基本是「题目名写进了 prompt_md」，那是填错了。
      if (promptMd.length < 40) {
        errors.push(`${at}（${id}）: prompt_md 只有 ${promptMd.length} 字，题面没抄全`);
      }
      if (!sourceNote) {
        errors.push(`${at}（${id}）: 缺 source_note。回忆版必须注明来源，否则会被当官方原文用`);
      }

      if (!kpId || !title || promptMd.length < 40 || !sourceNote) return;

      const year = Number.parseInt(String(item?.year ?? ""), 10);

      bucket.push({
        id,
        kp_id: kpId,
        year: Number.isFinite(year) ? year : 0,
        session: typeof item?.session === "string" ? item.session.trim() : "",
        batch: typeof item?.batch === "string" ? item.batch.trim() : "",
        exam_date: typeof item?.exam_date === "string" ? item.exam_date.trim() : null,
        title,
        prompt_md: promptMd,
        source_note: sourceNote,
        // 题目之外的考场口径（字数、要不要摘要）。可以没有，没有就不显示。
        extra_md: typeof item?.extra_md === "string" && item.extra_md.trim() ? item.extra_md.trim() : null,
        source: typeof item?.source === "string" ? item.source.trim() : "web",
      });
    });

    if (bucket.length > 0) {
      // 年份倒序；同一年按考试日期倒序。新的排前面：最近一年的题面口径最接近下次考试。
      // 刻意**不按批次名排**——中文 collation 下「第一批次」会排到「第二批次」之后
      // （「一」与「二」按拼音比，er 在前），看着像 bug，其实是排序键选错了。
      bucket.sort(
        (a, b) => b.year - a.year || (b.exam_date ?? "").localeCompare(a.exam_date ?? ""),
      );
      prompts[topicId] = bucket;
    }
  }

  return { prompts, errors };
}

/** 把论文真题表渲染成 TS 源码。稳定排序，同样的输入永远产出同样的字节。 */
export function renderEssayPrompts(prompts) {
  const topicIds = Object.keys(prompts).sort();
  const lines = [
    "// ⚠️ 本文件由 scripts/build-topic-notes.mjs 生成，不要手改。",
    "// 改论文题目请改 docs/learning/topics/*.yaml 的 essay_prompts 段，然后 npm run gen:topic-notes。",
    "// 为什么不落库：见生成脚本顶部说明，或 docs/learning/topic-pack-schema.md 第四节。",
    "",
    "export type EssayPromptEntry = {",
    "  /** 唯一 id，批改记录靠它反查是哪套真题 */",
    "  id: string;",
    "  kp_id: string;",
    "  /** 0 = 没写年份 */",
    "  year: number;",
    "  session: string;",
    "  batch: string;",
    "  /** 考试日期，没写就是 null（界面不显示日期那一栏） */",
    "  exam_date: string | null;",
    "  title: string;",
    "  /** 题目原文，原样照抄，不含任何拆解 */",
    "  prompt_md: string;",
    "  /** 题面从哪来。全部是学员回忆版，这一栏必须显示，不能藏 */",
    "  source_note: string;",
    "  /** 题目之外的考场口径（字数/摘要），可能没有；有争议的按参考显示 */",
    "  extra_md: string | null;",
    "  source: string;",
    "};",
    "",
    "/** 主题 id → 该主题的论文真题，按年份倒序 */",
    "export const TOPIC_ESSAY_PROMPTS: Record<string, EssayPromptEntry[]> = {",
  ];

  for (const topicId of topicIds) {
    lines.push(`  ${JSON.stringify(topicId)}: [`);
    for (const item of prompts[topicId]) {
      lines.push("    {");
      lines.push(`      id: ${JSON.stringify(item.id)},`);
      lines.push(`      kp_id: ${JSON.stringify(item.kp_id)},`);
      lines.push(`      year: ${item.year},`);
      lines.push(`      session: ${JSON.stringify(item.session)},`);
      lines.push(`      batch: ${JSON.stringify(item.batch)},`);
      lines.push(`      exam_date: ${JSON.stringify(item.exam_date)},`);
      lines.push(`      title: ${JSON.stringify(item.title)},`);
      lines.push(`      prompt_md: ${JSON.stringify(item.prompt_md)},`);
      lines.push(`      source_note: ${JSON.stringify(item.source_note)},`);
      lines.push(`      extra_md: ${JSON.stringify(item.extra_md)},`);
      lines.push(`      source: ${JSON.stringify(item.source)},`);
      lines.push("    },");
    }
    lines.push("  ],");
  }

  lines.push("};", "");
  return lines.join("\n");
}

/** 生成论文真题常量源码。测试与主流程共用。 */
export function buildEssayPromptsSource(topicsDir = TOPICS_DIR) {
  const { prompts, errors } = collectEssayPrompts(topicsDir);
  if (errors.length > 0) {
    throw new Error(`主题包里的论文真题有 ${errors.length} 处问题：\n- ${errors.join("\n- ")}`);
  }
  return { source: renderEssayPrompts(prompts), prompts };
}

/**
 * 处理一份产物：`--check` 只比对，否则写盘。
 *
 * 两份产物共用它而不是各写一遍：将来再加第三份（案例分析真题之类）时，
 * 只要在 main 里多调一次，不用复制查逻辑。
 */
function syncOne({ label, outputFile, source, checkOnly }) {
  if (checkOnly) {
    let current = "";
    try {
      current = readFileSync(outputFile, "utf8");
    } catch {
      // 文件不存在也算不一致，下面统一报
    }
    if (current !== source) {
      return { label, file: outputFile, ok: false };
    }
    return { label, file: outputFile, ok: true };
  }

  writeFileSync(outputFile, source, "utf8");
  return { label, file: outputFile, ok: true };
}

function main() {
  const checkOnly = process.argv.includes("--check");

  const { source: notesSource } = buildTopicNotesSource();
  const { source: essaySource } = buildEssayPromptsSource();

  const results = [
    syncOne({ label: "讲义", outputFile: OUTPUT_FILE, source: notesSource, checkOnly }),
    syncOne({ label: "论文真题", outputFile: ESSAY_OUTPUT_FILE, source: essaySource, checkOnly }),
  ];

  const stale = results.filter((item) => !item.ok);

  if (stale.length > 0) {
    console.error(
      `常量与主题包不同步：\n${stale
        .map((item) => `- ${item.label}：${relative(ROOT, item.file)}`)
        .join("\n")}\n重新生成：npm run gen:topic-notes`,
    );
    process.exit(1);
  }

  if (checkOnly) {
    console.log("讲义与论文真题常量均与主题包一致。");
    return;
  }

  const noteCount = notesSource.match(/^      summary:/gm)?.length ?? 0;
  const essayCount = essaySource.match(/^      prompt_md:/gm)?.length ?? 0;
  console.log(
    `已生成 ${relative(ROOT, OUTPUT_FILE)}（${noteCount} 篇讲义）与 ` +
      `${relative(ROOT, ESSAY_OUTPUT_FILE)}（${essayCount} 道论文真题）`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
