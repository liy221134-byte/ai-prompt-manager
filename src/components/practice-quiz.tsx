"use client";

import { useState } from "react";

import { MarkdownContent } from "@/components/markdown-content";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

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
  created_at?: string;
};

type AttemptRecord = { selected: string; correct: boolean };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];

  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }

  return a;
}

// 练习模式：顺序答题 + 错题重练 + 同类随机再抽 + 重做本题 + 本轮结果。
export function PracticeQuiz({
  initialQueue,
  allQuestions,
  modeLabel,
  onExit,
}: {
  initialQueue: QuizQuestion[];
  allQuestions: QuizQuestion[];
  modeLabel: string;
  onExit: () => void;
}) {
  const [queue, setQueue] = useState<QuizQuestion[]>(initialQueue);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<{ correct: boolean } | null>(null);
  const [attempts, setAttempts] = useState<Record<string, AttemptRecord>>({});
  const [wrongIds, setWrongIds] = useState<Set<string>>(new Set());
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const current = queue[index];
  const isFinished = !current;

  async function submit() {
    if (!current || !selected) {
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

      const correct = selected === current.answer;

      const { error: insertError } = await supabase.from("practice_attempts").insert({
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${current.id}-${Date.now()}`,
        user_id: user.id,
        question_id: current.id,
        selected,
        is_correct: correct,
      });

      if (insertError) {
        throw insertError;
      }

      setResult({ correct });
      setAttempts((prev) => ({ ...prev, [current.id]: { selected, correct } }));
      setWrongIds((prev) => {
        const next = new Set(prev);

        if (correct) {
          next.delete(current.id);
        } else {
          next.add(current.id);
        }

        return next;
      });
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : "提交失败。");
    } finally {
      setIsSubmitting(false);
    }
  }

  function retryCurrent() {
    setSelected(null);
    setResult(null);
    setSubmitError(null);
  }

  function appendSimilar() {
    if (!current) {
      return;
    }

    const pool = allQuestions.filter(
      (q) => q.category === current.category && !queue.some((q2) => q2.id === q.id),
    );
    const picked = shuffle(pool).slice(0, 2);

    if (picked.length === 0) {
      return;
    }

    setQueue((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, ...picked);

      return next;
    });
    setSelected(null);
    setResult(null);
  }

  function goNext() {
    setIndex((i) => i + 1);
    setSelected(null);
    setResult(null);
    setSubmitError(null);
  }

  function restartWrong() {
    const wrongQs = queue.filter((q) => wrongIds.has(q.id));

    if (wrongQs.length === 0) {
      return;
    }

    setQueue(wrongQs);
    setIndex(0);
    setSelected(null);
    setResult(null);
  }

  if (isFinished) {
    const totalAnswered = Object.keys(attempts).length;
    const correctCount = Object.values(attempts).filter((a) => a.correct).length;
    const wrongList = queue.filter((q) => wrongIds.has(q.id));

    return (
      <main className="mx-auto max-w-2xl px-5 py-10">
        <h1 className="text-2xl font-bold text-slate-950">本轮完成</h1>
        <p className="mt-2 text-sm text-slate-500">{modeLabel}</p>

        <div className="mt-6 rounded-lg border border-[#dbe7f5] bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-700">
            共作答 <strong>{totalAnswered}</strong> 题，答对{" "}
            <strong className="text-emerald-700">{correctCount}</strong> 题，答错{" "}
            <strong className="text-red-600">{totalAnswered - correctCount}</strong> 题。
          </p>

          {wrongList.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-semibold text-slate-700">
                仍需巩固（{wrongList.length}）：
              </p>
              <ul className="space-y-1 text-sm text-slate-600">
                {wrongList.map((q) => (
                  <li key={q.id}>· {q.title}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {wrongList.length > 0 && (
            <button
              className="inline-flex h-11 items-center justify-center rounded-lg bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700"
              onClick={restartWrong}
              type="button"
            >
              重练错题（{wrongList.length}）
            </button>
          )}
          <button
            className="inline-flex h-11 items-center justify-center rounded-lg border border-[#dbe7f5] bg-white px-5 text-sm font-semibold text-slate-700 hover:border-blue-300"
            onClick={onExit}
            type="button"
          >
            返回题库
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-400">
            {modeLabel} · 第 {index + 1}/{queue.length} 题
          </p>
          <h1 className="mt-1 text-xl font-bold text-slate-950">{current.title}</h1>
          <p className="mt-0.5 text-xs text-slate-400">
            {current.category} · {current.difficulty}
          </p>
        </div>
        <button
          className="shrink-0 text-sm font-medium text-blue-600 hover:underline"
          onClick={onExit}
          type="button"
        >
          退出练习
        </button>
      </header>

      <div className="mt-6 rounded-lg border border-[#dbe7f5] bg-white p-5 shadow-sm">
        <MarkdownContent content={current.body_md} />
      </div>

      <fieldset className="mt-6 space-y-2" disabled={result !== null}>
        <legend className="sr-only">选项</legend>
        {current.options.map((option) => {
          const isChosen = selected === option;
          const showCorrect = result !== null && option === current.answer;
          const showWrong =
            result !== null && isChosen && option !== current.answer;

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
                name="option"
                onChange={() => setSelected(option)}
                type="radio"
                value={option}
              />
              <span>{option}</span>
            </label>
          );
        })}
      </fieldset>

      {result === null && (
        <button
          className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={!selected || isSubmitting}
          onClick={() => void submit()}
          type="button"
        >
          {isSubmitting ? "提交中…" : "提交答案"}
        </button>
      )}

      {submitError && (
        <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {submitError}
        </p>
      )}

      {result && (
        <div className="mt-6 space-y-4">
          <div
            className={[
              "rounded-lg px-4 py-3 text-sm font-semibold",
              result.correct
                ? "bg-emerald-50 text-emerald-800"
                : "bg-red-50 text-red-700",
            ].join(" ")}
          >
            {result.correct ? "回答正确" : "回答错误"}
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
            <button
              className="inline-flex h-11 items-center justify-center rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700"
              onClick={goNext}
              type="button"
            >
              {index + 1 < queue.length ? "下一题" : "查看本轮结果"}
            </button>
          </div>

          {result.correct && (
            <p className="text-xs text-emerald-600">
              已答对，自动移出本轮错题本。
            </p>
          )}
        </div>
      )}
    </main>
  );
}
