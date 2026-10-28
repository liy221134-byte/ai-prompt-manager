"use client";

// 追问抽屉：针对刚答错的那道题，问「你当时是怎么想的」。
//
// 三个界面上的硬约束，都来自 PRD 第 7 条（AI 不代替我思考）：
//   1. 抽屉里**不显示解析**。解析就在边上，看一眼就等于抄答案，追问立刻没意义。
//   2. 界面上**没有任何「它说得对不对」的提示**。追问本来就是让我自己发现错在哪。
//   3. AI 只提问，所以抽屉里没有「讲解」区块——想讲也没地方摆。
//
// 为什么是抽屉而不是新页面：追问的时机是「刚答错」，跳页会丢掉做题上下文。
// 关掉抽屉，人还在那道题上，能接着看解析或重做。

import { useEffect, useRef, useState } from "react";

import {
  MAX_PROBE_ROUNDS,
  countMyAnswers,
  planNextTurn,
  type ProbePrevious,
  type ProbeTurn,
  type ProbeVerdict,
  type TranscriptEntry,
} from "@/lib/learning/probe";
import type { ProbeKnowledgePoint, ProbeQuestionInput } from "@/lib/learning/probe-prompt";

export type ProbeSavePayload = {
  transcript: TranscriptEntry[];
  verdict: ProbeVerdict | null;
};

export function ProbeDrawer({
  question,
  knowledgePoints,
  previous,
  onSave,
  onClose,
}: {
  question: ProbeQuestionInput;
  knowledgePoints: ProbeKnowledgePoint[];
  /** 这道题上次的追问记录。有就带出来看，不重新问 */
  previous: ProbePrevious | null;
  onSave: (payload: ProbeSavePayload) => Promise<void>;
  onClose: () => void;
}) {
  // restored = 现在展示的是「上次记录」，不是在问。重新问一次之后变回 false。
  //
  // 只有「有结论」的记录才当上次记录展示：抽屉给上次记录的是只读视图，
  // 没有结论就没有可看的东西；一段被中断的对话从中间接着问也不成立
  // （模型的上下文与当时不一样了），不如直接重开一轮。
  const restoreTarget = previous?.verdict ? previous : null;
  const [restored, setRestored] = useState(Boolean(restoreTarget));
  const [transcript, setTranscript] = useState<TranscriptEntry[]>(restoreTarget?.transcript ?? []);
  const [draft, setDraft] = useState("");
  const [verdict, setVerdict] = useState<ProbeVerdict | null>(restoreTarget?.verdict ?? null);
  const [note, setNote] = useState<string | null>(null);
  // 一进来就要发首问的，初始就是「忙」：否则会先闪一下空输入框再变成「正在想」。
  const [busy, setBusy] = useState(!restoreTarget);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // 首问只发一次。React 开发模式的 effect 会跑两遍，
  // 没有这个闸门会一进抽屉就发出两次调用（白花钱，还会出现两个问题）。
  const startedRef = useRef(false);

  async function requestTurn(turns: TranscriptEntry[]) {
    setBusy(true);
    setError(null);
    try {
      const plan = planNextTurn(turns);
      const response = await fetch("/api/learning/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: plan.phase,
          question,
          knowledgePoints,
          transcript: turns,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { turn?: ProbeTurn; note?: string | null; error?: string }
        | null;

      if (!response.ok || !payload?.turn) {
        throw new Error(payload?.error ?? "追问服务没有响应。");
      }

      const turn = payload.turn;
      if (turn.kind === "ask") {
        setTranscript([...turns, { role: "ai", text: turn.question }]);
      } else {
        // 收尾：不再追加对话，把我的最后一轮回答留在记录里
        setTranscript(turns);
        setVerdict(turn.verdict);
        setNote(payload.note ?? null);
      }
    } catch (caught) {
      // fetch 本身失败（断网、服务没起来）抛的是 TypeError，消息是「Failed to fetch」。
      // 那半句英文对人没用，换成能判断该干什么的话。
      const isNetworkError = caught instanceof TypeError;
      setError(
        isNetworkError
          ? "连不上服务，检查网络后重试。"
          : caught instanceof Error
            ? caught.message
            : "追问没跑起来。",
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    // 有上次记录时先把上次的摆出来，不自动开新一轮——
    // 人可能是来复习「我上次怎么说的」，未必要重新问一遍。
    if (restoreTarget) return;

    // 放到下一个任务里发起，而不是在 effect 体内同步调：
    // 同步 setState 会触发级联渲染（eslint 的 react-hooks/set-state-in-effect 会拦），
    // 而这个请求本来就该等这一帧画完再发——首屏先出现「正在想下一个问题…」。
    //
    // **不返回清理函数**：开发模式下 effect 会「跑一次 → 清理 → 再跑一次」，
    // 若在这里取消定时器，第一次的起跑被取消、第二次又因 startedRef 提前返回，
    // 请求就永远发不出去（2026-10-28 实测踩到：抽屉一直停在「正在想…」）。
    // 这是一个 0ms 的一次性起跑，没有需要清理的资源。
    setTimeout(() => {
      void requestTurn([]);
    }, 0);
    // requestTurn 依赖的是 props（题目/候选知识点），打开抽屉期间不变；
    // 放进依赖会让每次 prop 引用变化都重发首问，反而更容易出问题。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc 关闭 + 锁背景滚动，与讲义抽屉同一套做法
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  function submitAnswer() {
    const text = draft.trim();
    if (!text || busy) return;

    // 先把我的回答落到对话里再请求：网络失败时人看得见自己说过什么，
    // 点「再试一次」就是从这句话继续，而不是重新回答一遍。
    const next = [...transcript, { role: "me", text } as TranscriptEntry];
    setTranscript(next);
    setDraft("");
    void requestTurn(next);
  }

  async function save() {
    if (!verdict) return;
    setSaving(true);
    try {
      await onSave({ transcript, verdict });
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败。");
    } finally {
      setSaving(false);
    }
  }

  /** 重新问一遍：清空上次的记录，从现在开始一轮新的对话 */
  function restart() {
    setRestored(false);
    setTranscript([]);
    setVerdict(null);
    setNote(null);
    setError(null);
    setSaved(false);
    setDraft("");
    void requestTurn([]);
  }

  const answered = countMyAnswers(transcript);
  const remaining = Math.max(0, MAX_PROBE_ROUNDS - answered);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">讲讲为什么错</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {question.title.length > 46 ? `${question.title.slice(0, 46)}…` : question.title}
            </p>
          </div>
          <button
            className="shrink-0 rounded px-2 py-1 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            onClick={onClose}
            type="button"
          >
            关闭
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
            {restored
              ? "这是上次的追问记录。想再问一遍就点下面的「重新追问这道题」。"
              : "它只问不答：不会告诉你正确答案，也不会解释。你要做的是把当时的想法写出来，问到你说不出来为止，最后给一句「你卡在哪」。"}
          </p>

          {transcript.map((entry, index) => (
            <div
              key={`${entry.role}-${index}`}
              className={entry.role === "ai" ? "flex justify-start" : "flex justify-end"}
            >
              <div
                className={[
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm leading-6",
                  entry.role === "ai"
                    ? "border-l-2 border-blue-400 bg-slate-50 text-slate-800"
                    : "bg-blue-600 text-white",
                ].join(" ")}
              >
                {entry.text}
              </div>
            </div>
          ))}

          {busy ? (
            <p className="text-xs text-slate-400">
              {verdict === null && answered >= MAX_PROBE_ROUNDS ? "正在整理结论…" : "正在想下一个问题…"}
            </p>
          ) : null}

          {error ? (
            <div className="rounded-lg bg-amber-50 px-3 py-2">
              <p className="text-sm text-amber-800">追问没跑起来：{error}</p>
              <div className="mt-2 flex gap-3">
                <button
                  className="text-sm font-medium text-blue-600 hover:underline"
                  onClick={() => void requestTurn(transcript)}
                  type="button"
                >
                  再试一次
                </button>
                <button
                  className="text-sm font-medium text-slate-500 hover:underline"
                  onClick={onClose}
                  type="button"
                >
                  先不追问了
                </button>
              </div>
            </div>
          ) : null}

          {verdict ? (
            <div className="space-y-3 border-t border-slate-100 pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-800">
                  {restored ? "上次的结论" : "结论"}
                </h3>
                <span className="text-xs text-slate-400">
                  {restored
                    ? `上次追问于 ${restoreTarget?.createdAt.slice(0, 10) ?? ""}，下面是当时的记录`
                    : "这段是 AI 归纳的，可以改，改了以你为准"}
                </span>
              </div>

              {note ? <p className="text-xs text-slate-400">{note}</p> : null}

              {/* 上次记录只读：要改就重新问一遍。给它编辑框却不给保存，
                  人会以为改了会存下来——比只读更糟。 */}
              {restored ? (
                <dl className="space-y-2 rounded-lg bg-slate-50 px-3 py-2 text-sm leading-6">
                  <div>
                    <dt className="inline text-xs font-medium text-slate-500">卡在哪：</dt>
                    <dd className="inline text-slate-800">{verdict.stuck || "（没记）"}</dd>
                  </div>
                  <div>
                    <dt className="inline text-xs font-medium text-slate-500">知识点：</dt>
                    <dd className="inline text-slate-800">
                      {knowledgePoints.find((kp) => kp.id === verdict.knowledgePointId)?.name ??
                        "没归"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline text-xs font-medium text-slate-500">下一步：</dt>
                    <dd className="inline text-slate-800">{verdict.next || "（没记）"}</dd>
                  </div>
                </dl>
              ) : (
                <>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-500">卡在哪</span>
                    <textarea
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none"
                      onChange={(event) => setVerdict({ ...verdict, stuck: event.target.value })}
                      rows={2}
                      value={verdict.stuck}
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs font-medium text-slate-500">归到哪个知识点</span>
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none"
                      onChange={(event) =>
                        setVerdict({
                          ...verdict,
                          knowledgePointId: event.target.value ? event.target.value : null,
                        })
                      }
                      value={verdict.knowledgePointId ?? ""}
                    >
                      <option value="">说不清，先不归</option>
                      {knowledgePoints.map((kp) => (
                        <option key={kp.id} value={kp.id}>
                          {kp.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-xs font-medium text-slate-500">下一步做什么</span>
                    <textarea
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none"
                      onChange={(event) => setVerdict({ ...verdict, next: event.target.value })}
                      rows={2}
                      value={verdict.next}
                    />
                  </label>
                </>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                {restored ? (
                  <>
                    <button
                      className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                      onClick={restart}
                      type="button"
                    >
                      重新追问这道题
                    </button>
                    <button
                      className="text-sm font-medium text-slate-500 hover:underline"
                      onClick={onClose}
                      type="button"
                    >
                      关闭
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      disabled={saving || saved}
                      onClick={() => void save()}
                      type="button"
                    >
                      {saved ? "已保存" : saving ? "保存中…" : "保存这次追问"}
                    </button>
                    <button
                      className="text-sm font-medium text-slate-500 hover:underline"
                      onClick={onClose}
                      type="button"
                    >
                      {saved ? "关闭" : "不保存，关闭"}
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="border-t border-slate-100 pt-4">
              <label className="block">
                <span className="text-xs font-medium text-slate-500">
                  你当时是怎么想的
                  {remaining > 0 ? `（还能答 ${remaining} 轮）` : ""}
                </span>
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none"
                  disabled={busy}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    // Ctrl/Cmd + Enter 发送：追问时人会写好几行，回车留给换行
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                      event.preventDefault();
                      submitAnswer();
                    }
                  }}
                  placeholder="比如：我记得 SV 是负的就说明进度超前，所以选了 A"
                  rows={3}
                  value={draft}
                />
              </label>
              <div className="mt-2 flex items-center gap-3">
                <button
                  className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={busy || draft.trim().length === 0}
                  onClick={submitAnswer}
                  type="button"
                >
                  说完了
                </button>
                <span className="text-xs text-slate-400">Ctrl/⌘ + Enter 也能发送</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
