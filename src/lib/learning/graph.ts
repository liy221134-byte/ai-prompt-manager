// M6 手绘知识图谱检查：类型、常量与纯校验。不碰网络、不碰 React。
//
// 这件事的边界（PRD 第 2 节第 7 条 + 第 3 节第 7 条）：
//   **图是他自己在纸上画的，拍下来给 AI 看，AI 只指出遗漏和层级错位，不替他生成。**
// 所以这里没有「生成图谱」的函数，也没有任何能产出「应该这样画」的结构。
//
// 为什么这件事必须落成产品功能而不是随手丢给对话窗口：
//   随手问一次，问题在于**没有参照物**——模型不知道这周该画哪些知识点，
//   它只能凭印象说「你好像漏了沟通管理」，说的是它想到的，不是我该会的。
//   产品手里有真的参照物：主题包里的 29 个知识点，各自挂在哪个模块。
//   把这份清单喂进去，「遗漏」才是相对我的大纲说的，不是相对模型记忆说的。

import { normalizeForCompare } from "./probe.ts";

/** 一个模块，只留判「错位」需要的字段 */
export type GraphScopeModule = {
  id: string;
  name: string;
};

/** 参照清单里的一条：知识点属于哪个模块（id 用于过滤，name 用于给人看与给模型看） */
export type GraphReferencePoint = {
  name: string;
  moduleId: string;
  moduleName: string;
};

/**
 * 一次检查的结论。四类，每一类都可能是空数组。
 *
 * 为什么单开 `unclear` 而不是让模型硬判：
 *   手绘照片会糊、会反光、字会写成连笔。逼模型在「看不清」和「没画」之间二选一，
 *   它一定猜——猜错的代价是我跑去补一个其实已经画了的知识点，白费半小时。
 *   给它一个说「看不清」的出口，比逼它判要诚实。
 */
export type GraphCheck = {
  /** 参照清单里有、图上找不到的 */
  missing: string[];
  /** 画错了从属关系：「知识点」挂在了错的模块下 */
  misplaced: string[];
  /** 连线关系错：把不该连的两个概念连在了一起 */
  wrongLinks: string[];
  /** 图上看不清、没法判的 */
  unclear: string[];
};

export function emptyGraphCheck(): GraphCheck {
  return { missing: [], misplaced: [], wrongLinks: [], unclear: [] };
}

/** 四类都空，等于「这次没挑出毛病」 */
export function isCleanGraphCheck(check: GraphCheck): boolean {
  return (
    check.missing.length === 0 &&
    check.misplaced.length === 0 &&
    check.wrongLinks.length === 0 &&
    check.unclear.length === 0
  );
}

/** 一共挑出几条。界面标题上用它 */
export function countGraphFindings(check: GraphCheck): number {
  return (
    check.missing.length + check.misplaced.length + check.wrongLinks.length + check.unclear.length
  );
}

// ── 图片 ─────────────────────────────────────────────────────────

/**
 * 上传前在浏览器里把长边压到这个像素。
 *
 * 为什么是 1600：手写字的辨识度在长边 1600 左右就够（A4 纸拍满画面的情况），
 * 再大对判读没有帮助，只是把请求体撑大、把首字节时间拉长。
 */
export const GRAPH_IMAGE_MAX_EDGE = 1600;

/**
 * 服务端接受的 base64 解码后大小上限（4MB）。
 *
 * 客户端压完通常 300KB 上下，这个上限只用来拦住「直接把手机原图塞过来」
 * （现在手机原图动辄 8—12MB，base64 还要再涨三分之一）。
 */
export const GRAPH_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

/** 只收这几种。HEIC 浏览器多半已经转过，转不了的在这里挡掉并给出话术 */
const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export type ParsedImage = {
  mime: string;
  /** 纯 base64，不含 `data:` 前缀 */
  base64: string;
  /** 解码后的字节数 */
  bytes: number;
};

/**
 * 拆 `data:image/jpeg;base64,xxxx`。
 *
 * 返回 null 而不是抛错：调用方要把「格式不对」和「太大了」翻译成两句不同的话，
 * 而这两件事在浏览器里对应的动作也不一样（前者要重新选图，后者要重新拍）。
 */
export function parseImageDataUrl(value: unknown): ParsedImage | null {
  if (typeof value !== "string") return null;
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(value.trim());
  if (!match) return null;

  const mime = match[1].toLowerCase();
  if (!ALLOWED_IMAGE_MIME.has(mime)) return null;

  const base64 = match[2];
  // base64 每 4 个字符对应 3 字节，末尾的 padding 要扣掉
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const bytes = Math.floor((base64.length * 3) / 4) - padding;

  return { mime, base64, bytes };
}

/** 给人看的大小。日志与错误话术里用 */
export function describeBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ── 参照清单 ──────────────────────────────────────────────────────

/**
 * 从库里的两坨数据拼出参照清单。
 *
 * 只取「这次选中的模块」下的知识点：周日画一张图通常只覆盖本周学的 1—2 个模块，
 * 拿全主题 29 个去比对，会把还没学的全算成遗漏——那种清单只有噪音，没有信息。
 */
export function buildReferencePoints(
  knowledgePoints: Array<{ name: string; module_id: string | null }>,
  modules: GraphScopeModule[],
  scopeIds: readonly string[],
): GraphReferencePoint[] {
  const scope = new Set(scopeIds);
  const nameById = new Map(modules.map((module) => [module.id, module.name]));

  return knowledgePoints
    .filter((point) => point.module_id != null && scope.has(point.module_id))
    .map((point) => ({
      name: point.name,
      moduleId: point.module_id as string,
      moduleName: nameById.get(point.module_id as string) ?? "未归属模块",
    }));
}

/**
 * 这一条意见里有没有真的点到「某个知识点」和「某个模块」。
 *
 * 用来挡 `misplaced`：模型最容易出的话是「有些概念挂错了地方」——
 * 一句正确的废话，对着任何一张图都成立，也就没有任何用处。
 * 只有同时点了名（谁错了、错到什么模块下）的，才留下。
 */
export function mentionsPointAndModule(
  item: string,
  points: readonly GraphReferencePoint[],
  modules: readonly GraphScopeModule[],
): boolean {
  return hitsAnyName(item, points.map((point) => point.name)) &&
    hitsAnyName(item, modules.map((module) => module.name));
}

/** 这一条意见里有没有点到参照清单里的某个知识点 */
export function mentionsPoint(item: string, points: readonly GraphReferencePoint[]): boolean {
  return hitsAnyName(item, points.map((point) => point.name));
}

/**
 * 文本里是否出现候选名中的任意一个。
 *
 * 判法用「互相包含」而不是「完全相等」：模型会把名字写全
 * （图上写「WBS 分解」，清单里是「工作分解结构 WBS」），也会写简称。
 * 这种模糊匹配在「挑毛病」这个场景里够用——它只决定留不留一条，不决定判对判错。
 */
export function hitsAnyName(text: string, candidates: readonly string[]): boolean {
  const target = normalizeForCompare(text);
  if (target.length === 0) return false;
  return candidates.some((candidate) => {
    const name = normalizeForCompare(candidate);
    if (name.length < 2) return false;
    return target.includes(name) || name.includes(target);
  });
}

/**
 * 界面上的一句话范围说明。
 *
 * 不写「全主题」这种词：它看起来更像完整，但会把没学的模块也算成遗漏，
 * 说出来的是假话。宁可写清这次只看哪几块。
 */
export function describeScope(modules: readonly GraphScopeModule[]): string {
  if (modules.length === 0) return "还没选模块";
  if (modules.length === 1) return modules[0].name;
  return `${modules.length} 个模块：${modules.map((module) => module.name).join("、")}`;
}
