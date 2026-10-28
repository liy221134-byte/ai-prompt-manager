// 主题包导入器：把 AI 产出的 yaml 写进学习系统的四张表。
//
// 用法：
//   node scripts/import-topic-pack.mjs <yaml 路径> --dry-run   只校验、只打印，不写库
//   node scripts/import-topic-pack.mjs <yaml 路径>             校验通过后写库
//
// 写库需要 .env.local 里的 NEXT_PUBLIC_SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY
// （与 scripts/sync-cloud.mjs 用的是同一组，服务角色直连，不走用户会话）。
//
// 两条设计原则：
// 1. 先校验、后写入。校验不过就整份拒绝，不写半份数据。
// 2. 幂等。同一 topic.id 重复导入只更新不新增；中途失败直接重跑，不需要清理。
//    （不做跨表事务：Supabase REST 没有跨表事务，硬做要写 RPC，属于过度设计。
//      幂等 + 按外键顺序写，已经让重跑是安全的。）

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import yaml from "js-yaml";

// ────────────────────────────────────────────────────────
// 一、校验：全部规则集中在 validateTopicPack，纯函数、不碰 IO，方便单测
// ────────────────────────────────────────────────────────

const LEVEL_MIN = 1;
const LEVEL_MAX = 5;
const WEIGHT_SUM = 1;
const EPSILON = 1e-6;

/**
 * 校验主题包。返回错误字符串数组，空数组代表通过。
 * 报错一律带上「在哪、哪个字段、差多少」，让人不用读代码就知道改哪。
 */
export function validateTopicPack(pack) {
  const errors = [];
  const at = (path, id) => (id ? `${path}（${id}）` : path);

  if (!pack || typeof pack !== "object") {
    return ["文件内容不是对象，可能是空文件或格式错误"];
  }

  // 版本号允许小数（1 → 1.1 → 1.2），所以判「是不是正数」而不是「是不是整数」
  if (
    typeof pack.schema_version !== "number" ||
    !Number.isFinite(pack.schema_version) ||
    pack.schema_version <= 0
  ) {
    errors.push("schema_version 必填，且必须是正数（如 1、1.1）");
  }

  // ── topic ──
  const topic = pack.topic;
  if (!topic || typeof topic !== "object") {
    errors.push("topic 缺失");
  } else {
    for (const field of ["id", "name", "goal", "deadline"]) {
      if (!topic[field]) errors.push(`topic.${field} 必填`);
    }
    if (!Number.isFinite(topic.total_hours)) {
      errors.push("topic.total_hours 必填且必须是数字");
    }

    // exam_facts.milestones 是约定出来的键（不新建列，塞在现有 jsonb 里），
    // 所以这里替它把关：每项必须有名字和能解析的日期，否则主题页的倒计时会静默算错。
    const milestones = topic.exam_facts?.milestones;
    if (milestones != null) {
      if (!Array.isArray(milestones)) {
        errors.push("topic.exam_facts.milestones 必须是数组");
      } else {
        milestones.forEach((item, index) => {
          const path = `topic.exam_facts.milestones[${index}]`;
          if (!item?.name) errors.push(`${path}.name 必填`);
          if (!item?.date || Number.isNaN(Date.parse(item.date))) {
            errors.push(`${path}.date 缺失或不是合法日期（要 YYYY-MM-DD）`);
          }
        });
      }
    }
  }

  // ── modules ──
  const modules = Array.isArray(pack.modules) ? pack.modules : [];
  if (modules.length === 0) {
    errors.push("modules 为空：至少要有一个内容模块");
  }

  const moduleIds = new Set();
  const orders = [];
  let weightSum = 0;
  let hoursSum = 0;

  modules.forEach((mod, index) => {
    const path = `modules[${index}]`;
    if (!mod.id) {
      errors.push(`${path}.id 必填`);
      return;
    }
    if (moduleIds.has(mod.id)) errors.push(`${path}.id 重复：${mod.id}`);
    moduleIds.add(mod.id);

    for (const field of ["name", "entry_criteria", "exit_criteria"]) {
      if (!mod[field]) errors.push(at(`${path}.${field} 必填`, mod.id));
    }
    if (!Array.isArray(mod.common_mistakes) || mod.common_mistakes.length === 0) {
      errors.push(at(`${path}.common_mistakes 至少写一条`, mod.id));
    }
    if (!Number.isInteger(mod.order)) {
      errors.push(at(`${path}.order 必须是整数`, mod.id));
    } else {
      orders.push(mod.order);
    }
    if (!Number.isFinite(mod.weight)) {
      errors.push(at(`${path}.weight 必须是数字`, mod.id));
    } else {
      weightSum += mod.weight;
    }
    if (!Number.isFinite(mod.planned_hours)) {
      errors.push(at(`${path}.planned_hours 必须是数字`, mod.id));
    } else {
      hoursSum += mod.planned_hours;
    }
    if (
      mod.expected_gap != null &&
      (!Number.isInteger(mod.expected_gap) ||
        mod.expected_gap < 1 ||
        mod.expected_gap > 5)
    ) {
      errors.push(at(`${path}.expected_gap 必须在 1—5 之间`, mod.id));
    }

    // 这一条是刻意的：写成「S1 达标」等于没写，它是模块依赖，不是能力标准
    if (typeof mod.entry_criteria === "string" && /^S\d+\s*达标/.test(mod.entry_criteria)) {
      errors.push(
        at(
          `${path}.entry_criteria 写成了模块依赖（"${mod.entry_criteria}"）。` +
            `这里要写可观察的行为，例如「能判断某场景属于哪个过程组」`,
          mod.id,
        ),
      );
    }
  });

  // order 从 1 起连续、不重复
  const sortedOrders = [...orders].sort((a, b) => a - b);
  sortedOrders.forEach((value, index) => {
    if (value !== index + 1) {
      errors.push(`modules[].order 必须从 1 起连续且不重复（实际：${sortedOrders.join(", ")}）`);
      return;
    }
  });

  if (modules.length > 0 && Math.abs(weightSum - WEIGHT_SUM) > EPSILON) {
    errors.push(
      `weight 合计 ${weightSum.toFixed(4)}，应为 ${WEIGHT_SUM.toFixed(2)}，` +
        `差 ${(weightSum - WEIGHT_SUM).toFixed(4)}`,
    );
  }
  if (Number.isFinite(topic?.total_hours) && Math.abs(hoursSum - topic.total_hours) > EPSILON) {
    errors.push(
      `planned_hours 合计 ${hoursSum}，应等于 topic.total_hours ${topic.total_hours}，` +
        `差 ${hoursSum - topic.total_hours}`,
    );
  }

  // ── knowledge_points ──
  const kps = Array.isArray(pack.knowledge_points) ? pack.knowledge_points : [];
  const kpIds = new Set();
  kps.forEach((kp, index) => {
    const path = `knowledge_points[${index}]`;
    if (!kp.id) {
      errors.push(`${path}.id 必填`);
      return;
    }
    if (kpIds.has(kp.id)) errors.push(`${path}.id 重复：${kp.id}`);
    kpIds.add(kp.id);
    if (!kp.name) errors.push(at(`${path}.name 必填`, kp.id));
    if (!kp.module_id) {
      errors.push(at(`${path}.module_id 必填`, kp.id));
    } else if (!moduleIds.has(kp.module_id)) {
      errors.push(at(`${path}.module_id "${kp.module_id}" 在 modules 里不存在`, kp.id));
    }
  });
  // parent 要在全部 id 收集完之后再校验
  kps.forEach((kp, index) => {
    if (kp.parent && !kpIds.has(kp.parent)) {
      errors.push(`knowledge_points[${index}].parent "${kp.parent}" 不存在（${kp.id}）`);
    }
  });

  // ── questions ──
  const questions = Array.isArray(pack.questions) ? pack.questions : [];
  const questionIds = new Set();
  questions.forEach((q, index) => {
    const path = `questions[${index}]`;
    if (!q.id) {
      errors.push(`${path}.id 必填`);
      return;
    }
    if (questionIds.has(q.id)) errors.push(`${path}.id 重复：${q.id}`);
    questionIds.add(q.id);

    for (const field of ["category", "type", "difficulty", "title", "body_md", "answer"]) {
      if (!q[field]) errors.push(at(`${path}.${field} 必填`, q.id));
    }
    if (!Array.isArray(q.options)) {
      errors.push(at(`${path}.options 必须是数组（实操题给空数组）`, q.id));
    }
    if (!q.explanation_md) errors.push(at(`${path}.explanation_md 必填`, q.id));

    if (q.module_id && !moduleIds.has(q.module_id)) {
      errors.push(at(`${path}.module_id "${q.module_id}" 不存在`, q.id));
    }
    if (q.kp_id && !kpIds.has(q.kp_id)) {
      errors.push(at(`${path}.kp_id "${q.kp_id}" 不存在`, q.id));
    }
    if (q.level != null) {
      if (!Number.isInteger(q.level) || q.level < LEVEL_MIN || q.level > LEVEL_MAX) {
        errors.push(
          at(`${path}.level 必须是 ${LEVEL_MIN}—${LEVEL_MAX} 的整数（实际：${q.level}）`, q.id),
        );
      }
    }
    if (q.source && !["ai", "web", "manual"].includes(q.source)) {
      errors.push(at(`${path}.source 只能是 ai / web / manual（实际：${q.source}）`, q.id));
    }
  });

  return errors;
}

/** 把 YAML 解析错误翻成人话：文件、行列、原始信息都保留，不吞掉细节。 */
function parseYamlFile(path) {
  const raw = readFileSync(path, "utf8");
  try {
    return yaml.load(raw);
  } catch (error) {
    const line = error.mark?.line != null ? error.mark.line + 1 : "?";
    const column = error.mark?.column != null ? error.mark.column + 1 : "?";
    const hint =
      /bad indentation|expected <block end>|unexpected end/.test(error.message)
        ? "常见原因：markdown 字段用了单行写法。body_md / explanation_md 必须用 block scalar（|）"
        : "";
    throw new Error(
      `YAML 解析失败：${path}\n  第 ${line} 行 第 ${column} 列\n  原始信息：${error.reason ?? error.message}` +
        (hint ? `\n  提示：${hint}` : ""),
    );
  }
}

// ────────────────────────────────────────────────────────
// 行映射
// ────────────────────────────────────────────────────────

/**
 * 把主题包里的一道题翻译成 practice_questions 表的一行。
 *
 * 为什么单独抽出来（2026-10-28）：写库时曾经漏掉 type 字段，34 道实操题被数据库
 * 默认值悄悄写成「单选」——页面上会以单选题形式渲染、options 为空无法作答，
 * 而校验器查的是 YAML 本身，完全发现不了。抽成纯函数才能被单测钉住。
 *
 * type 给「单选」兜底而不是留空：该列是 not null default '单选'，
 * 显式写出来比依赖默认值可靠，导入行为不随建表语句变化。
 */
export function toQuestionRow(q, topicId) {
  return {
    id: q.id,
    asset_id: null,
    category: q.category,
    type: q.type || "单选",
    title: q.title,
    body_md: q.body_md,
    options: q.options ?? [],
    answer: q.answer,
    explanation_md: q.explanation_md,
    difficulty: q.difficulty,
    knowledge_point: q.kp_id ?? null,
    source: q.source ?? "manual",
    source_url: q.source_url ?? null,
    topic_id: topicId,
    module_id: q.module_id ?? null,
    level: q.level ?? null,
  };
}

// ────────────────────────────────────────────────────────
// 二、写库
// ────────────────────────────────────────────────────────

async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "缺少环境变量 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY（写在 .env.local 里）",
    );
  }
  const { createClient: create } = await import("@supabase/supabase-js");
  return create(url, key, { auth: { persistSession: false } });
}

async function mustWrite(result, what) {
  if (result.error) {
    throw new Error(`${what} 写入失败：${result.error.message}`);
  }
}

/** 按外键顺序写：主题 → 模块 → 知识点（先不带 parent）→ 补 parent → 题目。 */
async function importPack(supabase, pack) {
  const topic = pack.topic;

  await mustWrite(
    await supabase.from("learning_topics").upsert(
      {
        id: topic.id,
        name: topic.name,
        goal: topic.goal,
        deadline: topic.deadline,
        total_hours: topic.total_hours,
        start_date: topic.start_date ?? null,
        exam_facts: topic.exam_facts ?? {},
        schema_version: pack.schema_version,
        raw: topic,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    ),
    "learning_topics",
  );

  await mustWrite(
    await supabase.from("learning_modules").upsert(
      pack.modules.map((mod) => ({
        topic_id: topic.id,
        id: mod.id,
        order_index: mod.order,
        name: mod.name,
        scope_chapters: mod.scope_chapters ?? [],
        weight: mod.weight,
        expected_gap: mod.expected_gap ?? null,
        planned_hours: mod.planned_hours,
        entry_criteria: mod.entry_criteria,
        exit_criteria: mod.exit_criteria,
        common_mistakes: mod.common_mistakes ?? [],
        min_project: mod.min_project ?? null,
        note: mod.note ?? null,
      })),
      { onConflict: "topic_id,id" },
    ),
    "learning_modules",
  );

  // 两趟写 parent：自引用外键要求父行先存在，先全插 parent=null，再补值
  const kps = pack.knowledge_points ?? [];
  if (kps.length > 0) {
    await mustWrite(
      await supabase.from("knowledge_points").upsert(
        kps.map((kp, index) => ({
          topic_id: topic.id,
          id: kp.id,
          module_id: kp.module_id,
          parent_id: null,
          name: kp.name,
          ref: kp.ref ?? null,
          order_index: index + 1,
        })),
        { onConflict: "topic_id,id" },
      ),
      "knowledge_points",
    );

    const withParent = kps.filter((kp) => kp.parent);
    for (const kp of withParent) {
      await mustWrite(
        await supabase
          .from("knowledge_points")
          .update({ parent_id: kp.parent })
          .eq("topic_id", topic.id)
          .eq("id", kp.id),
        `knowledge_points.parent（${kp.id}）`,
      );
    }
  }

  const questions = pack.questions ?? [];
  if (questions.length > 0) {
    await mustWrite(
      await supabase
        .from("practice_questions")
        .upsert(
          questions.map((q) => toQuestionRow(q, topic.id)),
          { onConflict: "id" },
        ),
      "practice_questions",
    );
  }

  return {
    topics: 1,
    modules: pack.modules.length,
    knowledge_points: kps.length,
    questions: questions.length,
  };
}

// ────────────────────────────────────────────────────────
// 三、命令入口
// ────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((arg) => !arg.startsWith("--"));
  const dryRun = args.includes("--dry-run");

  if (!file) {
    console.error("用法：node scripts/import-topic-pack.mjs <yaml 路径> [--dry-run]");
    process.exitCode = 1;
    return;
  }

  const path = resolve(process.cwd(), file);
  const pack = parseYamlFile(path);

  const errors = validateTopicPack(pack);
  if (errors.length > 0) {
    console.error(`[校验失败] ${path}`);
    for (const error of errors) console.error("  · " + error);
    console.error(`\n共 ${errors.length} 处问题，未写入任何数据。`);
    process.exitCode = 1;
    return;
  }

  const summary = {
    topic: pack.topic.id,
    modules: pack.modules.length,
    knowledge_points: (pack.knowledge_points ?? []).length,
    questions: (pack.questions ?? []).length,
  };

  if (dryRun) {
    console.log("[校验通过 · 预演模式，未写库]", summary);
    return;
  }

  const supabase = await createClient();
  const written = await importPack(supabase, pack);
  console.log("[导入完成]", { topic: pack.topic.id, ...written });
}

// 只有直接运行才执行 main，被测试 import 时不动
if (process.argv[1] && process.argv[1].endsWith("import-topic-pack.mjs")) {
  main().catch((error) => {
    console.error("[导入失败] " + error.message);
    process.exitCode = 1;
  });
}
