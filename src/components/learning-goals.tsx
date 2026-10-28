"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { goalId } from "@/lib/learning/goal-id";
import { daysUntil } from "@/lib/learning/matrix";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

// 学习目标列表：一条线一个人。这里是「子系统」的入口页。
//
// 为什么要有这一页而不是直接进矩阵：
//   手里同时有七八个学习目标，一天只有一两个小时。直接进某一个目标的矩阵，
//   等于假装其他目标不存在。这一页把全部目标摊开，标出「现在推哪个、其余排队」。
//
// 主攻唯一这条不是这里发明的，是 learning_goals 上的部分唯一索引兜住的；
// 界面负责「切主攻时先把旧的清掉」，数据库负责「万一忘了清也写不进去」。

type TopicRow = {
  id: string;
  name: string;
  goal: string | null;
  kind: string | null;
  deadline: string | null;
  total_hours: number | null;
};

type GoalRow = {
  id: string;
  topic_id: string;
  is_focus: boolean;
  status: string;
  weekly_hours: number | null;
  target_date: string | null;
};

const KIND_LABELS: Record<string, string> = {
  exam: "考试型",
  skill: "技能型",
  system: "体系型",
  behavior: "行为型",
};

export function LearningGoals() {
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingTopicId, setPendingTopicId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClient();

      const { data: topicRows, error: topicError } = await supabase
        .from("learning_topics")
        .select("id, name, goal, kind, deadline, total_hours")
        .order("created_at");

      if (topicError) throw topicError;
      setTopics((topicRows ?? []) as TopicRow[]);

      // 目标只读自己的。未登录时 RLS 会返回空数组，不算错误。
      const { data: goalRows, error: goalError } = await supabase
        .from("learning_goals")
        .select("id, topic_id, is_focus, status, weekly_hours, target_date");

      if (goalError) throw goalError;
      setGoals((goalRows ?? []) as GoalRow[]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "学习目标加载失败。");
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

  const goalsByTopic = useMemo(() => {
    const map = new Map<string, GoalRow>();
    for (const goal of goals) map.set(goal.topic_id, goal);
    return map;
  }, [goals]);

  /**
   * 把某个目标设为主攻。
   *
   * 两步不能省：先把自己名下所有目标降为排队，再把目标这条置为主攻。
   * 直接只做第二步的话，部分唯一索引会拒绝——这正好是它该做的事。
   */
  async function setFocus(topicId: string) {
    setPendingTopicId(topicId);
    setError(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("登录状态失效，请重新登录。");

      const { error: clearError } = await supabase
        .from("learning_goals")
        .update({ is_focus: false })
        .eq("user_id", user.id)
        .eq("is_focus", true);

      if (clearError) throw clearError;

      const existing = goalsByTopic.get(topicId);
      const { error: upsertError } = await supabase.from("learning_goals").upsert(
        {
          // 首次启用时按「人 + 主题」生成 id，而不是只用主题 id——
          // 只用主题 id 会在第二个用户启用同一主题时撞主键。
          id: existing?.id ?? goalId(user.id, topicId),
          user_id: user.id,
          topic_id: topicId,
          is_focus: true,
          status: "active",
        },
        { onConflict: "user_id,topic_id" },
      );

      if (upsertError) throw upsertError;

      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "设置主攻失败。");
    } finally {
      setPendingTopicId(null);
    }
  }

  const focusTopicId = goals.find((goal) => goal.is_focus)?.topic_id ?? null;

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">学习目标</h1>
          <p className="mt-1 text-sm text-slate-500">
            同时只推一个主攻。其余排队——一天只有一两个小时，摊开会变成八件都没做。
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
      ) : topics.length === 0 ? (
        <p className="mt-10 text-sm text-slate-500">
          还没有导入任何学习主题。主题包导入后，目标会出现在这里。
        </p>
      ) : (
        <ul className="mt-8 space-y-3">
          {topics.map((topic) => {
            const goal = goalsByTopic.get(topic.id);
            const isFocus = Boolean(goal?.is_focus);
            const daysLeft = topic.deadline ? daysUntil(topic.deadline) : null;
            const isPending = pendingTopicId === topic.id;

            return (
              <li
                key={topic.id}
                className={`rounded-xl border p-4 transition-colors ${
                  isFocus ? "border-blue-300 bg-blue-50/40" : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <Link
                        href={`/learning/${topic.id}`}
                        className="text-base font-semibold text-slate-900 hover:text-blue-700"
                      >
                        {topic.name}
                      </Link>
                      {isFocus ? (
                        <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[11px] font-medium text-white">
                          主攻
                        </span>
                      ) : goal ? (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                          排队中
                        </span>
                      ) : (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-400">
                          未启用
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-sm text-slate-500">{topic.goal ?? "未写目标"}</p>

                    <p className="mt-1.5 text-xs text-slate-400">
                      {topic.kind ? (KIND_LABELS[topic.kind] ?? topic.kind) : "未标类型"}
                      {topic.total_hours ? ` · 计划 ${topic.total_hours} 小时` : ""}
                      {daysLeft != null
                        ? daysLeft >= 0
                          ? ` · 距终点 ${daysLeft} 天`
                          : ` · 已过 ${-daysLeft} 天`
                        : " · 无截止日"}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-3 text-sm">
                    <Link
                      href={`/learning/${topic.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      进入
                    </Link>
                    {isFocus ? null : (
                      <button
                        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-700 disabled:opacity-50"
                        disabled={isPending}
                        onClick={() => void setFocus(topic.id)}
                        type="button"
                      >
                        {isPending ? "设置中…" : focusTopicId ? "改为主攻" : "设为主攻"}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-8 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-400">
        主攻决定「今日计划」服务谁。改主攻不会丢数据——已做的题按目标分别记着。
      </p>
    </main>
  );
}
