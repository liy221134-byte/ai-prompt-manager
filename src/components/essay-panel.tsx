"use client";

// 论文批改抽屉（M7）。
//
// 界面上的硬约束有两条，都来自设计文档：
//   ① **没有任何分数**。不显示总分、不显示「能不能过线」。只显示档位与依据。
//   ② **没有「按这条建议改写」按钮**，也不出现可以直接贴回论文的句子。
//      一旦有这个按钮，这篇论文就不再是他写的，而考场上是模型去不了的地方。
//
// 为什么全屏：左边放论文原文、右边放批改结论，两边要能对照着看。
// 侧栏 672px 宽放两栏，每栏不到 320px，中文一行不到 15 字，读不下去。

import { useState } from "react";

import { DrawerShell } from "@/components/drawer-shell";
import {
  DIMENSIONS,
  HARD_LINE_LABELS,
  NO_EVIDENCE,
  countEssayChars,
  describeCoverage,
  isCleanReview,
  type EssayReview,
} from "@/lib/learning/essay";

/** 库里的一行批改记录 */
export type EssayReviewRow = {
  id: string;
  prompt_text: string;
  essay_text: string;
  draft_label: string | null;
  word_count: number;
  result: unknown;
  created_at: string;
};

/**
 * 主题页上的入口卡片。
 *
 * 排在素材表与图谱之后：这三件是同一层的「输出型」动作——
 * 素材表把一个模块压成一页纸，图谱把几个模块连成一张网，论文把一整段项目经历写成一篇。
 * 论文排最后，因为它最长、最费时间，也最不该在做题之前做。
 */
export function EssayBoard({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">论文批改</h2>
        <span className="text-xs text-slate-400">自己写，AI 只指出哪条没答到</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        高项论文给两道题、二选一，120 分钟打字写完。把题目和正文一起贴进来，
        它会按题目里那几个子问题逐条对照——哪条没答、哪条只讲了理论没落到你的项目、
        哪条缺具体指标。
        <span className="text-slate-500">不给分，也不代写。</span>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          className="rounded border border-[#dbe7f5] bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:border-blue-300"
          onClick={onOpen}
          type="button"
        >
          批改一篇
        </button>
        {count > 0 ? <span className="text-xs text-slate-400">已批过 {count} 篇</span> : null}
      </div>
    </section>
  );
}

export function EssayDrawer({
  history,
  onSave,
  onClose,
}: {
  /** 已存的批改记录，按时间倒序 */
  history: EssayReviewRow[];
  /** 写库。返回新记录的 id */
  onSave: (input: {
    promptText: string;
    essayText: string;
    draftLabel: string;
    review: EssayReview;
  }) => Promise<string>;
  onClose: () => void;
}) {
  const [promptText, setPromptText] = useState("");
  const [essayText, setEssayText] = useState("");
  const [draftLabel, setDraftLabel] = useState("");

  const [review, setReview] = useState<EssayReview | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  /** 正在看哪一稿的历史。null 表示看的就是当前这次 */
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  /** 左边原文栏收没收起来。默认展开——他需要对照，但长文读久会想收 */
  const [essayVisible, setEssayVisible] = useState(true);

  const charCount = countEssayChars(essayText);
  const canSubmit = promptText.trim().length >= 10 && essayText.trim().length >= 100 && !reviewing;

  // 看历史时，左边显示那一稿的原文；否则显示当前输入
  const activeRow = activeRowId ? history.find((row) => row.id === activeRowId) ?? null : null;
  const showPrompt = activeRow ? activeRow.prompt_text : promptText;
  const showEssay = activeRow ? activeRow.essay_text : essayText;
  const showReview = activeRow ? readStoredReview(activeRow.result) : review;

  async function runReview() {
    setReviewing(true);
    setError(null);
    setSavedId(null);
    setSaveError(null);
    setActiveRowId(null);

    try {
      const response = await fetch("/api/learning/essay-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptText, essayText, draftLabel }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { review?: EssayReview; error?: string }
        | null;
      if (!response.ok || !payload?.review) {
        throw new Error(payload?.error ?? "批改没有返回结果。");
      }
      setReview(payload.review);

      // 落库失败不影响看结果：AI 那半分钟已经花掉了，不能因为写库出错就白跑一趟。
      // 但要说清「这次没存上」，否则他下次进来找不到这一稿，会以为功能坏了。
      try {
        const id = await onSave({ promptText, essayText, draftLabel, review: payload.review });
        setSavedId(id);
      } catch (caught) {
        setSaveError(caught instanceof Error ? caught.message : "这次批改没存上。");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "批改没跑起来。");
    } finally {
      setReviewing(false);
    }
  }

  return (
    <DrawerShell
      onClose={onClose}
      subtitle="贴题目、贴论文。只指出哪条没答到，不给分、不代写。"
      title="论文批改"
      variant="fullscreen"
      contentClassName="mx-auto w-full max-w-6xl"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* ── 左栏：输入 / 原文 ─────────────────────────── */}
        <div className="min-w-0">
          {activeRow ? (
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-slate-700">
                  {activeRow.draft_label || "未标稿次"} 的原文
                </p>
                <button
                  className="rounded border border-[#dbe7f5] bg-white px-2.5 py-1 text-xs text-slate-600 transition-colors hover:border-blue-300"
                  onClick={() => {
                    setActiveRowId(null);
                    // 回输入状态要一并清掉「已存为一条记录」：那句话是上一次批改的结论，
                    // 留着会让人以为接下来改动的这版也会自动存
                    setSavedId(null);
                    setSaveError(null);
                  }}
                  type="button"
                >
                  回到输入
                </button>
              </div>
              <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
                {activeRow.prompt_text}
              </p>
              <pre className="mt-3 max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-800">
                {activeRow.essay_text}
              </pre>
              <p className="mt-2 text-xs text-slate-400">约 {activeRow.word_count} 字</p>
            </div>
          ) : (
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  题目原文<span className="ml-1 text-xs font-normal text-slate-400">连子问题一起贴</span>
                </span>
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 text-slate-800 focus:border-blue-400 focus:outline-none"
                  onChange={(event) => setPromptText(event.target.value)}
                  placeholder="例：论信息系统项目质量管理 / 1. 概要叙述你参与的项目…… / 2.（1）……（2）……（3）……"
                  rows={6}
                  value={promptText}
                />
                <span className="mt-1 block text-xs text-slate-400">
                  没有题目就不会判——判切不切题，靠的就是题目里那几个子问题。
                </span>
              </label>

              <label className="block">
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-slate-700">论文正文</span>
                  <span className="text-xs text-slate-400">
                    {charCount > 0 ? `约 ${charCount} 字` : "机考是打字，直接复制过来就行"}
                  </span>
                </span>
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-7 text-slate-800 focus:border-blue-400 focus:outline-none"
                  onChange={(event) => setEssayText(event.target.value)}
                  placeholder="从考试系统里复制整篇贴进来。"
                  rows={16}
                  value={essayText}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  稿次<span className="ml-1 text-xs font-normal text-slate-400">可空，只用来区分列表</span>
                </span>
                <input
                  className="mt-1 w-40 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:border-blue-400 focus:outline-none"
                  onChange={(event) => setDraftLabel(event.target.value)}
                  placeholder="第 1 稿"
                  value={draftLabel}
                />
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={!canSubmit}
                  onClick={() => void runReview()}
                  type="button"
                >
                  {reviewing ? "正在看…" : "开始批改"}
                </button>
                {reviewing ? (
                  <span className="text-xs text-slate-400">整篇要读一遍，通常半分钟左右</span>
                ) : null}
                {!canSubmit && !reviewing ? (
                  <span className="text-xs text-slate-400">
                    题目和正文都填了才能批
                  </span>
                ) : null}
              </div>

              {error ? <p className="text-sm text-amber-700">批改没跑起来：{error}</p> : null}
            </div>
          )}
        </div>

        {/* ── 右栏：产出 ───────────────────────────────── */}
        <div className="min-w-0">
          {showReview ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs text-slate-400">
                  {showPrompt.length > 60 ? `${showPrompt.slice(0, 60)}…` : showPrompt}
                </p>
                <button
                  className="shrink-0 rounded border border-[#dbe7f5] bg-white px-2.5 py-1 text-xs text-slate-600 transition-colors hover:border-blue-300"
                  onClick={() => setEssayVisible((value) => !value)}
                  type="button"
                >
                  {essayVisible ? "收起原文" : "展开原文"}
                </button>
              </div>

              {essayVisible && !activeRow ? (
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-xs leading-6 text-slate-600">
                  {showEssay}
                </pre>
              ) : null}

              {savedId ? (
                <p className="text-xs text-slate-400">已存为一条记录，下面「之前的批改」里能看到。</p>
              ) : null}
              {saveError ? (
                <p className="text-xs text-amber-700">{saveError}（结果还在，可以照着改）</p>
              ) : null}

              <SubQuestionTable review={showReview} />
              <HardLineList review={showReview} />
              <DimensionList review={showReview} />
              <TopFix review={showReview} />

              {isCleanReview(showReview) ? (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
                  这次没挑出明显问题。这不等于能过——阅卷还有标准答案没在题面里写着。
                </p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center">
              <p className="text-sm text-slate-500">批改结果会出现在这里。</p>
              <p className="mt-1 text-xs text-slate-400">
                四块：题目子问题对照 · 三条硬线的疑点 · 五个维度档位 · 如果只改一处
              </p>
            </div>
          )}
        </div>
      </div>

      {history.length > 0 ? (
        <HistoryList
          activeRowId={activeRowId}
          history={history}
          onPick={(id) => {
            setActiveRowId(id);
            setEssayVisible(false);
          }}
        />
      ) : null}
    </DrawerShell>
  );
}

/**
 * 把库里读回来的 jsonb 收成 EssayReview。
 *
 * 不抛错、缺的补空：历史记录是几个月前写的，字段以后可能增减，
 * 一条旧记录读不出来不能把整个抽屉带崩。
 * 这里不做深度校验——写进库的是我们自己 normalizeEssayReview 过的结构。
 */
export function readStoredReview(raw: unknown): EssayReview | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const subQuestions = Array.isArray(source.subQuestions) ? source.subQuestions : [];
  if (subQuestions.length === 0) return null;

  return {
    subQuestions: subQuestions as EssayReview["subQuestions"],
    hardLineSuspects: Array.isArray(source.hardLineSuspects)
      ? (source.hardLineSuspects as EssayReview["hardLineSuspects"])
      : [],
    dimensions: Array.isArray(source.dimensions)
      ? (source.dimensions as EssayReview["dimensions"])
      : [],
    topFix: typeof source.topFix === "string" ? source.topFix : "",
  };
}

// ── ① 子问题对照表 ────────────────────────────────────────────────

function SubQuestionTable({ review }: { review: EssayReview }) {
  const total = review.subQuestions.length;

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">题目问的这几件事，你答到了哪</h3>
        <span className="text-xs text-slate-400">{describeCoverage(review)}</span>
      </div>

      {total === 0 ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          没从题目里读出子问题。多半是题目贴得不全——把「（1）（2）（3）」那几行也一起贴进来再批一次。
        </p>
      ) : (
        <ol className="mt-2 space-y-2">
          {review.subQuestions.map((item, index) => (
            <li
              key={`${item.question}-${index}`}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <div className="flex items-start gap-2">
                {/* 序号而不是勾叉：答没答不是「对错」，用勾叉会像是在判分 */}
                <span className="mt-0.5 shrink-0 text-xs tabular-nums text-slate-400">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-6 text-slate-800">{item.question}</p>
                  {item.requirement ? (
                    <p className="mt-0.5 text-xs text-slate-500">题目要求：{item.requirement}</p>
                  ) : null}

                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Tag ok={item.answered} okText="答到了" badText="没答到" />
                    <Tag ok={item.groundedInProject} okText="落到项目" badText="没落到项目" />
                    <Tag ok={item.hasSpecifics} okText="有具体指标" badText="无具体指标" />
                  </div>

                  <p
                    className={`mt-1.5 text-xs leading-5 ${
                      item.evidence === NO_EVIDENCE ? "text-amber-700" : "text-slate-500"
                    }`}
                  >
                    {item.evidence === NO_EVIDENCE ? NO_EVIDENCE : `原文：${item.evidence}`}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Tag({ ok, okText, badText }: { ok: boolean; okText: string; badText: string }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs ${
        ok ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      {ok ? okText : badText}
    </span>
  );
}

// ── ② 三条硬线的疑点 ─────────────────────────────────────────────

function HardLineList({ review }: { review: EssayReview }) {
  if (review.hardLineSuspects.length === 0) return null;

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">三条不及格线上，看着可疑的地方</h3>
        {/* 这句不是免责声明，是说明这一栏的边界 */}
        <span className="text-xs text-slate-400">只报疑点，不替你下结论</span>
      </div>
      <ul className="mt-2 space-y-2">
        {review.hardLineSuspects.map((item, index) => (
          <li
            key={`${item.kind}-${index}`}
            className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2"
          >
            <p className="text-xs font-medium text-amber-800">{HARD_LINE_LABELS[item.kind]}</p>
            <p className="mt-0.5 text-sm leading-6 text-slate-800">{item.concern}</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              {item.evidence === NO_EVIDENCE ? NO_EVIDENCE : `原文：${item.evidence}`}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── ③ 五个维度 ───────────────────────────────────────────────────

function DimensionList({ review }: { review: EssayReview }) {
  if (review.dimensions.length === 0) return null;

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">五个维度</h3>
        {/* 权重写出来是为了说明哪块占比大，不是拿来算分——所以这句必须跟着 */}
        <span className="text-xs text-slate-400">百分比是官方权重，这里不据此算总分</span>
      </div>
      <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {DIMENSIONS.map((dimension) => {
          const verdict = review.dimensions.find((item) => item.key === dimension.key);
          return (
            <li key={dimension.key} className="px-3 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm text-slate-700">
                  {dimension.label}
                  <span className="ml-1.5 text-xs text-slate-400">
                    {Math.round(dimension.weight * 100)}%
                  </span>
                </span>
                <span
                  className={`text-sm ${
                    verdict?.grade === "未判" ? "text-slate-400" : "font-medium text-slate-900"
                  }`}
                >
                  {verdict?.grade ?? "未判"}
                </span>
              </div>
              {verdict?.basis ? (
                <p className="mt-0.5 text-xs leading-5 text-slate-500">{verdict.basis}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── ④ 如果只改一处 ───────────────────────────────────────────────

function TopFix({ review }: { review: EssayReview }) {
  if (!review.topFix.trim()) return null;

  return (
    <section className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2.5">
      <p className="text-xs font-medium text-blue-900">如果只改一处</p>
      <p className="mt-0.5 text-sm leading-6 text-slate-800">{review.topFix}</p>
    </section>
  );
}

// ── 历史 ─────────────────────────────────────────────────────────

function HistoryList({
  history,
  activeRowId,
  onPick,
}: {
  history: EssayReviewRow[];
  activeRowId: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <section className="mt-8 border-t border-slate-100 pt-4">
      <h3 className="text-sm font-semibold text-slate-900">之前的批改（{history.length}）</h3>
      <p className="mt-0.5 text-xs text-slate-400">
        同一篇改到第几稿都留着，能看出上次指出的问题改了没有。
      </p>
      <ul className="mt-2 divide-y divide-slate-100">
        {history.map((row) => {
          const stored = readStoredReview(row.result);
          const answered = stored ? stored.subQuestions.filter((item) => item.answered).length : 0;
          const total = stored ? stored.subQuestions.length : 0;
          return (
            <li key={row.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-slate-800">
                  {row.draft_label || "未标稿次"}
                  <span className="ml-2 text-xs text-slate-400">{row.created_at.slice(0, 10)}</span>
                </p>
                <p className="text-xs text-slate-400">
                  约 {row.word_count} 字
                  {total > 0 ? ` · 子问题答到 ${answered}/${total}` : ""}
                </p>
              </div>
              <button
                className="shrink-0 rounded border border-[#dbe7f5] bg-white px-2.5 py-1 text-xs text-slate-600 transition-colors hover:border-blue-300"
                onClick={() => onPick(row.id)}
                type="button"
              >
                {activeRowId === row.id ? "正在看" : "看这一稿"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
