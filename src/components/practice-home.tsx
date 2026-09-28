"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { PracticeQuiz, type QuizQuestion } from "@/components/practice-quiz";

// 练习首页：从 practice_questions 拉全量题（含答案/解析，云模式全局可读），
// 提供「浏览分类 / 全部随机练习 / 错题重练 / 练习本类 / 单题」入口，进入内联练习模式。
export function PracticeHome() {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"browse" | "quiz">("browse");
  const [quizQueue, setQuizQueue] = useState<QuizQuestion[]>([]);
  const [quizLabel, setQuizLabel] = useState("");
  const [wrongLoading, setWrongLoading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: queryError } = await supabase
        .from("practice_questions")
        .select(
          "id, asset_id, category, title, difficulty, body_md, options, answer, explanation_md, created_at",
        )
        .order("category")
        .order("created_at");

      if (queryError) {
        throw queryError;
      }

      setQuestions((data as QuizQuestion[]) ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "题库加载失败。");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [load]);

  const grouped = questions.reduce<Record<string, QuizQuestion[]>>(
    (acc, question) => {
      (acc[question.category] ??= []).push(question);

      return acc;
    },
    {},
  );

  function startAll() {
    const shuffled = [...questions].sort(() => Math.random() - 0.5);
    setQuizQueue(shuffled);
    setQuizLabel(`全部随机练习（${shuffled.length}）`);
    setView("quiz");
  }

  function startCategory(category: string) {
    const qs = questions.filter((q) => q.category === category);
    setQuizQueue(qs);
    setQuizLabel(`${category}（${qs.length}）`);
    setView("quiz");
  }

  function startOne(question: QuizQuestion) {
    setQuizQueue([question]);
    setQuizLabel(`单题：${question.title}`);
    setView("quiz");
  }

  async function startWrong() {
    setWrongLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("未登录，无法读取错题。");

        return;
      }

      const { data, error: queryError } = await supabase
        .from("practice_attempts")
        .select("question_id")
        .eq("user_id", user.id)
        .eq("is_correct", false);

      if (queryError) {
        throw queryError;
      }

      const wrongIds = Array.from(
        new Set((data ?? []).map((r: { question_id: string }) => r.question_id)),
      );
      const qs = questions.filter((q) => wrongIds.includes(q.id));

      if (qs.length === 0) {
        setError("还没有错题记录，先去练几题吧。");

        return;
      }

      setQuizQueue(qs);
      setQuizLabel(`错题重练（${qs.length}）`);
      setView("quiz");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "读取错题失败。");
    } finally {
      setWrongLoading(false);
    }
  }

  if (view === "quiz") {
    return (
      <PracticeQuiz
        allQuestions={questions}
        initialQueue={quizQueue}
        modeLabel={quizLabel}
        onExit={() => setView("browse")}
      />
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">练习题库</h1>
          <p className="mt-1 text-sm text-slate-500">
            按分类自测掌握程度，支持错题重练与同类再抽。
          </p>
        </div>
        <Link
          href="/"
          className="shrink-0 text-sm font-medium text-blue-600 hover:underline"
        >
          返回首页
        </Link>
      </header>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
          onClick={startAll}
          type="button"
        >
          全部随机练习
        </button>
        <button
          className="inline-flex h-10 items-center justify-center rounded-lg border border-[#dbe7f5] bg-white px-4 text-sm font-semibold text-slate-700 hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={wrongLoading || questions.length === 0}
          onClick={() => void startWrong()}
          type="button"
        >
          {wrongLoading ? "读取中…" : "错题重练"}
        </button>
      </div>

      {isLoading && (
        <p className="mt-8 text-sm text-slate-500">正在加载题库…</p>
      )}
      {error && (
        <p className="mt-8 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {!isLoading && !error && questions.length === 0 && (
        <p className="mt-8 text-sm text-slate-500">题库还没有题目。</p>
      )}

      <div className="mt-8 space-y-8">
        {Object.entries(grouped).map(([category, items]) => (
          <section key={category}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">
                {category}
                <span className="ml-2 text-xs font-normal text-slate-400">
                  （{items.length}）
                </span>
              </h2>
              <button
                className="text-xs font-medium text-blue-600 hover:underline"
                onClick={() => startCategory(category)}
                type="button"
              >
                练习本类
              </button>
            </div>
            <ul className="space-y-2">
              {items.map((question) => (
                <li key={question.id}>
                  <button
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-[#dbe7f5] bg-white px-4 py-3 text-left text-sm font-medium text-slate-800 shadow-sm transition-colors hover:border-blue-300 hover:text-blue-700"
                    onClick={() => startOne(question)}
                    type="button"
                  >
                    <span>{question.title}</span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {question.difficulty}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
