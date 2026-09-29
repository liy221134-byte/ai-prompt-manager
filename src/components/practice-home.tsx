"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  PracticeQuiz,
  type QuizQuestion,
  type QuestionStatus,
  type StatusMap,
} from "@/components/practice-quiz";

// 练习首页：从 practice_questions 拉全量题（含答案/解析，云模式全局可读），
// 提供「习题类型 / 习题状态」两组筛选，进入左侧习题树 + 右侧答题区的两栏练习模式。
export function PracticeHome() {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [statusMap, setStatusMap] = useState<StatusMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"browse" | "quiz">("browse");
  const [quizQueue, setQuizQueue] = useState<QuizQuestion[]>([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizLabel, setQuizLabel] = useState("");
  const [wrongLoading, setWrongLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("全部");
  const [statusFilter, setStatusFilter] = useState<QuestionStatus | "全部">("全部");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: queryError } = await supabase
        .from("practice_questions")
        .select(
          "id, asset_id, category, title, difficulty, type, body_md, options, answer, explanation_md, created_at",
        )
        .order("category")
        .order("created_at");

      if (queryError) {
        throw queryError;
      }

      const qs = (data as QuizQuestion[]) ?? [];
      setQuestions(qs);

      // 读取本人答题记录，推算每题当前状态（未做 / 已做 / 错题）
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: attempts } = await supabase
          .from("practice_attempts")
          .select("question_id, is_correct, created_at")
          .eq("user_id", user.id);

        const latest = new Map<string, { correct: boolean; t: string }>();
        for (const r of attempts ?? []) {
          const prev = latest.get(r.question_id);
          if (!prev || r.created_at > prev.t) {
            latest.set(r.question_id, { correct: r.is_correct, t: r.created_at });
          }
        }
        const map: StatusMap = {};
        for (const [qid, v] of latest) {
          map[qid] = v.correct ? "已做" : "错题";
        }
        setStatusMap(map);
      }
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

  // 题型选项来自实际数据（若库里只有单选，则只出现「单选」）
  const typeOptions = useMemo(
    () => Array.from(new Set(questions.map((q) => q.type))),
    [questions],
  );

  // 按「题型 + 状态」两组筛选叠加
  const filtered = useMemo(
    () =>
      questions.filter((q) => {
        const typeOk = typeFilter === "全部" || q.type === typeFilter;
        const statusOk =
          statusFilter === "全部" ||
          statusMap[q.id] === statusFilter ||
          (statusFilter === "未做" && !statusMap[q.id]);
        return typeOk && statusOk;
      }),
    [questions, typeFilter, statusFilter, statusMap],
  );

  const grouped = filtered.reduce<Record<string, QuizQuestion[]>>(
    (acc, question) => {
      (acc[question.category] ??= []).push(question);
      return acc;
    },
    {},
  );

  function enterPractice(seed: QuizQuestion[] | null, label: string) {
    const pool = seed ?? filtered;
    if (pool.length === 0) {
      setError("当前筛选下没有可练习的题目。");
      return;
    }
    const queue =
      typeFilter === "全部" && statusFilter === "全部"
        ? [...pool].sort(() => Math.random() - 0.5)
        : pool;
    setQuizQueue(queue);
    setQuizIndex(0);
    setQuizLabel(label);
    setView("quiz");
  }

  function startOne(question: QuizQuestion) {
    // 进入左树右答题，左树展示当前筛选下的全部题，并定位到被点的那题
    const queue = filtered;
    if (queue.length === 0) {
      setError("当前筛选下没有可练习的题目。");
      return;
    }
    const idx = Math.max(0, queue.findIndex((q) => q.id === question.id));
    setQuizQueue(queue);
    setQuizIndex(idx);
    setQuizLabel(`练习：${question.title}`);
    setView("quiz");
  }

  function startCategory(category: string) {
    const qs = questions.filter((q) => q.category === category);
    enterPractice(qs, `${category}（${qs.length}）`);
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

      enterPractice(qs, `错题重练（${qs.length}）`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "读取错题失败。");
    } finally {
      setWrongLoading(false);
    }
  }

  function statusDot(status: QuestionStatus | undefined): string {
    if (status === "错题") return "bg-red-500";
    if (status === "已做") return "bg-emerald-500";
    return "bg-slate-300";
  }

  if (view === "quiz") {
    return (
      <PracticeQuiz
        questions={quizQueue}
        initialIndex={quizIndex}
        modeLabel={quizLabel}
        statusMap={statusMap}
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
            按分类自测掌握程度，支持题型 / 状态筛选与错题重练。
          </p>
        </div>
        <Link
          href="/"
          className="shrink-0 text-sm font-medium text-blue-600 hover:underline"
        >
          返回首页
        </Link>
      </header>

      {/* 两组筛选：习题类型 + 习题状态 */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-400">习题类型</span>
        {["全部", ...typeOptions].map((t) => (
          <button
            key={t}
            className={[
              "inline-flex h-8 items-center justify-center rounded-full px-3 text-xs font-medium transition-colors",
              typeFilter === t
                ? "bg-blue-600 text-white"
                : "border border-[#dbe7f5] bg-white text-slate-600 hover:border-blue-300",
            ].join(" ")}
            onClick={() => setTypeFilter(t)}
            type="button"
          >
            {t}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-400">习题状态</span>
        {(["全部", "未做", "已做", "错题"] as const).map((s) => (
          <button
            key={s}
            className={[
              "inline-flex h-8 items-center justify-center rounded-full px-3 text-xs font-medium transition-colors",
              statusFilter === s
                ? "bg-blue-600 text-white"
                : "border border-[#dbe7f5] bg-white text-slate-600 hover:border-blue-300",
            ].join(" ")}
            onClick={() => setStatusFilter(s)}
            type="button"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
          onClick={() => {
            const parts = [typeFilter, statusFilter].filter(
              (x) => x !== "全部",
            );
            enterPractice(
              null,
              parts.length
                ? `练习（${parts.join(" · ")}）`
                : "全部随机练习",
            );
          }}
          type="button"
        >
          开始练习（{filtered.length}）
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
      {!isLoading && !error && filtered.length === 0 && (
        <p className="mt-8 text-sm text-slate-500">
          当前筛选下没有题目，换个筛选条件试试。
        </p>
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
                    className="flex w-full items-center gap-3 rounded-lg border border-[#dbe7f5] bg-white px-4 py-3 text-left shadow-sm transition-colors hover:border-blue-300 hover:text-blue-700"
                    onClick={() => startOne(question)}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className={`size-2 shrink-0 rounded-full ${statusDot(statusMap[question.id])}`}
                    />
                    <span className="flex-1 text-sm font-medium text-slate-800">
                      {question.title}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {question.type}
                    </span>
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
