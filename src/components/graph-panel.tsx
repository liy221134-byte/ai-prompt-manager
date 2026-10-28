"use client";

// 手绘知识图谱检查的两个界面块：主题页入口卡、检查抽屉。
//
// 交互上只有一条硬约束：**没有「帮我画一张」**（PRD 第 3 节第 7 条）。
// 抽屉里能做的三件事是：选模块 → 选图 → 看它挑出了什么。改不改、补不补，都在纸上和笔上。
//
// 为什么先选模块再传图，而不是先传图：
//   参照物决定「遗漏」这个词的含义。不选模块就等于拿全主题 29 个知识点去比，
//   他这周只学了挣值分析，返回的会是「你漏了 24 个」——那是一条正确但没用的结论。

import { useRef, useState } from "react";

import { DrawerShell } from "@/components/drawer-shell";
import {
  GRAPH_IMAGE_MAX_EDGE,
  countGraphFindings,
  describeScope,
  isCleanGraphCheck,
  type GraphCheck,
  type GraphReferencePoint,
  type GraphScopeModule,
} from "@/lib/learning/graph";
import { looksLikeImageNotRead } from "@/lib/learning/graph-prompt";

/**
 * 主题页上的入口卡。
 *
 * 不按模块列表排（与素材表不同）：素材表是「每个模块一张纸」，天然是列表；
 * 图谱是「一周一张图」，图里本来就会横跨几个模块，没有按模块切的必要。
 */
export function GraphBoard({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">手绘知识图谱</h2>
        <span className="text-xs text-slate-400">自己画，拍照给 AI，它只挑毛病</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        每周日花 30 分钟，把这一周学的知识点和它们之间的关系画在一张纸上——顺序、从属、谁包含谁。
        画完拍下来，让 AI 指出哪里漏了、哪块挂错了地方。
        <span className="text-slate-500">它不会替你画，画歪的那棵树才是诊断材料。</span>
      </p>
      <button
        className="mt-3 rounded border border-[#dbe7f5] bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:border-blue-300"
        onClick={onOpen}
        type="button"
      >
        检查这周的图
      </button>
    </section>
  );
}

export function GraphDrawer({
  modules,
  points,
  onClose,
}: {
  modules: GraphScopeModule[];
  /** 主题下的全部知识点（带归属模块）。选中哪个模块就取哪一批当参照物 */
  points: GraphReferencePoint[];
  onClose: () => void;
}) {
  const [scopeIds, setScopeIds] = useState<string[]>(modules.map((module) => module.id));
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [check, setCheck] = useState<GraphCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedModules = modules.filter((module) => scopeIds.includes(module.id));
  // 每个模块下有多少个知识点。用 Map 数一遍，避免每渲染一次就 O(n*m) 扫一次
  const pointsByModule = new Map<string, GraphReferencePoint[]>();
  for (const scope of modules) {
    pointsByModule.set(
      scope.id,
      points.filter((point) => point.moduleId === scope.id),
    );
  }
  const selectedPoints = selectedModules.flatMap(
    (module) => pointsByModule.get(module.id) ?? [],
  );
  const pointCount = selectedPoints.length;
  const notRead = check ? looksLikeImageNotRead(check, pointCount) : false;

  function toggleModule(moduleId: string) {
    setScopeIds((current) =>
      current.includes(moduleId)
        ? current.filter((id) => id !== moduleId)
        : [...current, moduleId],
    );
    // 范围一变，上一次的结论就作废了：它是按旧范围判的，留着只会误导
    setCheck(null);
  }

  async function acceptFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setCheck(null);
    try {
      setImageDataUrl(await compressToDataUrl(file));
    } catch (caught) {
      setImageDataUrl(null);
      setError(caught instanceof Error ? caught.message : "这张图读不了。");
    }
  }

  async function run() {
    // 按钮在没图时是 disabled，这里判一手只是为了收窄类型
    // （`imageDataUrl` 是 string | null，不判的话下面 JSON.stringify 里要再多一层）
    if (!imageDataUrl) return;
    setBusy(true);
    setError(null);
    setCheck(null);
    try {
      const response = await fetch("/api/learning/graph-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modules: selectedModules,
          // 只传选中模块的知识点。多传的会被服务端再挡一次
          points: selectedPoints,
          imageDataUrl,
          note,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { check?: GraphCheck; error?: string }
        | null;
      if (!response.ok || !payload?.check) {
        throw new Error(payload?.error ?? "检查没有返回结果。");
      }
      setCheck(payload.check);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "检查没跑起来。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DrawerShell
      onClose={onClose}
      subtitle="图是你画的，这里只做挑错。"
      title="手绘知识图谱检查"
      widthClassName="max-w-3xl"
    >
      <div className="space-y-5">
        {/* 第一步：范围 */}
        <section>
          <p className="text-sm font-medium text-slate-700">1. 这张图画了哪几个模块</p>
          <p className="mt-0.5 text-xs text-slate-400">
            只跟选中的模块比对。没选的不会被算成遗漏——这周没学的东西不该出现在这张图的欠账里。
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {modules.map((module) => {
              const active = scopeIds.includes(module.id);
              return (
                <button
                  key={module.id}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    active
                      ? "border-blue-300 bg-blue-50 text-blue-800"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                  }`}
                  onClick={() => toggleModule(module.id)}
                  type="button"
                >
                  {module.name}
                  <span className="ml-1 text-xs tabular-nums opacity-60">
                    {pointsByModule.get(module.id)?.length ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {describeScope(selectedModules)} · 共 {pointCount} 个知识点当参照
          </p>
        </section>

        {/* 第二步：图 */}
        <section>
          <p className="text-sm font-medium text-slate-700">2. 把画好的图放进来</p>
          <p className="mt-0.5 text-xs text-slate-400">
            JPG 或 PNG。传上来会先压到长边 {GRAPH_IMAGE_MAX_EDGE} 像素再发给 AI。
          </p>

          <input
            ref={fileInputRef}
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              void acceptFile(event.target.files?.[0]);
              // 清空 value：否则连续选同一个文件不会触发 change
              event.target.value = "";
            }}
            type="file"
          />

          {imageDataUrl ? (
            <div className="mt-2 flex items-start gap-3">
              {/* 用 img 而不是 next/image：这是本地 data URL，走优化器毫无收益 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt="待检查的手绘图"
                // 高度给到 384px：竖版 A4 照片在这个高度下宽约 500px，字能看清；
                // 再小就只能看个轮廓，而他要确认的正是「这张拍清楚了吗」
                className="max-h-96 rounded-lg border border-slate-200 object-contain"
                src={imageDataUrl}
              />
              <button
                className="shrink-0 rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-slate-300"
                onClick={() => {
                  setImageDataUrl(null);
                  setCheck(null);
                }}
                type="button"
              >
                换一张
              </button>
            </div>
          ) : (
            <button
              className={`mt-2 flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-8 text-sm transition-colors ${
                dragging
                  ? "border-blue-400 bg-blue-50 text-blue-700"
                  : "border-slate-300 bg-slate-50/60 text-slate-500 hover:border-slate-400"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragLeave={() => setDragging(false)}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                void acceptFile(event.dataTransfer.files?.[0]);
              }}
              type="button"
            >
              <span className="font-medium text-slate-700">点这里选图</span>
              <span className="text-xs text-slate-400">也可以把图拖进来</span>
            </button>
          )}
        </section>

        {/* 第三步：可选的说明 */}
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            3. 有什么要告诉它的（可以不填）
          </span>
          <span className="ml-2 text-xs text-slate-400">比如「右下角那块是上周画的」</span>
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none"
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            placeholder="写一句就行"
            value={note}
          />
        </label>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          <button
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={busy || !imageDataUrl}
            onClick={() => void run()}
            type="button"
          >
            {busy ? "正在看…" : check ? "再看一次" : "让它看看"}
          </button>
          {error ? <span className="text-xs text-red-600">{error}</span> : null}
        </div>

        {check ? <CheckResult check={check} notRead={notRead} /> : null}
      </div>
    </DrawerShell>
  );
}

/**
 * 结论展示。四类清单，顺序按「他接下来该改什么」排：
 * 漏的最要紧（那是没学会），错位次之，连线再次，看不清最后（那是我的问题，不是他的）。
 */
function CheckResult({ check, notRead }: { check: GraphCheck; notRead: boolean }) {
  if (isCleanGraphCheck(check)) {
    return (
      <p className="rounded-lg border-l-2 border-emerald-500 bg-emerald-50/60 px-3 py-2 text-sm leading-6 text-emerald-800">
        这张图上没挑出毛病：选中的范围里，知识点都画到了、位置也对。
        下周可以把新的模块加进来，或者换个问法——把两个看起来不相干的概念连起来试试。
      </p>
    );
  }

  return (
    <div className="space-y-3 border-t border-slate-100 pt-4">
      <p className="text-sm font-medium text-slate-800">
        挑出 {countGraphFindings(check)} 处
      </p>

      {notRead ? (
        <p className="rounded-lg border-l-2 border-amber-500 bg-amber-50/60 px-3 py-2 text-sm leading-6 text-amber-900">
          它几乎什么都没在图里认出来，更像是这张图没拍清楚，而不是你漏了一大片。
          换个光线、拍正一点、把字写大些再试一次。下面的清单先别当真。
        </p>
      ) : null}

      <ResultList
        items={check.missing}
        listTitle="图上没找到的"
        tone="blue"
        why="清单里有、这张图上找不到。要么真漏了，要么写了但看不清"
      />
      <ResultList
        items={check.misplaced}
        listTitle="挂错了位置"
        tone="amber"
        why="画在了别的模块那边"
      />
      <ResultList items={check.wrongLinks} listTitle="连线不对" tone="rose" why="不该连的两个连在了一起" />
      <ResultList items={check.unclear} listTitle="没看清" tone="slate" why="照片上认不出来，下次拍清楚些" />
    </div>
  );
}

const TONES = {
  blue: "border-blue-200 bg-blue-50/50 text-blue-900",
  amber: "border-amber-200 bg-amber-50/50 text-amber-900",
  rose: "border-rose-200 bg-rose-50/50 text-rose-900",
  slate: "border-slate-200 bg-slate-50 text-slate-700",
} as const;

function ResultList({
  items,
  listTitle,
  why,
  tone,
}: {
  items: string[];
  listTitle: string;
  why: string;
  tone: keyof typeof TONES;
}) {
  if (items.length === 0) return null;
  return (
    <section className={`rounded-lg border px-3 py-2 ${TONES[tone]}`}>
      <p className="flex flex-wrap items-baseline gap-2 text-sm font-medium">
        {listTitle}
        <span className="text-xs font-normal opacity-70">{why}</span>
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm leading-6">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

/**
 * 把用户选的图压成长边 GRAPH_IMAGE_MAX_EDGE 的 JPEG data URL。
 *
 * 为什么要压：手机原图 8—12MB，base64 之后还要涨三分之一，一次请求十几 MB，
 * 换来的判读效果和 1600 像素没有区别——手写字在 1600 长边上已经足够清楚。
 *
 * createImageBitmap 的 imageOrientation 必须显式给 "from-image"：
 * 手机拍的照片方向信息在 EXIF 里，不按它转的话横着拍的那张传到模型眼里是躺倒的。
 */
async function compressToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("这不是图片文件。");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("这张图读不了，请换成 JPG 或 PNG 的照片。");
  }

  try {
    const longestEdge = Math.max(bitmap.width, bitmap.height);
    const scale = longestEdge > GRAPH_IMAGE_MAX_EDGE ? GRAPH_IMAGE_MAX_EDGE / longestEdge : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("这个浏览器不支持压缩图片。");

    // 白底：PNG 的透明区转 JPEG 会变黑，纸的照片不该有黑块
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    bitmap.close();
  }
}
