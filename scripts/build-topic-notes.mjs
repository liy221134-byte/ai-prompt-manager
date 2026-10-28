// 讲义常量生成器：把主题包里的讲义（summary + body）编成一份 TS 常量。
//
// 为什么讲义不存进数据库、也不在运行时读 yaml：
//   1) 运行时读 yaml 在生产会 404。Next.js 只把被 import 的文件打进产物，
//      docs/ 目录不在其中——Vercel 上 process.cwd() 里找不到 docs/learning/topics。
//   2) 存库要一次 DDL（knowledge_points 加两列）。讲义是随主题包分发的静态内容，
//      不是用户产生的数据：它不参与判分、不参与统计、有读无写。
//      给只读内容建副本，等于给自己多养一份必须同步的真源。
//   生成成常量两头都不欠：编译进 bundle，没有运行时 IO，也没有迁移依赖。
//   主题包仍是唯一内容源，本文件是派生物——`--check` 负责拦「改了 yaml 忘了重新生成」。
//
// 用法：
//   node scripts/build-topic-notes.mjs          重新生成 src/lib/learning/topic-notes.generated.ts
//   node scripts/build-topic-notes.mjs --check  只比对不写盘，不一致退 1（测试与 CI 用）

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import yaml from "js-yaml";

import { validateNote } from "./import-topic-pack.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const TOPICS_DIR = join(ROOT, "docs/learning/topics");
export const OUTPUT_FILE = join(ROOT, "src/lib/learning/topic-notes.generated.ts");

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

function main() {
  const checkOnly = process.argv.includes("--check");
  const { source } = buildTopicNotesSource();

  if (checkOnly) {
    let current = "";
    try {
      current = readFileSync(OUTPUT_FILE, "utf8");
    } catch {
      // 文件不存在也算不一致，下面统一报
    }
    if (current !== source) {
      console.error(
        `讲义常量与主题包不同步：${relative(ROOT, OUTPUT_FILE)}\n` +
          "重新生成：npm run gen:topic-notes",
      );
      process.exit(1);
    }
    console.log("讲义常量与主题包一致。");
    return;
  }

  writeFileSync(OUTPUT_FILE, source, "utf8");
  const count = source.match(/^      summary:/gm)?.length ?? 0;
  console.log(`已生成 ${relative(ROOT, OUTPUT_FILE)}（${count} 篇讲义）`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
