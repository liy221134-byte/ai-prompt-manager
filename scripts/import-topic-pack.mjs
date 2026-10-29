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
 * 四类目标性质。选哪一类不看「想要什么」，看「这个目标拿什么判成败」。
 * 这条分类决定用哪套阶梯模板，所以校验时必须拦住乱填的值。
 */
export const VALID_KINDS = ["exam", "skill", "system", "behavior"];

/**
 * 内置阶梯模板：主题包没写 level_definition 时按 kind 取这一套。
 *
 * 为什么把模板放在代码里而不是只写在文档里：
 *   文档给人看，这里给机器用。两边不一致时，机器的行为才是真的。
 *   文档与这张表必须同步改（契约 docs/learning/topic-pack-schema.md 第一节）。
 *
 * 所有判据都遵守同一条规则：看「做到这件事需要什么」，不看「难不难」。
 * 也都不含「理解 / 掌握 / 熟悉 / 了解」这类不可判词——校验器会禁这几个词，
 * 模板自己当然不能违反。
 */
export const BUILTIN_LEVEL_TEMPLATES = {
  exam: [
    { level: 1, name: "认得", criteria: "给选项能挑对，但说不出为什么", evidence: "单选 easy" },
    { level: 2, name: "说得出", criteria: "不看资料，用自己的话讲清它是什么、几个要素", evidence: "判断 / 简答" },
    { level: 3, name: "算得出", criteria: "套公式、走流程，能一次做对", evidence: "计算 / 流程默写" },
    { level: 4, name: "判得准", criteria: "给没见过的场景，判断属于哪个过程组、该走哪条流程", evidence: "场景题 / 案例" },
    { level: 5, name: "迁得动", criteria: "错题能归因到哪个概念错；能拿自己的项目对着讲一遍", evidence: "实操 / 案例改写" },
  ],
  skill: [
    { level: 1, name: "看得懂", criteria: "读别人的代码能说出它在干嘛", evidence: "能复述一段代码的作用" },
    { level: 2, name: "改得动", criteria: "在现有代码上改一行并跑通", evidence: "改动后能运行" },
    { level: 3, name: "写得出", criteria: "给需求，能独立写出可运行的代码", evidence: "不照抄教程写出来的脚本" },
    { level: 4, name: "调得通", criteria: "报错能定位、能改对、能说清原因", evidence: "自己修掉一个真 bug" },
    { level: 5, name: "能设计", criteria: "能自己拆结构、选方案，不只跟着教程走", evidence: "从零起一个小工具" },
  ],
  system: [
    { level: 1, name: "有框架", criteria: "知道这个领域分哪几块", evidence: "能画出分类骨架" },
    { level: 2, name: "能分类", criteria: "任给一条素材，能归到某一块", evidence: "随手素材能归类" },
    { level: 3, name: "能填满", criteria: "每一块都有实际素材，不空着", evidence: "每块至少一条真实记录" },
    { level: 4, name: "能互相支撑", criteria: "块与块之间能引用、能解释关系", evidence: "能说出 A 块怎么支撑 B 块" },
    { level: 5, name: "能教人", criteria: "能讲给不懂的人听懂", evidence: "一次真实讲解" },
  ],
  behavior: [
    { level: 1, name: "知道有这回事", criteria: "能复述概念，但举不出自己的例子", evidence: "复述" },
    { level: 2, name: "能识别处境", criteria: "能判断自己现在处在哪种情形", evidence: "对上自己的一个真实场景" },
    { level: 3, name: "能设计动作", criteria: "能写出一次具体要说什么、做什么", evidence: "一份可执行的对话脚本" },
    { level: 4, name: "做过有反馈", criteria: "真做过，并拿到了对方的反应", evidence: "一次真实发生的交互" },
    { level: 5, name: "稳定复用", criteria: "换了场景还能用同一套做法", evidence: "第二次以上成功" },
  ],
};

/** 判据里出现这些词就等于没写判据——跟 entry_criteria 同一条规矩。 */
const VAGUE_CRITERIA_WORDS = ["理解", "掌握", "熟悉", "了解"];

/**
 * 讲义的固定三段（外加 summary 一句话，共四段）。
 *
 * 为什么把这三段写在校验器里而不是只写在文档里：
 *   讲义最容易退化的方式不是写错，是「只写了一段还能通过」。
 *   只写「要素」就成了笔记，只写「例题」就成了题解，缺「怎么考」
 *   就不知道这个知识点在卷面上长什么样。机械检查这三段，比事后靠自觉补回来便宜。
 *
 * 只检查小标题存在，不检查每段多少字——长度这类事交给写的人判断，
 * 机器去管它反而会逼出凑字数的填充段。
 */
export const NOTE_SECTIONS = ["### 要素", "### 例题", "### 怎么考"];

/** 一句话定义的上限。超过就不是一句话了，是摘要。 */
export const SUMMARY_MAX_CHARS = 60;

/** 主题包的 kind，缺省按考试型（v1 的包都是考试型）。 */
export function resolveKind(pack) {
  return pack?.topic?.kind ?? "exam";
}

/**
 * 得到这份主题包最终该用的五层定义。
 * 包里有就用自己的，没有按 kind 取内置模板——v1/v1.1 的旧包因此不用改就能导。
 */
export function resolveLevelDefinition(pack) {
  const declared = pack?.level_definition;
  if (Array.isArray(declared) && declared.length > 0) {
    return declared.map((item) => ({
      level: item.level,
      name: item.name,
      criteria: item.criteria,
      evidence: item.evidence ?? null,
    }));
  }
  return BUILTIN_LEVEL_TEMPLATES[resolveKind(pack)] ?? BUILTIN_LEVEL_TEMPLATES.exam;
}

/**
 * 校验 level_definition。只在主题包显式写了的时候才校验——
 * 没写就是走内置模板，而模板本身在单测里已经钉住了。
 */
function validateLevelDefinition(declared, errors) {
  if (!Array.isArray(declared) || declared.length === 0) return;

  if (declared.length !== 5) {
    errors.push(`level_definition 必须是 5 条（实际 ${declared.length} 条）`);
  }

  const seenLevels = new Set();
  const seenNames = new Set();

  declared.forEach((item, index) => {
    const path = `level_definition[${index}]`;

    if (!Number.isInteger(item?.level) || item.level < LEVEL_MIN || item.level > LEVEL_MAX) {
      errors.push(`${path}.level 必须是 ${LEVEL_MIN}—${LEVEL_MAX} 的整数（实际：${item?.level}）`);
    } else if (seenLevels.has(item.level)) {
      errors.push(`${path}.level 重复：${item.level}`);
    } else {
      seenLevels.add(item.level);
    }

    const name = typeof item?.name === "string" ? item.name.trim() : "";
    if (!name) {
      errors.push(`${path}.name 必填`);
    } else if (seenNames.has(name)) {
      // 两层叫同一个名字，说明这两层没想清区别
      errors.push(`${path}.name 与前面某一层重名（${name}），五层的名字必须各不相同`);
    } else {
      seenNames.add(name);
    }

    const criteria = typeof item?.criteria === "string" ? item.criteria.trim() : "";
    if (!criteria) {
      errors.push(`${path}.criteria 必填——这一层怎么算达到了，必须能出题验证`);
    } else {
      const vague = VAGUE_CRITERIA_WORDS.find((word) => criteria.includes(word));
      if (vague) {
        errors.push(
          `${path}.criteria 含不可判词「${vague}」。改写成可观察的行为，` +
            `例如「给一个没见过的场景能判断落在哪个过程组」`,
        );
      }
    }
  });

  for (let level = LEVEL_MIN; level <= LEVEL_MAX; level += 1) {
    if (!seenLevels.has(level)) {
      errors.push(`level_definition 缺第 ${level} 层（五层必须齐全，缺一层矩阵就塌一格）`);
    }
  }
}

/**
 * 校验一个知识点的讲义（note）。可选——没写讲义的主题包照样能导入。
 *
 * 返回错误数组，不改入参。抽成独立函数是为了能被单测直接调，
 * 不用为了试一条规则去造一整份主题包。
 */
export function validateNote(note, at) {
  const errors = [];

  if (note == null) return errors;

  if (typeof note !== "object" || Array.isArray(note)) {
    errors.push(`${at}.note 必须是对象（含 summary 与 body 两个字段）`);
    return errors;
  }

  const summary = typeof note.summary === "string" ? note.summary.trim() : "";
  if (!summary) {
    errors.push(`${at}.note.summary 必填——一句话讲清这个知识点是什么`);
  } else {
    const length = [...summary].length; // 按字符数算，不按码元，中文才不会被算成两倍
    if (length > SUMMARY_MAX_CHARS) {
      errors.push(
        `${at}.note.summary 有 ${length} 字，超过 ${SUMMARY_MAX_CHARS} 字上限。` +
          `这里的定位是「一句话」，写长就是摘要，摘要放 body`,
      );
    }
  }

  const body = typeof note.body === "string" ? note.body : "";
  if (!body.trim()) {
    errors.push(`${at}.note.body 必填`);
    return errors;
  }

  for (const section of NOTE_SECTIONS) {
    if (!body.includes(section)) {
      errors.push(
        `${at}.note.body 缺「${section}」。讲义固定四段（summary + 要素 / 例题 / 怎么考），` +
          `少一段会退化：只有要素是笔记，只有例题是题解，缺「怎么考」就不知道它在卷面上长什么样`,
      );
    }
  }

  return errors;
}

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
    // kind 可缺省（缺省按考试型），填了就必须是四类之一——它决定用哪套阶梯模板
    if (topic.kind != null && !VALID_KINDS.includes(topic.kind)) {
      errors.push(
        `topic.kind 只能是 ${VALID_KINDS.join(" / ")}（实际：${topic.kind}）。` +
          `它决定用哪套阶梯模板，填错会拿错模板去量`,
      );
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
    errors.push(...validateNote(kp.note, at(path, kp.id)));
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

  // ── level_definition（v2，可缺省）──
  validateLevelDefinition(pack.level_definition, errors);

  return errors;
}

/** 把 YAML 解析错误翻成人话：文件、行列、原始信息都保留，不吞掉细节。 */
function parseYamlFile(path) {  const raw = readFileSync(path, "utf8");
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

/**
 * 把一个知识点翻译成 knowledge_points 表的一行。
 *
 * 抽出理由与 toQuestionRow 同源：字段映射漏一项，导入日志照样报成功。
 *
 * 讲义（note）不写库：讲义是随主题包分发的静态内容，有读无写，
 * 由 scripts/build-topic-notes.mjs 编译成常量给前端用（理由见那个脚本顶部）。
 * 但讲义格式照样在这里校验（validateTopicPack 里调 validateNote）——
 * 内容质量门要拦在生成之前，别让一份缺「怎么考」的讲义混进 bundle。
 */
export function toKnowledgePointRow(kp, topicId, orderIndex) {
  return {
    topic_id: topicId,
    id: kp.id,
    module_id: kp.module_id,
    parent_id: null, // 自引用外键，第二趟再补，见 importPack
    name: kp.name,
    ref: kp.ref ?? null,
    order_index: orderIndex,
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

/**
 * 阶梯定义入库后不许改。
 *
 * 为什么这条要硬拦：重导入是常态（补题、改工时都会重导）。如果重导时顺手把
 * 「L3 算得出」改成「L3 会用」，库里的历史答题记录还带着旧 level 数字，
 * 同一个 3 在两段时间里含义不同——趋势图会静默变成假的，且看不出哪里错。
 *
 * 比较只看 level / name / criteria 三项，evidence 和顺序不影响判读，不参与比对。
 */
async function assertLevelDefinitionUnchanged(supabase, topicId, next) {
  const { data, error } = await supabase
    .from("learning_topics")
    .select("level_definition")
    .eq("id", topicId)
    .maybeSingle();

  if (error) {
    // 列不存在（迁移未执行）会走这里。报清楚是哪一步，别让人猜。
    throw new Error(
      `读取已有阶梯定义失败：${error.message}\n` +
        `  如果是「column doesn't exist」，说明 M2 迁移还没执行：` +
        `supabase/migrations/20261028150000_add_learning_goals.sql`,
    );
  }

  const existing = data?.level_definition;
  if (!Array.isArray(existing) || existing.length === 0) return;

  const fingerprint = (definition) =>
    JSON.stringify(
      [...definition]
        .sort((a, b) => a.level - b.level)
        .map((item) => [item.level, item.name, item.criteria]),
    );

  if (fingerprint(existing) === fingerprint(next)) return;

  const before = existing.map((i) => `L${i.level} ${i.name}`).join(" / ");
  const after = next.map((i) => `L${i.level} ${i.name}`).join(" / ");
  throw new Error(
    `阶梯定义与库里已有的不一致，拒绝写入。\n` +
      `  库里：${before}\n` +
      `  本次：${after}\n` +
      `  阶梯是历史趋势的基准，不能原地改。真要换判据，请给主题换一个新 id 另存。`,
  );
}

/** 按外键顺序写：主题 → 模块 → 知识点（先不带 parent）→ 补 parent → 题目。 */
async function importPack(supabase, pack) {
  const topic = pack.topic;
  const kind = resolveKind(pack);
  const levelDefinition = resolveLevelDefinition(pack);

  // 阶梯定义一旦入库就不再接受改动：今天的 L3 和三个月后的 L3 必须是同一件事，
  // 否则历史答题记录和趋势全废。要改判据只能新开一个主题 id。
  await assertLevelDefinitionUnchanged(supabase, topic.id, levelDefinition);

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
        kind,
        level_definition: levelDefinition,
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
        // 缺省 true：存量主题包不写这个字段，行为不变
        in_diagnostic: mod.in_diagnostic ?? true,
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
        kps.map((kp, index) => toKnowledgePointRow(kp, topic.id, index + 1)),
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

  const levelDefinition = resolveLevelDefinition(pack);
  const kps = pack.knowledge_points ?? [];
  const summary = {
    topic: pack.topic.id,
    kind: resolveKind(pack),
    levels: levelDefinition.map((item) => `L${item.level}${item.name}`).join(" "),
    modules: pack.modules.length,
    // 讲义条数单独报：有内容的和没内容的知识点，页面上是两种状态，
    // 导入日志不区分的话，写完一批也看不出到底落库了几份
    knowledge_points: `${kps.length}（含讲义 ${kps.filter((kp) => kp.note?.body).length}）`,
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
