"use client";

import { useState } from "react";

// 学习目标的个人设置：打算哪次考、每周能投入几小时。
//
// 为什么这两个字段不放在主题包里：主题是公共内容（一份主题包所有人看同一份），
// 而「我这周只有 8 小时」是个人安排。混在一起，第二个人一改就把第一个人的改了。
//
// 它们只影响一件事：今日计划里「到终点前来不来得及」的判断。
// 所以没填也能用，只是那句结论会说「判断不了」而不是猜一个「够」。

export type GoalSettingsValue = {
  /** 打算哪次考，留空表示跟主题的官方 deadline 一致 */
  targetDate: string | null;
  /** 每周可投入小时，留空表示没设，不做时间是否够的判断 */
  weeklyHours: number | null;
};

export function GoalSettingsDialog({
  topicName,
  topicDeadline,
  initial,
  onSubmit,
  onClose,
}: {
  topicName: string;
  topicDeadline: string | null;
  initial: GoalSettingsValue;
  onSubmit: (next: GoalSettingsValue) => Promise<void>;
  onClose: () => void;
}) {
  const [targetDate, setTargetDate] = useState(initial.targetDate ?? "");
  const [weeklyHours, setWeeklyHours] = useState(
    initial.weeklyHours == null ? "" : String(initial.weeklyHours),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    try {
      await onSubmit({
        targetDate: targetDate.trim() === "" ? null : targetDate,
        weeklyHours: parsedWeekly,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败。");
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
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
