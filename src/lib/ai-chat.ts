// AI 调用的唯一入口。
//
// 为什么要有这个文件：在这之前有 7 个接口各写一遍
// 「读三个环境变量 → 判空 → AbortController 计时 → fetch → 取 choices[0].message.content
//  → 把失败翻成一句中文」，逐行 diff 下来只有错误文案和 messages 构造函数不同。
// 再加一种用法（M6 的知识图谱检查要传图片）就是第 8 份。
//
// 这里只做三件事：拼请求、把失败归成「给人看的一句话 + 一个状态码」、认图片。
// **不解析业务结构**——每个功能返回的 JSON 形状由各自的 prompt 层校验，
// 那部分本来就该分散，硬收进来会变成一个大而全的 if。

/** 一次请求里模型能看到的全部输入。M6 的图片走 image_url，不另开接口 */
export type ChatTextPart = { type: "text"; text: string };
export type ChatImagePart = { type: "image_url"; image_url: { url: string } };
export type ChatContent = string | Array<ChatTextPart | ChatImagePart>;

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: ChatContent;
};

export type ChatConfig = {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
};

/** 单次调用默认给多久。多段调用（如追问的「问→重问→收尾」）由调用方传 deadline 共用预算 */
const DEFAULT_TIMEOUT_MS = 50_000;

/** 剩下的预算少于这个数就别发了——发出去也注定超时，白等一轮 */
const MIN_USEFUL_MS = 2_000;

/**
 * AI 调用失败。带状态码是因为调用方要直接把它转成 HTTP 响应：
 * 没配置是 503（服务没就绪），调用失败/超时/空返回是 502（上游出了问题）。
 */
export class AiCallError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "AiCallError";
    this.status = status;
  }
}

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

/** 读环境变量。三项缺任何一项都算没配好，返回 null 由调用方决定怎么说 */
export function readChatConfig(): ChatConfig | null {
  const apiBaseUrl = process.env.AI_API_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;
  if (!apiBaseUrl || !apiKey || !model) return null;
  return { apiBaseUrl, apiKey, model };
}

export const AI_NOT_CONFIGURED_MESSAGE =
  "AI 服务尚未配置，请先设置 AI_API_BASE_URL、AI_API_KEY 和 AI_MODEL。";

/**
 * 调一次模型，返回纯文本内容。
 *
 * 失败一律抛 AiCallError（不返回 null、不返回 ok/fail 对象）：追问那边要连着调三次，
 * 中间任何一次失败都得中断整轮，抛出来最省事，也不用每处都判一遍。
 *
 * @param label 只进日志，用于区分是哪个功能出的错
 * @param deadline 绝对时间戳。传了就和 timeoutMs 取较小值，用于多段调用共用一份预算
 */
export async function callChat(options: {
  /** 只读：这里从不修改传入的消息，各 prompt 层返回的 `as const` 元组可以直接传 */
  messages: ReadonlyArray<ChatMessage>;
  temperature?: number;
  timeoutMs?: number;
  deadline?: number;
  label?: string;
}): Promise<string> {
  const config = readChatConfig();
  if (!config) throw new AiCallError(AI_NOT_CONFIGURED_MESSAGE, 503);

  const { label = "AI 调用" } = options;
  let budget = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (options.deadline != null) {
    budget = Math.min(budget, options.deadline - Date.now());
  }
  if (budget < MIN_USEFUL_MS) {
    throw new AiCallError("这次请求超时了，请重试。", 502);
  }

  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), budget);

  try {
    const response = await fetch(`${config.apiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        // 不给默认温度：每个功能的稳定度要求不同（归因要稳、追问要顺），由调用方定
        ...(options.temperature == null ? {} : { temperature: options.temperature }),
        messages: options.messages,
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      console.error(`${label}调用 AI 失败`, response.status);
      throw new AiCallError("AI 服务调用失败，请稍后重试。", 502);
    }

    const body = (await response.json()) as ChatCompletionResponse;
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new AiCallError("AI 没有返回可用内容。", 502);
    return content;
  } catch (error) {
    if (error instanceof AiCallError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiCallError("AI 响应超时。", 502);
    }
    console.error(`${label}调用异常`, error);
    throw new AiCallError("AI 服务超时或网络连接失败，请稍后重试。", 502);
  } finally {
    clearTimeout(timer);
  }
}

