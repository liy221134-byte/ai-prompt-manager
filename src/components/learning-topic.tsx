"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  PracticeQuiz,
  type QuizQuestion,
  type QuestionStatus,
  type StatusMap,
} from "@/components/practice-quiz";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  buildPracticeMatrix,
  daysUntil,
  upcomingMilestones,
  type Level,
  type MatrixRow,
  type Milestone,
  type ModuleInput,
} from "@/lib/learning/matrix";

// 学习主题页：顶部是关键节点倒计时，中间是「内容模块 × 能力层级」的练习覆盖矩阵。
// 点某个格子就在本页进入两栏练习，题池只含该模块该层的题。
//
// 注意这一版显示的是**练习覆盖**（这层有几道题、你做了几道、对了几道），
// 不是**诊断结论**（你在第几层）。诊断要 M2 才有，原因见 M1 设计文档第一节。

type TopicRow = {
  id: string;
  name: string;
  goal: string | null;
  deadline: string | null;
  total_hours: number | null;
  exam_facts: { milestones?: Milestone[] } | null;
};

const LEVEL_LABELS: Record<Level, string> = {
  1: "L1 认得",
  2: "L2 说得出",
  3: "L3 算得出",
  4: "L4 判得准",
  5: "L5 迁得动",
};

const QUESTION_COLUMNS =
  "id, category, title, difficulty, type, body_md, options, answer, explanation_md, module_id, level";

export function LearningTopic() {
  const [topic, setTopic] = useState<TopicRow | null>(null);
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [statusMap, setStatusMap] = useState<StatusMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [quizQueue, setQuizQueue] = useState<QuizQuestion[] | null>(null);
  const [quizLabel, setQuizLabel] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClient();

      // 1) 主题：v4 只有中项一个主题，取第一条。将来多主题时改成路由参数。
      const { data: topicRows, error: topicError } = await supabase
        .from("learning_topics")
        .select("id, name, goal, deadline, total_hours, exam_facts")
        .order("created_at")
        .limit(1);

      if (topicError) throw topicError;
      if (!topicRows || topicRows.length === 0) {
        setTopic(null);
        setRows([]);
        setQuestions([]);
        return;
      }

      const currentTopic = topicRows[0] as TopicRow;
      setTopic(currentTopic);

      // 2) 模块
      const { data: moduleRows, error: moduleError } = await supabase
        .from("learning_modules")
        .select("id, name, order_index, weight, expected_gap, planned_hours, exit_criteria")
        .eq("topic_id", currentTopic.id)
        .order("order_index");

      if (moduleError) throw moduleError;

      // 3) 题目：该主题下的全部题（含层级与所属模块）
      const { data: questionRows, error: questionError } = await supabase
        .from("practice_questions")
        .select(QUESTION_COLUMNS)
        .eq("topic_id", currentTopic.id)
        .order("module_id")
        .order("level")
        .order("id");

      if (questionError) throw questionError;

      const qs = (questionRows ?? []) as QuizQuestion[];
      setQuestions(qs);

      // 4) 本人答题记录：先拉全部再在内存里过滤。
      //    现在量很小（单用户、每题最新一次即生效），超过千条再改成按题 id 分批查。
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let attempts: { question_id: string; is_correct: boolean; created_at: string }[] = [];
      if (user) {
        const { data: attemptRows } = await supabase
          .from("practice_attempts")
          .select("question_id, is_correct, created_at")
          .eq("user_id", user.id);
        attempts = attemptRows ?? [];
      }

      // 5) 算两样东西：给矩阵用的统计、给练习组件用的每题状态
      setRows(
        buildPracticeMatrix(
          (moduleRows ?? []) as ModuleInput[],
          qs.map((q) => ({
            id: q.id,
            module_id: (q as QuizQuestion & { module_id?: string | null }).module_id ?? null,
            level: (q as QuizQuestion & { level?: number | null }).level ?? null,
          })),
          attempts,
        ),
      );

      const latest = new Map<string, { correct: boolean; at: string }>();
      for (const attempt of attempts) {
        const prev = latest.get(attempt.question_id);
        if (!prev || attempt.created_at > prev.at) {
          latest.set(attempt.question_id, { correct: attempt.is_correct, at: attempt.created_at });
        }
      }
      const map: StatusMap = {};
      for (const [qid, value] of latest) {
        map[qid] = value.correct ? "已做" : ("错题" as QuestionStatus);
      }
      setStatusMap(map);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "学习计划加载失败。");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const milestones = useMemo(
    () => upcomingMilestones(topic?.exam_facts?.milestones ?? null),
    [topic],
  );

  const daysToExam = topic?.deadline ? daysUntil(topic.deadline) : null;

  const totals = useMemo(() => {
    let questions = 0;
    let done = 0;
    let unleveled = 0;
    for (const row of rows) {
      questions += row.totalQuestions;
      done += row.totalDone;
      unleveled += row.unleveled;
    }
    return { questions, done, unleveled };
  }, [rows]);

  // 点格子：只把该模块该层的题放进题池，按 id 排好保证顺序稳定
  function enterCell(moduleId: string, moduleName: string, level: Level) {
    const pool = questions.filter((question) => {
      const row = question as QuizQuestion & { module_id?: string | null; level?: number | null };
      return row.module_id === moduleId && row.level === level;
    });

    if (pool.length === 0) return;

    setQuizQueue(pool);
    setQuizLabel(`${moduleName} · ${LEVEL_LABELS[level]}（${pool.length}）`);
  }

  if (quizQueue) {
    return (
      <PracticeQuiz
        questions={quizQueue}
        modeLabel={quizLabel}
        statusMap={statusMap}
        onExit={() => {
          setQuizQueue(null);
          // 答完题回到矩阵，数字要跟着变
          void load();
        }}
      />
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">
            {topic?.name ?? "学习计划"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {topic?.goal ?? "按内容模块和能力层级安排练习，看到自己缺在哪一层。"}
          </p>
        </div>
        <div className="shrink-0 space-x-4 text-sm font-medium">
          <Link href="/practice" className="text-blue-600 hover:underline">
            题库
          </Link>
          <Link href="/" className="text-blue-600 hover:underline">
            返回首页
          </Link>
        </div>
      </header>

      {isLoading ? (
        <p className="mt-10 text-sm text-slate-500">加载中…</p>
      ) : error ? (
        <p className="mt-10 text-sm text-red-600">{error}</p>
      ) : !topic ? (
        <p className="mt-10 text-sm text-slate-500">
          还没有导入任何学习主题。用主题包导入脚本导入后再回来看。
        </p>
      ) : (
        <>
          {/* 关键节点：报名是唯一不可挽回的节点，所以排在最前面 */}
          <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <div>
                <span className="text-xs font-semibold text-slate-400">距考试</span>
                <span className="ml-2 text-2xl font-bold tabular-nums text-slate-950">
                  {daysToExam ?? "—"}
                </span>
                <span className="ml-1 text-sm text-slate-500">天</span>
              </div>
              {topic.total_hours ? (
                <div className="text-sm text-slate-500">
                  计划投入 <span className="font-semibold text-slate-700">{topic.total_hours}</span> 小时
                </div>
              ) : null}
            </div>

            {milestones.length > 0 ? (
              <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                {milestones.map(({ milestone, daysLeft, passed }) => (
                  <li
                    key={`${milestone.name}-${milestone.date}`}
                    className="flex flex-wrap items-baseline gap-x-3 text-sm"
                  >
                    <span className={passed ? "text-slate-400" : "font-medium text-slate-800"}>
                      {milestone.name}
                    </span>
                    <span className="tabular-nums text-slate-500">{milestone.date}</span>
                    <span
                      className={
                        passed
                          ? "text-xs text-slate-400"
                          : daysLeft <= 30
                            ? "text-xs font-semibold text-amber-600"
                            : "text-xs text-slate-500"
                      }
                    >
                      {passed ? "已过" : `还有 ${daysLeft} 天`}
                    </span>
                    {milestone.note ? (
                      <span className="text-xs text-slate-400">{milestone.note}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          {/* 练习覆盖矩阵 */}
          <section className="mt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">练习覆盖</h2>
              <p className="text-xs text-slate-500">
                共 {totals.questions} 题 · 已做 {totals.done} 题
                {totals.unleveled > 0 ? ` · 另有 ${totals.unleveled} 题未标层级` : ""}
              </p>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-300">
                    <th className="py-2 pr-3 text-left font-semibold text-slate-600">内容模块</th>
                    {([1, 2, 3, 4, 5] as Level[]).map((lv) => (
                      <th key={lv} className="px-2 py-2 text-center font-semibold text-slate-600">
                        {LEVEL_LABELS[lv]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.module.id} className="border-b border-slate-100">
                      <td className="py-3 pr-3">
                        <div className="font-medium text-slate-800">{row.module.name}</div>
                        <div className="mt-0.5 text-xs text-slate-400">
                          {row.module.planned_hours ? `${row.module.planned_hours} 小时` : ""}
                          {row.module.expected_gap ? ` · 预判缺口 ${row.module.expected_gap}` : ""}
                        </div>
                      </td>
                      {([1, 2, 3, 4, 5] as Level[]).map((lv) => {
                        const cell = row.cells[lv];
                        if (cell.total === 0) {
                          return (
                            <td key={lv} className="px-2 py-3 text-center">
                              <span className="text-xs text-slate-300">未出题</span>
                            </td>
                          );
                        }
                        return (
                          <td key={lv} className="px-2 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => enterCell(row.module.id, row.module.name, lv)}
                              title={
                                cell.enoughQuestions
                                  ? `做对 ${cell.correct} 道`
                                  : `题量不足（${cell.total} 题），练习结果仅供参考`
                              }
                              className={[
                                "inline-flex min-w-[64px] flex-col items-center rounded-lg border px-2 py-1.5 transition-colors",
                                "border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50",
                              ].join(" ")}
                            >
                              <span className="text-sm font-semibold tabular-nums text-slate-800">
                                {cell.done}/{cell.total}
                              </span>
                              <span
                                className={[
                                  "mt-0.5 text-[11px] tabular-nums",
                                  cell.done === 0 ? "text-slate-400" : "text-emerald-600",
                                ].join(" ")}
                              >
                                {cell.done === 0 ? "未做" : `对 ${cell.correct}`}
                              </span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-xs leading-6 text-slate-500">
              每格显示「已做 / 题数」。这里只反映练习覆盖，<strong className="font-semibold text-slate-600">不代表能力层级判定</strong>
              —— 某一层题量少于 3 道时，结果只能当参考。真正的诊断在 M2。
            </p>
          </section>
        </>
      )}
    </main>
  );
}
