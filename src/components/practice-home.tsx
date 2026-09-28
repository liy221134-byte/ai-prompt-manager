"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type QuestionSummary = {
  id: string;
  category: string;
  title: string;
  difficulty: string;
};

// 练习首页：从 practice_questions 拉题，按分类分组，复用现有账号体系（Supabase RLS 全局可读）。
export function PracticeHome() {
  const [questions, setQuestions] = useState<QuestionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: queryError } = await supabase
        .from("practice_questions")
        .select("id, category, title, difficulty")
        .order("category")
        .order("created_at");

      if (queryError) {
        throw queryError;
      }

      setQuestions((data as QuestionSummary[]) ?? []);
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

  const grouped = questions.reduce<Record<string, QuestionSummary[]>>(
    (acc, question) => {
      (acc[question.category] ??= []).push(question);

      return acc;
    },
    {},
  );

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">练习题库</h1>
          <p className="mt-1 text-sm text-slate-500">
            用资产库里的规则和方法自测掌握程度。
          </p>
        </div>
        <Link
          href="/"
          className="shrink-0 text-sm font-medium text-blue-600 hover:underline"
        >
          返回首页
        </Link>
      </header>

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
            <h2 className="mb-3 text-sm font-semibold text-slate-700">
              {category}
            </h2>
            <ul className="space-y-2">
              {items.map((question) => (
                <li key={question.id}>
                  <Link
                    href={`/practice/${question.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[#dbe7f5] bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:border-blue-300 hover:text-blue-700"
                  >
                    <span>{question.title}</span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {question.difficulty}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
