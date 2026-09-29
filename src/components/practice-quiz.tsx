"use client";

import { useMemo, useState } from "react";

import { MarkdownContent } from "@/components/markdown-content";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

// 题库答题组件的数据结构。type 字段由迁移 20260929000000_add_practice_type 提供，
// 取值：单选 / 多选 / 判断 / 实操。多选的 answer 存成 JSON 数组字符串（如 '["A","C"]'）。
export type QuizQuestion = {
  id: string;
  asset_id?: string | null;
  category: string;
  title: string;
  body_md: string;
  options: string[];
  answer: string;
  explanation_md: string;
  difficulty: string;
  type: string;
  created_at?: string;
};

export type QuestionStatus = "未做" | "已做" | "错题";
export type StatusMap = Record<string, QuestionStatus>;

type AttemptRecord = { selected: string | string[] | null; correct: boolean };

// 把多选题的答案（JSON 数组字符串）安全解析成字符串数组
function parseMultiAnswer(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

// 无序比较两个字符串数组是否集合相等（顺序无所谓）
function setEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const sa = new Set(a);
  return b.every((item) => sa.has(item));
}

// 两栏布局：左侧习题树（按分类分组、带状态色点、可点击跳转），右侧答题区。
// questions 为本次可导航的题目集合；initialIndex 指定进入时定位到哪一道。
export function PracticeQuiz({
  questions,
  initialIndex = 0,
  modeLabel,
  statusMap,
  onExit,
}: {
  questions: QuizQuestion[];
  initialIndex?: number;
  modeLabel: string;
  statusMap?: StatusMap;
  onExit: () => void;
}) {
  // 内部队列（同类再抽时会往里追加），初始为传入的题目集合
  const [queue, setQueue] = useState<QuizQuestion[]>(questions);
  const [index, setIndex] = useState(initialIndex);
  const [selectedSingle, setSelectedSingle] = useState<string | null>(null);
  const [selectedMulti, setSelectedMulti] = useState<string[]>([]);
  const [result, setResult] = useState<{ correct: boolean } | null>(null);
  const [attempts, setAttempts] = useState<Record<string, AttemptRecord>>({});
  const [showPracticalRef, setShowPracticalRef] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const current = queue[index];
  const isMulti = current?.type === "多选";
  const isPractical = current?.type === "实操";

  // 计算某题的当前状态：优先用本轮已答记录，否则用首页传来的历史状态
  function statusOf(id: string): QuestionStatus {
    const a = attempts[id];
    if (a) {
      return a.correct ? "已做" : "错题";
    }
    return statusMap?.[id] ?? "未做";
  }

  // 切到另一题：把答题区状态重置到目标题——本轮答过就回显该题的选项与对错，否则清空。
  // 这里用一个显式的切题函数，而不是监听 index 的 effect：切题只由「上一题 / 下一题 /
  // 点左侧习题树」三种主动操作触发，在 effect 里同步 setState 会触发级联渲染
  // （eslint 的 react-hooks/set-state-in-effect 会拦下这种写法）。
  function goToQuestion(nextIndex: number) {
    const target = queue[nextIndex];
    const answered = target ? attempts[target.id] : undefined;
    if (answered) {
      setSelectedSingle(typeof answered.selected === "string" ? answered.selected : null);
      setSelectedMulti(Array.isArray(answered.selected) ? answered.selected : []);
      setResult({ correct: answered.correct });
    } else {
      setSelectedSingle(null);
      setSelectedMulti([]);
      setResult(null);
    }
    setShowPracticalRef(false);
    setSubmitError(null);
    setIndex(nextIndex);
  }

  const answeredCount = useMemo(
    () =>
      queue.filter(
        (q) =>
          attempts[q.id] !== undefined || statusMap?.[q.id] !== undefined,
      ).length,
    [queue, attempts, statusMap],
  );

  // 左侧树：按分类分组（保持题目原有顺序）
  const grouped = useMemo(() => {
    const map = new Map<string, QuizQuestion[]>();
    for (const q of queue) {
      if (!map.has(q.category)) {
        map.set(q.category, []);
      }
      map.get(q.category)!.push(q);
    }
    return Array.from(map.entries());
  }, [queue]);

  async function submit() {
    if (!current) {
      return;
    }

    let correct = false;
    const selected: string | string[] | null = isMulti ? selectedMulti : selectedSingle;

    if (isPractical) {
      // 实操题无对错，标记完成即记为已做
      correct = true;
    } else if (isMulti) {
      correct = setEqual(selectedMulti, parseMultiAnswer(current.answer));
    } else {
      correct = selectedSingle === current.answer;
    }

    if (!isPractical && (isMulti ? selectedMulti.length === 0 : !selectedSingle)) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("未登录，无法保存答题记录。");
      }

      const { error: insertError } = await supabase
        .from("practice_attempts")
        .insert({
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${current.id}-${Date.now()}`,
          user_id: user.id,
          question_id: current.id,
          selected: JSON.stringify(selected),
          is_correct: correct,
        });

      if (insertError) {
        throw insertError;
      }

      setResult({ correct });
      setAttempts((prev) => ({
        ...prev,
        [current.id]: { selected, correct },
      }));
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : "提交失败。");
    } finally {
      setIsSubmitting(false);
    }
  }

  function retryCurrent() {
    setSelectedSingle(null);
    setSelectedMulti([]);
    setResult(null);
    setSubmitError(null);
  }

  function appendSimilar() {
    if (!current) {
      return;
    }
    const pool = queue.filter(
      (q) => q.category === current.category && q.id !== current.id,
    );
    if (pool.length === 0) {
      return;
    }
    const picked = [...pool].sort(() => Math.random() - 0.5).slice(0, 2);
    setQueue((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, ...picked);
      return next;
    });
    setSelectedSingle(null);
    setSelectedMulti([]);
    setResult(null);
  }

  function goPrev() {
    if (index > 0) {
      goToQuestion(index - 1);
    }
  }

  function goNext() {
    if (index < queue.length - 1) {
      goToQuestion(index + 1);
    }
  }

  function dotColor(status: QuestionStatus): string {
    if (status === "错题") {
      return "bg-red-500";
    }
    if (status === "已做") {
      return "bg-emerald-500";
    }
    return "bg-slate-300";
  }

  if (!current) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-10">
        <p className="text-sm text-slate-500">没有可练习的题目。</p>
        <button
          className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline"
          onClick={onExit}
          type="button"
        >
          返回题库
        </button>
      </main>
    );
  }

  // 多选题：正确答案集合（用于着色）
  const correctSet = isMulti ? parseMultiAnswer(current.answer) : [];

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-5 px-5 py-8 sm:flex-row">
      {/* 左侧习题树 */}
      <aside className="shrink-0 sm:w-80">
        <div className="rounded-lg border border-[#dbe7f5] bg-white p-4 shadow-sm sm:sticky sm:top-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">{modeLabel}</p>
            <button
              className="text-sm font-medium text-blue-600 hover:underline"
              onClick={onExit}
              type="button"
            >
              退出练习
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            已完成 {answeredCount}/{queue.length} · 点击左侧题目可任意跳转
          </p>

          <nav className="mt-3 max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            {grouped.map(([category, items]) => (
              <div key={category}>
                <p className="mb-1 text-xs font-semibold text-slate-400">
                  {category}
                </p>
                <ul className="space-y-1">
                  {items.map((q) => {
                    const pos = queue.indexOf(q);
                    const active = pos === index;
                    const status = statusOf(q.id);
                    return (
                      <li key={q.id}>
                        <button
                          className={[
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                            active
                              ? "bg-blue-50 text-blue-700"
                              : "text-slate-600 hover:bg-slate-50",
                          ].join(" ")}
                          onClick={() => goToQuestion(pos)}
                          type="button"
                        >
                          <span
                            aria-hidden="true"
                            className={`size-2 shrink-0 rounded-full ${dotColor(status)}`}
                          />
                          <span className="truncate">{q.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </aside>

      {/* 右侧答题区 */}
      <section className="min-w-0 flex-1">
        <header>
          <p className="text-xs font-medium text-slate-400">
            第 {index + 1}/{queue.length} 题 · {current.type}
          </p>
          <h1 className="mt-1 text-xl font-bold text-slate-950">
            {current.title}
          </h1>
          <p className="mt-0.5 text-xs text-slate-400">
            {current.category} · {current.difficulty}
          </p>
        </header>

        <div className="mt-5 rounded-lg border border-[#dbe7f5] bg-white p-5 shadow-sm">
          <MarkdownContent content={current.body_md} />
        </div>

        {/* 实操题：无选项，展示任务 + 参考要点 */}
        {isPractical ? (
          <div className="mt-5">
            <button
              className="inline-flex h-10 items-center justify-center rounded-lg border border-[#dbe7f5] bg-white px-4 text-sm font-semibold text-slate-700 hover:border-blue-300"
              onClick={() => setShowPracticalRef((v) => !v)}
              type="button"
            >
              {showPracticalRef ? "隐藏参考要点" : "查看参考要点"}
            </button>
            {showPracticalRef && (
              <div className="mt-3 rounded-lg border border-[#dbe7f5] bg-white p-5 shadow-sm">
                <p className="mb-2 text-sm font-semibold text-slate-700">
                  参考要点
                </p>
                <MarkdownContent content={current.explanation_md} />
              </div>
            )}
            {result === null ? (
              <button
                className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={isSubmitting}
                onClick={() => void submit()}
                type="button"
              >
                {isSubmitting ? "提交中…" : "标记完成"}
              </button>
            ) : (
              <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                已完成本题
              </div>
            )}
          </div>
        ) : (
          <>
            <fieldset className="mt-5 space-y-2" disabled={result !== null}>
              <legend className="sr-only">选项</legend>
              {current.options.map((option) => {
                const isChosen = isMulti
                  ? selectedMulti.includes(option)
                  : selectedSingle === option;
                const isCorrectOption = correctSet.includes(option);
                const showCorrect =
                  result !== null &&
                  (isMulti ? isCorrectOption : option === current.answer);
                const showWrong =
                  result !== null &&
                  isChosen &&
                  (isMulti ? !isCorrectOption : option !== current.answer);

                return (
                  <label
                    key={option}
                    className={[
                      "flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors",
                      showCorrect
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                        : showWrong
                          ? "border-red-300 bg-red-50 text-red-900"
                          : isChosen
                            ? "border-blue-300 bg-blue-50 text-blue-800"
                            : "border-[#dbe7f5] bg-white text-slate-800 hover:border-blue-300",
                    ].join(" ")}
                  >
                    <input
                      checked={isChosen}
                      className="size-4"
                      name={isMulti ? undefined : "option"}
                      onChange={() => {
                        if (isMulti) {
                          setSelectedMulti((prev) =>
                            prev.includes(option)
                              ? prev.filter((o) => o !== option)
                              : [...prev, option],
                          );
                        } else {
                          setSelectedSingle(option);
                        }
                      }}
                      type={isMulti ? "checkbox" : "radio"}
                      value={option}
                    />
                    <span>{option}</span>
                  </label>
                );
              })}
            </fieldset>

            {result === null && (
              <button
                className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={
                  isSubmitting ||
                  (isMulti ? selectedMulti.length === 0 : !selectedSingle)
                }
                onClick={() => void submit()}
                type="button"
              >
                {isSubmitting ? "提交中…" : "提交答案"}
              </button>
            )}
          </>
        )}

        {submitError && (
          <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {submitError}
          </p>
        )}

        {result && !isPractical && (
          <div className="mt-5 space-y-4">
            <div
              className={[
                "rounded-lg px-4 py-3 text-sm font-semibold",
                result.correct
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-red-50 text-red-700",
              ].join(" ")}
            >
              {result.correct ? "回答正确" : "回答错误"}
              {isMulti && (
                <span className="ml-2 font-normal text-slate-500">
                  正确答案：{correctSet.join("、")}
                </span>
              )}
            </div>
            <div className="rounded-lg border border-[#dbe7f5] bg-white p-5 shadow-sm">
              <p className="mb-2 text-sm font-semibold text-slate-700">解析</p>
              <MarkdownContent content={current.explanation_md} />
            </div>

            <div className="flex flex-wrap gap-3">
              {!result.correct && (
                <button
                  className="inline-flex h-11 items-center justify-center rounded-lg bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700"
                  onClick={retryCurrent}
                  type="button"
                >
                  重做本题
                </button>
              )}
              <button
                className="inline-flex h-11 items-center justify-center rounded-lg border border-[#dbe7f5] bg-white px-5 text-sm font-semibold text-slate-700 hover:border-blue-300"
                onClick={appendSimilar}
                type="button"
              >
                同类随机再抽（2）
              </button>
            </div>
          </div>
        )}

        {/* 上下切换 */}
        <div className="mt-6 flex items-center justify-between border-t border-[#dbe7f5] pt-4">
          <button
            className="inline-flex h-10 items-center justify-center rounded-lg border border-[#dbe7f5] bg-white px-4 text-sm font-semibold text-slate-700 hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={index === 0}
            onClick={goPrev}
            type="button"
          >
            上一题
          </button>
          <span className="text-xs text-slate-400">
            {index + 1} / {queue.length}
          </span>
          <button
            className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={index >= queue.length - 1}
            onClick={goNext}
            type="button"
          >
            下一题
          </button>
        </div>
      </section>
    </div>
  );
}
