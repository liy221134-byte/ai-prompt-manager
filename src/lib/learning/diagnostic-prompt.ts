// M4 诊断的 AI 归因：拼提示词 + 校验模型返回。
//
// 分工先说清楚：**层级由规则判（lib/learning/diagnostic.ts），模型只做归因**。
// 为什么不让模型直接判「你在第几层」：同一份作答换一次调用可能给出不同层数，
// 而层级要长期挂在学习目标上、要能跟「今天该做哪几层」联动。一个不可复现的数字
// 做不了这种地基。归因不一样——「你卡在把输入当成输出的那一步」这种判断，
// 规则写不出来，模型写得好，而且人一看就能否掉，错了也不污染地基。

import { LEVELS } from "./matrix.ts";

export type LevelDefinitionItem = {
  level: number;
  name: string;
  criteria?: string;
  evidence?: string;
};

export type AdviceModuleInput = {
  moduleId: string;
  moduleName: string;
  /** 连续答对的层数，0 表示第一层就没过 */
  reached: number;
  /** 停下那层的原因。wrong = 真没过；no-question / unanswered = 没测 */
  stoppedAt: { level: number; reason: "wrong" | "no-question" | "unanswered" } | null;
  wrongAnswers: Array<{
    level: number;
    title: string;
    selected: string | null;
    correct: string | null;
    knowledgePointName: string | null;
  }>;
  /** 这一块可选的知识点名，用来约束模型别自己编 */
  knowledgePointNames: string[];
};

export type DiagnosticAdviceInput = {
  topicName: string;
  levelDefinition: unknown;
  modules: AdviceModuleInput[];
};

export type ModuleAdvice = {
  moduleId: string;
  /** 卡在哪。一句话，具体到动作或概念，不是「掌握不牢」这种空话 */
  stuck: string;
  /** 补哪些知识点。只能用给的候选名 */
  missing: string[];
  /** 下一步做什么。每条要能当天执行 */
  next: string[];
};

export type DiagnosticAdvice = {
  summary: string;
  modules: ModuleAdvice[];
};

/** 把 level_definition 归一成可用形态；读不到就退化成 L1—L5，不硬编造判据 */
export function normalizeLevelDefinition(definition: unknown): LevelDefinitionItem[] {
  const fallback: LevelDefinitionItem[] = LEVELS.map((level) => ({
    level,
    name: `L${level}`,
  }));
  if (!Array.isArray(definition)) return fallback;

  const result: LevelDefinitionItem[] = [];
  for (const item of definition) {
    if (!item || typeof item !== "object") continue;
    const source = item as Record<string, unknown>;
    const level = Number(source.level);
    if (!Number.isInteger(level) || level < 1 || level > 5) continue;
    result.push({
      level,
      name: typeof source.name === "string" && source.name.trim() ? source.name.trim() : `L${level}`,
      criteria: typeof source.criteria === "string" ? source.criteria : undefined,
      evidence: typeof source.evidence === "string" ? source.evidence : undefined,
    });
  }

  return result.length === 5 ? result.sort((a, b) => a.level - b.level) : fallback;
}

/**
 * 校验请求体。
 *
 * 为什么要逐字段校验而不是直接 `as`：这个路由会把内容送进付费的大模型调用。
 * 前端参数写错时，若不校验就直接拼提示词，得到的是「调用成功但归因胡说」——
 * 花钱换一段废话，比报错更糟。
 */
export function validateDiagnosticRequest(
  body: unknown,
):
  | { ok: true; value: DiagnosticAdviceInput }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "请求内容不是对象。" };
  }

  const source = body as Record<string, unknown>;
  const topicName = typeof source.topicName === "string" ? source.topicName.trim() : "";
  if (!topicName) {
    return { ok: false, error: "缺少主题名。" };
  }

  if (!Array.isArray(source.modules) || source.modules.length === 0) {
    return { ok: false, error: "缺少模块判定结果。" };
  }
  if (source.modules.length > 40) {
    return { ok: false, error: "模块数量异常。" };
  }

  const modules: AdviceModuleInput[] = [];
  for (const item of source.modules) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "模块判定结果的格式不对。" };
    }
    const entry = item as Record<string, unknown>;
    const moduleId = typeof entry.moduleId === "string" ? entry.moduleId.trim() : "";
    if (!moduleId) {
      return { ok: false, error: "有模块缺少 id。" };
    }

    const reachedRaw = Number(entry.reached);
    if (!Number.isInteger(reachedRaw) || reachedRaw < 0 || reachedRaw > 5) {
      return { ok: false, error: `模块 ${moduleId} 的层数不合法。` };
    }

    let stoppedAt: AdviceModuleInput["stoppedAt"] = null;
    if (entry.stoppedAt && typeof entry.stoppedAt === "object") {
      const stop = entry.stoppedAt as Record<string, unknown>;
      const level = Number(stop.level);
      const reason = stop.reason;
      if (!Number.isInteger(level) || level < 1 || level > 5) {
        return { ok: false, error: `模块 ${moduleId} 的停点层数不合法。` };
      }
      if (reason !== "wrong" && reason !== "no-question" && reason !== "unanswered") {
        return { ok: false, error: `模块 ${moduleId} 的停点原因不合法。` };
      }
      stoppedAt = { level, reason };
    }

    const wrongAnswers: AdviceModuleInput["wrongAnswers"] = [];
    if (Array.isArray(entry.wrongAnswers)) {
      for (const wrong of entry.wrongAnswers.slice(0, 10)) {
        if (!wrong || typeof wrong !== "object") continue;
        const record = wrong as Record<string, unknown>;
        const level = Number(record.level);
        if (!Number.isInteger(level) || level < 1 || level > 5) continue;
        wrongAnswers.push({
          level,
          title: textOr(record.title, 600),
          selected: textOrNull(record.selected, 300),
          correct: textOrNull(record.correct, 300),
          knowledgePointName: textOrNull(record.knowledgePointName, 120),
        });
      }
    }

    const knowledgePointNames = Array.isArray(entry.knowledgePointNames)
      ? entry.knowledgePointNames
          .map((name) => (typeof name === "string" ? name.trim() : ""))
          .filter((name) => name.length > 0)
          .slice(0, 60)
      : [];

    modules.push({
      moduleId,
      moduleName: textOr(entry.moduleName, 80) || moduleId,
      reached: reachedRaw,
      stoppedAt,
      wrongAnswers,
      knowledgePointNames,
    });
  }

  return {
    ok: true,
    value: {
      topicName: textOr(source.topicName, 120),
      levelDefinition: source.levelDefinition,
      modules,
    },
  };
}

function textOr(value: unknown, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > max ? text.slice(0, max) : text;
}

function textOrNull(value: unknown, max: number): string | null {
  const text = textOr(value, max);
  return text.length > 0 ? text : null;
}

const SYSTEM_PROMPT = `你是一名软考（系统集成项目管理工程师）辅导老师，正在给学生做一次诊断卷的复盘。

学生会给你两样东西：
1. 每个内容模块的判定结果——从第 1 层往上连续答对到第几层、停在哪一层、为什么停。
2. 他答错的题（题干、他选的、正确答案、所属知识点）。

你要输出的不是分数，是「他脑子里哪一步错了」和「今天该干什么」。

硬性要求：
- 只针对**答错的题**做归因。答对的和没测的层不要评论。
- 如果某模块停下是因为「这层没题」而不是答错，说明这块**没测**，不要当成不会，也不要编造他的水平。
- 「缺哪些知识点」只能从给你的候选知识点名单里选，一个字都不能自己编。
- 「下一步」每条要能在今天或本周内做完，写成动作（「把 S2 的三道挣值题重算一遍并把 PV/EV/AC 对应到合同条款上」），不要写「加强理解」这类空话。
- 不要复述题干，不要写鼓励语，不要用「首先其次最后」串段落。
- 每一条控制在 40 字以内。

只输出 JSON，不要任何解释文字、不要 markdown 围栏。结构：
{
  "summary": "一两句话说清这次诊断最要紧的发现（不超过 60 字）",
  "modules": [
    {
      "moduleId": "S1",
      "stuck": "卡在哪一步，一句话",
      "missing": ["知识点名"],
      "next": ["具体动作", "具体动作"]
    }
  ]
}
没有答错题的模块不要出现在 modules 里。`;

/** 拼消息。temperature 由调用方给（这里固定低温度，归因不该有创造性） */
export function buildDiagnosticMessages(input: DiagnosticAdviceInput): Array<{
  role: "system" | "user";
  content: string;
}> {
  const levels = normalizeLevelDefinition(input.levelDefinition);
  const levelLines = levels
    .map((item) => {
      const parts = [`第${item.level}层 ${item.name}`];
      if (item.criteria) parts.push(`判据：${item.criteria}`);
      if (item.evidence) parts.push(`证据：${item.evidence}`);
      return `- ${parts.join("；")}`;
    })
    .join("\n");

  const moduleBlocks = input.modules
    .map((module) => {
      const stopText =
        module.stoppedAt === null
          ? "全部层都答对了"
          : module.stoppedAt.reason === "wrong"
            ? `第${module.stoppedAt.level}层答错`
            : module.stoppedAt.reason === "no-question"
              ? `第${module.stoppedAt.level}层没有可判分的题，未测`
              : `第${module.stoppedAt.level}层没作答`;

      const wrongText =
        module.wrongAnswers.length === 0
          ? "（本模块没有答错的题）"
          : module.wrongAnswers
              .map((wrong, index) => {
                const parts = [
                  `${index + 1}. 【第${wrong.level}层】${truncate(wrong.title, 160)}`,
                ];
                if (wrong.knowledgePointName) parts.push(`知识点：${wrong.knowledgePointName}`);
                if (wrong.selected) parts.push(`他选：${truncate(wrong.selected, 80)}`);
                if (wrong.correct) parts.push(`正确：${truncate(wrong.correct, 80)}`);
                return parts.join(" | ");
              })
              .join("\n");

      const candidateText =
        module.knowledgePointNames.length > 0
          ? module.knowledgePointNames.join("、")
          : "（这一块没有知识点清单，missing 返回空数组）";

      return [
        `## 模块 ${module.moduleId} ${module.moduleName}`,
        `连续答对到第 ${module.reached} 层；${stopText}`,
        `候选知识点：${candidateText}`,
        `答错的题：`,
        wrongText,
      ].join("\n");
    })
    .join("\n\n");

  const userContent = [
    `主题：${input.topicName}`,
    ``,
    `五层阶梯的定义：`,
    levelLines,
    ``,
    `各模块的判定与错题：`,
    moduleBlocks,
  ].join("\n");

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];
}

const SUMMARY_MAX = 120;
const ITEM_MAX = 60;
const MAX_NEXT = 3;
const MAX_MISSING = 4;

/**
 * 校验并规整模型返回。
 *
 * 解析策略是「结构错了就抛、内容长了就截」：
 *   - 拿不到 JSON 或 modules 不是数组 → 抛错，上层降级成纯规则结论（有诊断无归因，好过整次失败）
 *   - 长度超了、条目多了 → 截断，不因为模型啰嗦就把整次诊断作废
 *   - moduleId 不在预期里 → 丢弃，不把模型幻觉出来的模块塞进结果
 */
export function normalizeDiagnosticAdvice(
  raw: string,
  expectedModuleIds: Iterable<string>,
): DiagnosticAdvice {
  const json = extractJson(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("AI 返回的不是有效 JSON。");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI 返回的结构不对。");
  }

  const source = parsed as Record<string, unknown>;
  const allowed = new Set(expectedModuleIds);
  const rawModules = Array.isArray(source.modules) ? source.modules : null;

  if (!rawModules) {
    throw new Error("AI 返回里没有 modules 数组。");
  }

  const modules: ModuleAdvice[] = [];
  for (const item of rawModules) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const moduleId = typeof entry.moduleId === "string" ? entry.moduleId.trim() : "";
    if (!moduleId || !allowed.has(moduleId)) continue;
    if (modules.some((module) => module.moduleId === moduleId)) continue;

    modules.push({
      moduleId,
      stuck: truncate(asText(entry.stuck), ITEM_MAX),
      missing: asTextArray(entry.missing, MAX_MISSING),
      next: asTextArray(entry.next, MAX_NEXT),
    });
  }

  return {
    summary: truncate(asText(source.summary), SUMMARY_MAX),
    modules,
  };
}

/** 模型常把 JSON 包在 ```json 围栏里，或前后加一句「结果如下」。都挖出来 */
function extractJson(raw: string): string {
  if (typeof raw !== "string") throw new Error("AI 返回内容为空。");

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const candidate = fenced ? fenced[1] : raw;

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI 返回里找不到 JSON 对象。");
  }
  return candidate.slice(start, end + 1);
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asTextArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0)
    .slice(0, max)
    .map((item) => truncate(item, ITEM_MAX));
}

function truncate(text: string, max: number): string {
  const chars = [...text];
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join("")}…`;
}
