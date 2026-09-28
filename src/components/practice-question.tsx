"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { MarkdownContent } from "@/components/markdown-content";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type Question = {
  id: string;
  category: string;
  title: string;
  body_md: string;
  options: string[];
  answer: string;
  explanation_md: string;
  difficulty: string;
};

// 单题作答页：拉题 → 选答案 → 写入 practice_attempts（按 user_id 隔离，仅本人可见）。
export function PracticeQuestion({ id }: { id: string }) {
  const [question, setQuestion] = useState<Question | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ correct: boolean } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: queryError } = await supabase
        .from("practice_questions")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (queryError) {
        throw queryError;
      }

      if (!data) {
        setError("题目不存在。");

        return;
      }

      setQuestion(data as Question);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "题目加载失败。");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [load]);

  async function submit() {
    if (!question || !selected) {
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

      const correct = selected === question.answer;

      const { error: insertError } = await supabase
        .from("practice_attempts")
        .insert({
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${question.id}-${Date.now()}`,
          user_id: user.id,
          question_id: question.id,
          selected,
          is_correct: correct,
        });

      if (insertError) {
        throw insertError;
      }

      setResult({ correct });
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : "提交失败。");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-10">
        <p className="text-sm text-slate-500">正在加载题目…</p>
      </main>
    );
  }

  if (error || !question) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-10">
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error ?? "题目加载失败。"}
        </p>
        <Link
          href="/practice"
          className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline"
        >
          返回题库
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-400">
            {question.category} · {question.difficulty}
          </p>
          <h1 className="mt-1 text-xl font-bold text-slate-950">
            {question.title}
          </h1>
        </div>
        <Link
          href="/practice"
          className="shrink-0 text-sm font-medium text-blue-600 hover:underline"
        >
          返回题库
        </Link>
      </header>

      <div className="mt-6 rounded-lg border border-[#dbe7f5] bg-white p-5 shadow-sm">
        <MarkdownContent content={question.body_md} />
      </div>

      <fieldset className="mt-6 space-y-2" disabled={result !== null}>
        <legend className="sr-only">选项</legend>
        {question.options.map((option) => {
          const isChosen = selected === option;
          const showCorrect = result !== null && option === question.answer;
          const showWrong =
            result !== null && isChosen && option !== question.answer;

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
            <MarkdownContent content={question.explanation_md} />
          </div>
        </div>
      )}
    </main>
  );
}
