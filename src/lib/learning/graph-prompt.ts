// M6 手绘知识图谱检查：拼提示词 + 校验返回。
//
// 这条提示词与素材表那条（sheet-prompt.ts）守的是同一条线，但难点不同：
//   素材表是「不许改写他写的字」；
//   图谱是「**不许替他画**」——模型看到一张潦草的图，天然想给你补一张完整的。
//   一旦它开始描述「你的图应该画成三层结构」，这张图就不再是他的了，
//   而这张图的价值恰恰在于「他心里那棵树长什么样」。画错的树才是诊断材料。
//
// 三道闸：
//   1. 返回结构里没有放「正确的图画法」的位置，只有四份清单。
//   2. `missing` 必须落在参照清单里——否则它会编出我没学过的概念，我去补一个不存在的东西。
//   3. `misplaced` 必须同时点名「哪个知识点」和「哪个模块」——否则就是「有些概念挂错了」
//      这种对着任何一张图都成立的废话。
//
// 为什么这次必须给参照清单（而素材表那边刻意不给讲义正文）：
//   素材表的清单本身就是他写的内容，给了讲义模型就会抄；
//   图谱的「遗漏」本质上就是相对清单的差集，不给清单，这个功能不存在。

import type { ChatMessage } from "../ai-chat.ts";
import { normalizeForCompare } from "./probe.ts";
import {
  GRAPH_IMAGE_MAX_BYTES,
  type GraphCheck,
  type GraphReferencePoint,
  type GraphScopeModule,
  mentionsPoint,
  mentionsPointAndModule,
  parseImageDataUrl,
} from "./graph.ts";

export type GraphCheckInput = {
  /** 这次要看哪几个模块（他选的） */
  modules: GraphScopeModule[];
  /** 选中模块下的知识点，含归属 */
  points: GraphReferencePoint[];
  /** 压缩后的图片 data URL */
  imageDataUrl: string;
  /** 他愿意补一句说明就补。可以空 */
  note: string;
};

/**
 * 校验请求体。
 *
 * 图片的错误分三种话术，因为对应的动作不同：
 *   格式不对 → 重新选一张（大概率选了 HEIC 或 PDF）
 *   太大     → 重新拍（客户端压缩没生效）
 *   没选     → 先选图
 * 合成一句「图片有问题」等于让他自己猜该做什么。
 */
export function validateGraphCheckRequest(
  body: unknown,
): { ok: true; value: GraphCheckInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "请求内容不是对象。" };
  const source = body as Record<string, unknown>;

  const modules = Array.isArray(source.modules)
    ? source.modules
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const row = item as Record<string, unknown>;
          const id = textOr(row.id, 80);
          const name = textOr(row.name, 120);
          return id && name ? { id, name } : null;
        })
        .filter((item): item is GraphScopeModule => item !== null)
        .slice(0, 12)
    : [];

  if (modules.length === 0) {
    return { ok: false, error: "先选这次要检查哪几个模块。" };
  }

  const points = Array.isArray(source.points)
    ? source.points
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const row = item as Record<string, unknown>;
          const name = textOr(row.name, 120);
          const moduleId = textOr(row.moduleId, 80);
          const moduleName = textOr(row.moduleName, 120);
          return name && moduleId && moduleName ? { name, moduleId, moduleName } : null;
        })
        .filter((item): item is GraphReferencePoint => item !== null)
        // 只留属于选中模块的：客户端传了范围外的知识点会把「遗漏」的分母放大，
        // 而这个功能的全部意义就在于分母是对的
        .filter((point) => modules.some((module) => module.id === point.moduleId))
        .slice(0, 80)
    : [];

  if (points.length === 0) {
    return {
      ok: false,
      error: "选中的模块下还没有知识点，没有参照物就判不了遗漏。",
    };
  }

  const image = parseImageDataUrl(source.imageDataUrl);
  if (!image) {
    return { ok: false, error: "这张图读不了，请选一张 JPG 或 PNG 的照片。" };
  }
  if (image.bytes > GRAPH_IMAGE_MAX_BYTES) {
    return { ok: false, error: "这张图太大了，请重新拍一张。" };
  }

  return {
    ok: true,
    value: { modules, points, imageDataUrl: source.imageDataUrl as string, note: textOr(source.note, 500) },
  };
}

const SYSTEM_PROMPT = `你是一名软考（系统集成项目管理工程师）辅导老师，正在看学生**自己手画**的知识图谱照片。

这张图是他在纸上画的，节点和连线都是他自己想出来的。你的工作只有一件：**指出图上缺了什么、哪里挂错了位置**。

你不是编辑，不是代画，也不是讲评老师。他画错了才是这份材料有用的地方——那说明他心里那棵树长歪了，你要指出歪在哪，不要替他把树扶正。

硬规则，违反任何一条这次检查就作废：
1. **不许替他画。** 不要描述「正确的图应该分几层」「建议按这个结构重画」，不要列出一张完整的知识结构。
   你只说图上哪一处不对、缺了什么。
2. **不许讲课。** 不要解释概念是什么、不要展开知识体系。他不知道的会自己翻书；你讲了，他只会读你的话。
3. 「缺了什么」**只能从给你的参照清单里挑**。清单里没有的，一个字都不许加——你加的每一个清单外的概念，
   都会让他去查一个这周根本不用管的东西。
4. 「挂错了位置」必须同时说清**哪个知识点**、**它现在画在哪个模块那边**、**参照清单里它属于哪个模块**。
   说不清这三样的，不要写——照片会糊，很多「错位」其实是你看错了。
5. **看不清就说看不清。** 字迹潦草、反光、拍虚了导致你没法确认的，写进 unclear，不要猜。
   猜错的代价是他跑去补一个其实已经画了的知识点。
6. 不要评价（不说「画得挺全」「结构清晰」），不要鼓励语，不要分点套话。
7. 每条控制在 40 字以内。四类都可以是空数组——他没有漏也没有错，就返回空的。
8. 只输出 JSON，不要 markdown 围栏，不要任何解释文字。`;

const SHAPE = `输出结构：
{
  "missing": ["参照清单里有、这张图上找不到的知识点"],
  "misplaced": ["「知识点」画在了「某模块」那边，按清单应属于「某模块」"],
  "wrongLinks": ["「A」和「B」之间的连线不对，因为……"],
  "unclear": ["图上看不清、没法判的地方"]
}`;

export function buildGraphCheckMessages(input: GraphCheckInput): ReadonlyArray<ChatMessage> {
  const byModule = new Map<string, string[]>();
  for (const point of input.points) {
    const list = byModule.get(point.moduleName) ?? [];
    list.push(point.name);
    byModule.set(point.moduleName, list);
  }

  const referenceBlock = [...byModule.entries()]
    .map(([moduleName, names]) => `### ${moduleName}（${names.length} 个）\n${names.join("、")}`)
    .join("\n\n");

  const userText = [
    `这次要看 ${input.modules.length} 个模块：${input.modules.map((module) => module.name).join("、")}`,
    "",
    "参照清单（这张图上本该出现的知识点，按所属模块分组）：",
    referenceBlock,
    "",
    input.note ? `他自己的说明：${input.note}` : "（他没有补充说明）",
    "",
    "这是他的手绘图：",
    "",
    SHAPE,
  ].join("\n");

  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      // 数组形式：文字在前、图在后。反过来的话部分兼容实现会把图当上下文丢失
      content: [
        { type: "text", text: userText },
        { type: "image_url", image_url: { url: input.imageDataUrl } },
      ],
    },
  ];
}

const ITEM_MAX = 60;
const MAX_PER_LIST = 10;

/**
 * 校验并规整模型返回。
 *
 * 两处闸门（与提示词第 3、4 条一一对应）：
 *   `missing` 必须落在参照清单里，否则丢掉——编出来的概念会让人去补一个不存在的东西。
 *   `misplaced` 必须同时点名知识点与模块，否则丢掉——挡「有些概念挂错了地方」这类废话。
 *
 * 另有一处**去重**：模型很容易把同一个知识点在 missing 里说两遍（换个说法）。
 * 用归一化后的名字当键，保留第一条。
 */
export function normalizeGraphCheck(raw: string, input: GraphCheckInput): GraphCheck {
  const parsed = safeParse(raw);
  if (!parsed || typeof parsed !== "object") throw new Error("AI 返回的结构不对。");

  const source = parsed as Record<string, unknown>;

  const missing = uniqueBy(
    asTextArray(source.missing, MAX_PER_LIST).filter((item) =>
      mentionsPoint(item, input.points),
    ),
  );

  const misplaced = uniqueBy(
    asTextArray(source.misplaced, MAX_PER_LIST).filter((item) =>
      mentionsPointAndModule(item, input.points, input.modules),
    ),
  );

  // 这两类没有可核对的字面依据，只做长度与条数限制。
  // 不能像 missing 那样卡清单：连线与看不清本来就该是清单外的信息。
  const wrongLinks = uniqueBy(asTextArray(source.wrongLinks, MAX_PER_LIST));
  const unclear = uniqueBy(asTextArray(source.unclear, MAX_PER_LIST));

  return { missing, misplaced, wrongLinks, unclear };
}

/**
 * 有没有可能「模型压根没读出这张图」。
 *
 * 判据：missing 几乎顶满参照清单（≥ 清单的 80% 且 ≥ 6 条）。
 * 这个形状不是「他漏了一大片」，而是「图没拍进去」——一张正常的图不可能让 80% 的知识点都找不到。
 * 界面据此换一句提示，免得他真去补二十几个其实已经画了的知识点。
 *
 * 为什么阈值是 80% 而不是 100%：模型即使读不出图，也会凭清单里最容易的几个词
 * 假装「看到了两个」，凑巧避开 100% 这个整齐的数。
 */
export function looksLikeImageNotRead(check: GraphCheck, referenceCount: number): boolean {
  if (referenceCount < 6) return false;
  return check.missing.length >= 6 && check.missing.length / referenceCount >= 0.8;
}

function safeParse(raw: string): unknown {
  if (typeof raw !== "string" || !raw.trim()) throw new Error("AI 返回内容为空。");
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("AI 返回里找不到 JSON 对象。");
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new Error("AI 返回的不是有效 JSON。");
  }
}

function textOr(value: unknown, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > max ? text.slice(0, max) : text;
}

function asTextArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0)
    .slice(0, max)
    .map((item) => (item.length > ITEM_MAX ? `${item.slice(0, ITEM_MAX - 1)}…` : item));
}

/** 按归一化文本去重，保留先出现的那条 */
function uniqueBy(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = normalizeForCompare(item);
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}
