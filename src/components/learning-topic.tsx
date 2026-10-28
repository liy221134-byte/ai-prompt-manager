"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  PracticeQuiz,
  type QuizQuestion,
  type QuestionStatus,
  type StatusMap,
} from "@/components/practice-quiz";
import { GoalSettingsDialog, type GoalSettingsValue } from "@/components/goal-settings-dialog";
import { KnowledgeNoteDrawer } from "@/components/knowledge-note-drawer";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { buildDailyPlan, type DailyPlanStatus } from "@/lib/learning/daily-plan";
import { goalId } from "@/lib/learning/goal-id";
import { attachTopicNotes } from "@/lib/learning/topic-notes";
import {
  buildLevelLabels,
  buildPracticeMatrix,
  daysUntil,
  upcomingMilestones,
  type AttemptInput,
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
  /** 目标性质：exam / skill / system / behavior。决定阶梯怎么搭、进度怎么判 */
  kind: string | null;
  deadline: string | null;
  total_hours: number | null;
  exam_facts: { milestones?: Milestone[] } | null;
  /** 五层的名字与判据，导入时随主题写库。列头按它渲染，不再硬编码 */
  level_definition: unknown;
};

const KIND_LABELS: Record<string, string> = {
  exam: "考试型",
  skill: "技能型",
  system: "体系型",
  behavior: "行为型",
};

/**
 * 一个知识点，含讲义。
 *
 * 库里只有前五个字段（id / 模块 / 名字 / 教材位置 / 次序），
 * summary 与 note_md 由 attachTopicNotes 从主题包补上，不来自数据库。
 *
 * 两者都可空：讲义是渐进补的，29 个知识点现在只有 S1 的五份。
 * 页面要能区分「这个知识点没讲义」和「有讲义但没加载出来」——
 * 前者显示「讲义待补」，后者不该假装没讲义。
 */
type KnowledgePointRow = {
  id: string;
  module_id: string;
  name: string;
  ref: string | null;
  order_index: number | null;
  summary: string | null;
  note_md: string | null;
};

/** 「今天来不来得及」的结论怎么着色：紧的用琥珀，已过的用红，判断不了的用灰 */
const STATUS_STYLE: Record<DailyPlanStatus, string> = {
  finished: "text-emerald-700",
  overdue: "text-red-600",
  "no-deadline": "text-slate-500",
  "no-hours-set": "text-slate-500",
  "on-track": "text-emerald-700",
  tight: "text-amber-700",
};

/** 个人对某个主题的安排。主题是公共内容，这份是「我的」 */
type GoalRow = {
  id: string;
  is_focus: boolean;
  status: string;
  weekly_hours: number | null;
  target_date: string | null;
  /** 启用这个目标的那天，今日计划拿它当第 1 天 */
  started_at: string | null;
};

const QUESTION_COLUMNS =
  "id, category, title, difficulty, type, body_md, options, answer, explanation_md, module_id, level, knowledge_point";

export function LearningTopic({ topicId }: { topicId: string }) {
  const [topic, setTopic] = useState<TopicRow | null>(null);
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [statusMap, setStatusMap] = useState<StatusMap>({});
  // 今日计划要用原始作答记录，所以除了 statusMap 还留一份
  const [attempts, setAttempts] = useState<AttemptInput[]>([]);
  const [goal, setGoal] = useState<GoalRow | null>(null);
  const [knowledgePoints, setKnowledgePoints] = useState<KnowledgePointRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // 正在读讲义的那个知识点。null 表示抽屉关着。
  // 存整行而不是 id：抽屉里要渲染 summary 和正文，不必再从数组里查一遍。
  const [openNote, setOpenNote] = useState<KnowledgePointRow | null>(null);

  const [quizQueue, setQuizQueue] = useState<QuizQuestion[] | null>(null);
  const [quizLabel, setQuizLabel] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClient();

      // 1) 主题：按路由参数取。M2 起多主题并存，不再「取第一条」
      const { data: topicRow, error: topicError } = await supabase
        .from("learning_topics")
        .select("id, name, goal, kind, deadline, total_hours, exam_facts, level_definition")
        .eq("id", topicId)
        .maybeSingle();

      if (topicError) throw topicError;
      if (!topicRow) {
        setTopic(null);
        setRows([]);
        setQuestions([]);
        setAttempts([]);
        setGoal(null);
        return;
      }

      const currentTopic = topicRow as TopicRow;
      setTopic(currentTopic);

      // 2) 模块 + 知识点：库里只存「有哪些知识点」（id / 名字 / 教材位置），
      //    讲义随主题包编译进 bundle，取完由 attachTopicNotes 贴上来。
      //    讲义为什么不落库见 lib/learning/topic-notes.ts 顶部。
      //    两条一起发，互不依赖。
      const [moduleResult, kpResult] = await Promise.all([
        supabase
          .from("learning_modules")
          .select("id, name, order_index, weight, expected_gap, planned_hours, exit_criteria")
          .eq("topic_id", currentTopic.id)
          .order("order_index"),
        supabase
          .from("knowledge_points")
          .select("id, module_id, name, ref, order_index")
          .eq("topic_id", currentTopic.id)
          .order("order_index"),
      ]);

      if (moduleResult.error) throw moduleResult.error;
      const moduleRows = moduleResult.data;

      // 知识点取不到时按「没有知识点」处理，不让它拖垮矩阵与今日计划——
      // 缺讲义是缺内容，矩阵覆盖与今日计划是主功能，不该被一起带下水。
      if (kpResult.error) {
        console.warn("知识点取不到，按无知识点处理：", kpResult.error.message);
      }
      setKnowledgePoints(
        attachTopicNotes(
          currentTopic.id,
          (kpResult.data ?? []) as Array<Omit<KnowledgePointRow, "summary" | "note_md">>,
        ),
      );

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

      // 4) 本人的东西：答题记录 + 对这个主题的个人设置（每周几小时、打算哪次考）。
      //    先拉全部再在内存里过滤。现在量很小（单用户、每题最新一次即生效），
      //    超过千条再改成按题 id 分批查。
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let attemptRows: AttemptInput[] = [];
      let goalRow: GoalRow | null = null;
      if (user) {
        const [attemptResult, goalResult] = await Promise.all([
          supabase
            .from("practice_attempts")
            .select("question_id, is_correct, created_at")
            .eq("user_id", user.id),
          supabase
            .from("learning_goals")
            .select("id, is_focus, status, weekly_hours, target_date, started_at")
            .eq("user_id", user.id)
            .eq("topic_id", currentTopic.id)
            .maybeSingle(),
        ]);
        attemptRows = (attemptResult.data ?? []) as AttemptInput[];
        goalRow = (goalResult.data as GoalRow | null) ?? null;
      }

      setGoal(goalRow);
      setAttempts(attemptRows);

      // 5) 算三样东西：矩阵统计、每题状态、今日计划
      setRows(
        buildPracticeMatrix(
          (moduleRows ?? []) as ModuleInput[],
          qs.map((q) => ({
            id: q.id,
            module_id: (q as QuizQuestion & { module_id?: string | null }).module_id ?? null,
            level: (q as QuizQuestion & { level?: number | null }).level ?? null,
          })),
          attemptRows,
        ),
      );

      const latest = new Map<string, { correct: boolean; at: string }>();
      for (const attempt of attemptRows) {
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
  }, [topicId]);

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

  // 列头跟着主题的阶梯定义走：中项显示「L3 算得出」，Python 会显示「L3 写得出」
  const levelLabels = useMemo(
    () => buildLevelLabels(topic?.level_definition),
    [topic],
  );

  const daysToExam = topic?.deadline ? daysUntil(topic.deadline) : null;

  // 今日计划：把工时和天数压成「今天做这几道」。
  //
  // 起点用个人目标的 started_at（启用那天），终点用 target_date（打算哪次考），
  // 都留空时由 buildDailyPlan 兜底成「今天起、无终点」——不猜一个日期出来。
  const plan = useMemo(
    () =>
      buildDailyPlan({
        modules: rows.map((row) => row.module),
        questions: questions.map((question) => {
          const extra = question as QuizQuestion & { module_id?: string | null; level?: number | null };
          return { id: question.id, module_id: extra.module_id ?? null, level: extra.level ?? null };
        }),
        attempts,
        totalHours: topic?.total_hours ?? null,
        startedAt: goal?.started_at ?? null,
        endsAt: goal?.target_date ?? topic?.deadline ?? null,
        weeklyHours: goal?.weekly_hours ?? null,
      }),
    [rows, questions, attempts, topic, goal],
  );

  /**
   * 今日要做的题落在哪些有讲义的知识点上。
   *
   * 用「题目反查知识点」而不是「模块下的全部知识点」：今日配额只有几道题，
   * 往往只落在某一个知识点上。把模块下五份讲义都摆出来让他在里面挑，
   * 不如把当前这几道题对应的那份直接递到手上。
   */
  const todayNotes = useMemo(() => {
    if (!plan.focus) return [];
    const byId = new Map(knowledgePoints.map((kp) => [kp.id, kp]));
    const seen = new Set<string>();
    const result: KnowledgePointRow[] = [];

    for (const questionId of plan.focus.questionIds) {
      const question = questions.find((item) => item.id === questionId) as
        | (QuizQuestion & { knowledge_point?: string | null })
        | undefined;
      const kpId = question?.knowledge_point;
      if (!kpId || seen.has(kpId)) continue;
      seen.add(kpId);
      const kp = byId.get(kpId);
      if (kp?.note_md) result.push(kp);
    }

    return result;
  }, [plan, questions, knowledgePoints]);

  /** 按模块归并知识点，顺序跟矩阵行一致。讲义写了几份，这里就显示几份。 */
  const notesByModule = useMemo(() => {
    const grouped = new Map<string, KnowledgePointRow[]>();
    for (const kp of knowledgePoints) {
      const list = grouped.get(kp.module_id) ?? [];
      list.push(kp);
      grouped.set(kp.module_id, list);
    }
    return grouped;
  }, [knowledgePoints]);

  const noteCount = useMemo(
    () => knowledgePoints.filter((kp) => kp.note_md).length,
    [knowledgePoints],
  );

  /**
   * 按知识点 id 索引的讲义，给练习组件用。
   *
   * 只放有正文的条目：练习组件靠「这个 id 在不在表里」决定要不要显示入口，
   * 把没讲义的也放进去就得在组件里再判一次空，两处判空早晚不一致。
   */
  const notesById = useMemo(() => {
    const map: Record<string, KnowledgePointRow> = {};
    for (const kp of knowledgePoints) {
      if (kp.note_md) map[kp.id] = kp;
    }
    return map;
  }, [knowledgePoints]);

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

  // 进练习：题池与标签都由调用方给，矩阵格子与今日计划共用这一条路
  function startQuiz(pool: QuizQuestion[], label: string) {
    if (pool.length === 0) return;
    setQuizQueue(pool);
    setQuizLabel(label);
  }

  // 点格子：只把该模块该层的题放进题池，按 id 排好保证顺序稳定
  function enterCell(moduleId: string, moduleName: string, level: Level) {
    const pool = questions.filter((question) => {
      const row = question as QuizQuestion & { module_id?: string | null; level?: number | null };
      return row.module_id === moduleId && row.level === level;
    });

    if (pool.length === 0) return;

    startQuiz(pool, `${moduleName} · ${levelLabels[level]}（${pool.length}）`);
  }

  /**
   * 今日计划里的「开始」。
   *
   * 顺序按计划给的来（错题在前），不按题库顺序——计划说先复错题，
   * 进到练习里却是新题打头，两处口径就分叉了。
   */
  function startDaily() {
    if (!plan.focus) return;
    const byId = new Map(questions.map((question) => [question.id, question]));
    const pool = plan.focus.questionIds
      .map((id) => byId.get(id))
      .filter((question): question is QuizQuestion => Boolean(question));

    const levelText = levelLabels[plan.focus.level];
    startQuiz(pool, `今日 · ${plan.focus.moduleName} · ${levelText}（${pool.length}）`);
  }

  /** 保存个人设置。只写 learning_goals 的两列，不动状态与主攻。 */
  async function saveSettings(next: GoalSettingsValue) {
    if (!topic) throw new Error("主题还没加载完。");

    const supabase = getSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("登录状态失效，请重新登录。");

    const { error: upsertError } = await supabase.from("learning_goals").upsert(
      {
        // 已有记录沿用它的 id，没有才按「人 + 主题」生成——与设主攻同一口径
        id: goal?.id ?? goalId(user.id, topic.id),
        user_id: user.id,
        topic_id: topic.id,
        is_focus: goal?.is_focus ?? false,
        status: goal?.status ?? "active",
        weekly_hours: next.weeklyHours,
        target_date: next.targetDate,
      },
      { onConflict: "user_id,topic_id" },
    );

    if (upsertError) throw upsertError;

    setShowSettings(false);
    await load();
  }

  // 抽屉提到两个 return 之前定义：练习模式是提前 return 的独立分支，
  // 若只在主 return 里挂抽屉，练习页里点「看讲义」会设了状态却没有节点可渲染——
  // 表现就是点了没反应（2026-10-28 实测踩到）。
  const noteDrawer = openNote ? (
    <KnowledgeNoteDrawer note={openNote} onClose={() => setOpenNote(null)} />
  ) : null;

  if (quizQueue) {
    return (
      <>
        <PracticeQuiz
          questions={quizQueue}
          modeLabel={quizLabel}
          statusMap={statusMap}
          notes={notesById}
          onOpenNote={(kpId) => {
            const kp = notesById[kpId];
            if (kp) setOpenNote(kp);
          }}
          onExit={() => {
            setQuizQueue(null);
            // 答完题回到矩阵，数字要跟着变
            void load();
          }}
        />
        {noteDrawer}
      </>
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
          {topic?.kind ? (
            <p className="mt-2 text-xs text-slate-400">
              {KIND_LABELS[topic.kind] ?? topic.kind}
              {topic.total_hours ? ` · 计划 ${topic.total_hours} 小时` : ""}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 space-x-4 text-sm font-medium">
          <Link href="/learning" className="text-blue-600 hover:underline">
            全部目标
          </Link>
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
          这个学习目标不存在，可能已被删除。
          <Link href="/learning" className="ml-1 text-blue-600 hover:underline">
            回到目标列表
          </Link>
        </p>
      ) : (
        <>
          {/* 今日计划：这一块排最前。倒计时说「还有多少时间」，这一块说「今天做什么」——
              人打开页面要的是后者。 */}
          <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-x-2">
                <h2 className="text-base font-semibold text-slate-900">今日计划</h2>
                <span className="text-xs text-slate-400">
                  第 {plan.dayIndex} 天
                  {plan.totalDays ? ` / 共 ${plan.totalDays} 天` : ""}
                </span>
              </div>
              <button
                type="button"
                className="text-xs font-medium text-blue-600 hover:underline"
                onClick={() => setShowSettings(true)}
              >
                改设置
              </button>
            </div>

            {plan.focus ? (
              <div className="mt-3">
                <p className="text-lg font-semibold text-slate-900">
                  {plan.focus.moduleName} · {levelLabels[plan.focus.level]}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {plan.focus.questionIds.length} 道题
                  {plan.focus.hasWrongOnes ? "，错题排前面，先复" : ""}
                  <span className="text-slate-400"> · 全主题还剩 {plan.remainingQuestions} 道</span>
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={startDaily}
                    className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                  >
                    开始做题
                  </button>
                  {/* 讲义入口排在「开始做题」右边而不是左边：多数时候人是要做题的，
                      但如果今天这几道题的知识点刚接触过、还没读过讲义，多半会先点这个。
                      没有讲义时整个按钮不出现——给一个点了没反应的入口比不给更差。 */}
                  {todayNotes.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setOpenNote(todayNotes[0])}
                      className="text-sm font-medium text-blue-600 hover:underline"
                    >
                      先看讲义：{todayNotes[0].name}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-600">
                {plan.remainingQuestions === 0 ? (
                  "题都做完了，接下来复错题、做整套模拟。"
                ) : (
                  <>
                    还有 {plan.remainingQuestions} 道题没归到任何模块，
                    <Link href="/practice" className="text-blue-600 hover:underline">
                      去题库里做
                    </Link>
                    。
                  </>
                )}
              </p>
            )}

            <p className={`mt-3 text-sm ${STATUS_STYLE[plan.status]}`}>{plan.headline}</p>

            {goal && !goal.is_focus ? (
              <p className="mt-1.5 text-xs leading-5 text-amber-700">
                这个目标是排队状态，今日计划只服务主攻那个。要推它，去
                <Link href="/learning" className="mx-0.5 text-blue-600 hover:underline">
                  目标列表
                </Link>
                把它设为主攻。
              </p>
            ) : null}

            {plan.plannedModuleName &&
            plan.actualModuleName &&
            plan.plannedModuleId !== plan.actualModuleId ? (
              <p className="mt-1.5 text-xs leading-5 text-slate-500">
                按计划今天该在「{plan.plannedModuleName}」，练习还停在「{plan.actualModuleName}」。
                顺序学，先把手上这块收口，别跳到后面去。
              </p>
            ) : null}
          </section>

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
                        {levelLabels[lv]}
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

          {/* 讲义：矩阵说「做到哪一层」，这一块说「这块到底在讲什么」。
              没有这一块，这个产品只能告诉你做哪几道题，答不了「这句话什么意思」——
              那也是它此前不算能学的原因。 */}
          <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">知识点讲义</h2>
              <span className="text-xs text-slate-400">
                {knowledgePoints.length === 0
                  ? "没取到知识点"
                  : `${noteCount} / ${knowledgePoints.length} 个知识点已有讲义`}
              </span>
            </div>

            {knowledgePoints.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                知识点没加载出来。主题包还没导入时会是这个状态：跑一次
                scripts/import-topic-pack.mjs 再刷新。
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {rows.map((row) => {
                  const list = notesByModule.get(row.module.id) ?? [];
                  const written = list.filter((kp) => kp.note_md);

                  return (
                    <div key={row.module.id}>
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <h3 className="text-sm font-medium text-slate-800">{row.module.name}</h3>
                        <span className="text-xs text-slate-400">
                          {list.length} 个知识点
                          {written.length > 0 ? ` · 已有讲义 ${written.length}` : " · 讲义待补"}
                        </span>
                      </div>

                      {written.length > 0 ? (
                        <ul className="mt-1.5 space-y-1">
                          {written.map((kp) => (
                            <li key={kp.id}>
                              <button
                                type="button"
                                onClick={() => setOpenNote(kp)}
                                className="w-full rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-left transition-colors hover:border-blue-300 hover:bg-blue-50"
                              >
                                <span className="text-sm font-medium text-slate-800">{kp.name}</span>
                                {kp.ref ? (
                                  <span className="ml-1.5 text-xs text-slate-400">{kp.ref}</span>
                                ) : null}
                                <p className="mt-0.5 text-xs leading-5 text-slate-500">{kp.summary}</p>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-xs leading-5 text-slate-400">
                          这一块还没写讲义，先做题——题目解析里有关键点。
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {showSettings && topic ? (
        <GoalSettingsDialog
          topicName={topic.name}
          topicDeadline={topic.deadline}
          initial={{
            targetDate: goal?.target_date ?? null,
            weeklyHours: goal?.weekly_hours ?? null,
          }}
          onSubmit={saveSettings}
          onClose={() => setShowSettings(false)}
        />
      ) : null}

      {noteDrawer}
    </main>
  );
}
