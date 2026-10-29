"use client";

import { useState } from "react";

import {
  MAX_PHASES,
  autoSplitPhases,
  normalizePhases,
  type Phase,
} from "@/lib/learning/phase";

// 学习目标的个人设置：打算哪次考、每周能投入几小时、以及这几个月怎么分段。
//
// 为什么这些字段不放在主题包里：主题是公共内容（一份主题包所有人看同一份），
// 而「我这周只有 8 小时」「我打算先打基础再冲刺」是个人安排。
// 混在一起，第二个人一改就把第一个人的改了。
//
// 阶段（M2.6）与另外两个字段的性质不同：前两个是**输入**（他告诉系统事实），
// 阶段是**外框**（他给这段日子划的刻度）。所以阶段只影响今日计划上多显示一行，
// 不影响今天做几道题——估算出来的日期不该决定题量。

export type GoalSettingsValue = {
  /** 打算哪次考，留空表示跟主题的官方 deadline 一致 */
  targetDate: string | null;
  /** 每周可投入小时，留空表示没设，不做时间是否够的判断 */
  weeklyHours: number | null;
  /** 阶段划分。空数组表示不设阶段 */
  phases: Phase[];
};

/** 界面上一行可编辑的阶段。字符串全是原始输入，保存时才校验 */
type PhaseDraft = {
  /** 阶段的稳定标识。自动切分产生 kickoff / foundation 这种语义键，
   *  手加的段没有键，落库时退化成开始日。改了日期它也不变，这就是它的用处 */
  key: string;
  name: string;
  start: string;
  end: string;
  milestoneDate: string;
  milestoneLabel: string;
};

function toDraft(phases: Phase[] | null): PhaseDraft[] {
  if (!phases) return [];
  return phases.map((phase) => ({
    key: phase.key,
    name: phase.name,
    start: phase.start,
    end: phase.end,
    milestoneDate: phase.milestone?.date ?? "",
    milestoneLabel: phase.milestone?.label ?? "",
  }));
}

export function GoalSettingsDialog({
  topicName,
  topicDeadline,
  /** 目标启用那天，自动切分的起点 */
  startedAt,
  initial,
  onSubmit,
  onClose,
}: {
  topicName: string;
  topicDeadline: string | null;
  startedAt: string | null;
  initial: GoalSettingsValue;
  onSubmit: (next: GoalSettingsValue) => Promise<void>;
  onClose: () => void;
}) {
  const [targetDate, setTargetDate] = useState(initial.targetDate ?? "");
  const [weeklyHours, setWeeklyHours] = useState(
    initial.weeklyHours == null ? "" : String(initial.weeklyHours),
  );
  const [drafts, setDrafts] = useState<PhaseDraft[]>(() => toDraft(initial.phases));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 自动切分的终点：他填的考试日，留空就用主题官方日期——与今日计划里
  // `endsAt: goal.target_date ?? topic.deadline` 是同一条兜底。
  // 官方日期不是猜的，是主题自带的事实，所以这里允许用它；
  // 两者都没有时按钮禁用，绝不凭空造一个日期。
  const autoSplitEnd = targetDate.trim() || topicDeadline;

  function handleAutoSplit() {
    const split = autoSplitPhases(autoSplitEnd, startedAt ?? new Date());
    if (!split) {
      setError("先填「打算哪次考」，没有终点日期就分不出阶段。");
      return;
    }
    setError(null);
    // 已经手填过的阶段会被覆盖。这是「按目标日期重新切一份」的本意，
    // 不弹二次确认：这个按钮的结果在保存前随时可以取消离开。
    setDrafts(toDraft(split));
  }

  function updateDraft(index: number, patch: Partial<PhaseDraft>) {
    setDrafts((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addDraft() {
    if (drafts.length >= MAX_PHASES) {
      setError(`最多 ${MAX_PHASES} 段。`);
      return;
    }
    setError(null);
    setDrafts((prev) => [
      ...prev,
      { key: "", name: "", start: "", end: "", milestoneDate: "", milestoneLabel: "" },
    ]);
  }

  function removeDraft(index: number) {
    setError(null);
    setDrafts((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    setIsSaving(true);
    setError(null);

    // 空字符串存成 null，而不是 0——0 小时会被算成「时间紧到爆」，
    // 而「没填」的正确语义是「不判断」。
    const parsedWeekly = weeklyHours.trim() === "" ? null : Number(weeklyHours);
    if (parsedWeekly != null && (!Number.isFinite(parsedWeekly) || parsedWeekly < 0)) {
      setError("每周可投入小时要填 0 或正数。");
      setIsSaving(false);
      return;
    }

    // 阶段在弹窗里归一化并校验：出错时人能立刻看到「第 2 行开始日晚于结束日」，
    // 而不是点了保存、弹窗关了，才发现库里的日期是错的。
    const normalized = normalizePhases(
      drafts.map((row) => ({
        key: row.key,
        name: row.name,
        start: row.start,
        end: row.end,
        milestone:
          row.milestoneDate && row.milestoneLabel
            ? { date: row.milestoneDate, label: row.milestoneLabel }
            : null,
      })),
    );
    if (!normalized.ok) {
      setError(normalized.error);
      setIsSaving(false);
      return;
    }

    try {
      await onSubmit({
        targetDate: targetDate.trim() === "" ? null : targetDate,
        weeklyHours: parsedWeekly,
        phases: normalized.phases,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败。");
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
        <h2 className="text-base font-semibold text-slate-900">目标设置</h2>
        <p className="mt-1 text-xs text-slate-500">{topicName}</p>

        <label className="mt-4 block text-sm">
          <span className="font-medium text-slate-700">打算哪次考</span>
          <input
            type="date"
            value={targetDate}
            onChange={(event) => setTargetDate(event.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-800 focus:border-blue-400 focus:outline-none"
          />
          <span className="mt-1 block text-xs text-slate-400">
            {topicDeadline ? `留空就用主题的官方日期 ${topicDeadline}` : "主题没有官方日期"}
          </span>
        </label>

        <label className="mt-4 block text-sm">
          <span className="font-medium text-slate-700">每周可投入小时</span>
          <input
            type="number"
            min={0}
            step={0.5}
            value={weeklyHours}
            onChange={(event) => setWeeklyHours(event.target.value)}
            placeholder="例如 10"
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-800 focus:border-blue-400 focus:outline-none"
          />
          <span className="mt-1 block text-xs text-slate-400">
            只用来判断「到终点前来不来得及」。留空就不做这个判断，不猜。
          </span>
        </label>

        {/* ── 阶段划分 ───────────────────────────────────── */}
        <section className="mt-5 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium text-slate-700">阶段划分</h3>
            <button
              type="button"
              onClick={handleAutoSplit}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              按目标日期自动切分
            </button>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            只影响今日计划上多显示一行「第几周 / 在哪一段」，不影响今天做几道题。
            不设也行，不设就不显示这一行。
          </p>

          {drafts.length === 0 ? (
            <p className="mt-3 rounded border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
              还没分段。点右上角按目标日期切一份，或
              <button
                type="button"
                onClick={addDraft}
                className="mx-1 text-blue-600 hover:underline"
              >
                手动加一段
              </button>
              。
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {drafts.map((row, index) => (
                <div key={index} className="rounded border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      value={row.name}
                      onChange={(event) => updateDraft(index, { name: event.target.value })}
                      placeholder={`第 ${index + 1} 段叫什么`}
                      className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-sm text-slate-800 focus:border-blue-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => removeDraft(index)}
                      className="shrink-0 text-xs text-slate-400 hover:text-red-600"
                    >
                      移除
                    </button>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="date"
                      value={row.start}
                      onChange={(event) => updateDraft(index, { start: event.target.value })}
                      className="w-full rounded border border-slate-300 px-2 py-1 text-xs text-slate-800 focus:border-blue-400 focus:outline-none"
                    />
                    <span className="shrink-0 text-xs text-slate-400">至</span>
                    <input
                      type="date"
                      value={row.end}
                      onChange={(event) => updateDraft(index, { end: event.target.value })}
                      className="w-full rounded border border-slate-300 px-2 py-1 text-xs text-slate-800 focus:border-blue-400 focus:outline-none"
                    />
                  </div>

                  {/* 里程碑是可选的：两个格子都填才算一条，只填一个等于没填
                      （只有日期没有「要达成什么」，这条里程碑没有信息量） */}
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="date"
                      value={row.milestoneDate}
                      onChange={(event) =>
                        updateDraft(index, { milestoneDate: event.target.value })
                      }
                      className="w-36 shrink-0 rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 focus:border-blue-400 focus:outline-none"
                    />
                    <input
                      value={row.milestoneLabel}
                      onChange={(event) =>
                        updateDraft(index, { milestoneLabel: event.target.value })
                      }
                      placeholder="里程碑（可不填）"
                      className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {drafts.length > 0 && drafts.length < MAX_PHASES ? (
            <button
              type="button"
              onClick={addDraft}
              className="mt-2 text-xs text-blue-600 hover:underline"
            >
              再加一段
            </button>
          ) : null}
        </section>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            className="text-sm text-slate-500 hover:text-slate-700"
            onClick={onClose}
            disabled={isSaving}
          >
            取消
          </button>
          <button
            type="button"
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            onClick={() => void handleSubmit()}
            disabled={isSaving}
          >
            {isSaving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
