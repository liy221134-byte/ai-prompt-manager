"use client";

// M4 诊断的两个界面块：入口（含上次结论）与本次结果。
//
// 拆出来的原因不是「文件太长」，而是这两块跟主题页的其余部分没有共享状态：
// 入口只知道「卷子几道题、上次判到哪」，结果只知道「这次判到哪、模型说了什么」。
// 塞回 learning-topic.tsx 会让人以为它们与矩阵、今日计划互相依赖，其实不依赖。

import { useState } from "react";

import type { DiagnosticInference, Level, StopReason } from "@/lib/learning/diagnostic";
import type { DiagnosticAdvice } from "@/lib/learning/diagnostic-prompt";

/** 一次已保存的诊断。result 是 jsonb，形状由 diagnostic.ts 的 payload 决定 */
export type StoredDiagnostic = {
  id: string;
  taken_at: string;
  result: unknown;
};

type LevelLabels = Record<Level, string>;

/** 从 jsonb 里把要展示的部分捞出来。读不到就返回 null，不假装有结论 */
export function readStoredDiagnostic(stored: StoredDiagnostic | null): {
  headline: string;
  takenAt: string;
  modules: Array<{ moduleName: string; reached: number; stopped: string }>;
} | null {
  if (!stored || !stored.result || typeof stored.result !== "object") return null;

  const payload = stored.result as Record<string, unknown>;
  const inference = payload.inference as Record<string, unknown> | undefined;
  if (!inference || typeof inference.headline !== "string") return null;

  const modules = Array.isArray(inference.modules) ? inference.modules : [];
  return {
    headline: inference.headline,
    takenAt: stored.taken_at,
    // 用 flatMap 而不是 map + 类型谓词：读 jsonb 时每一条都可能不成形，
    // 直接「不成形的返回空数组」比先 map 成 null 再断言类型干净得多。
    modules: modules
      .flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const entry = item as Record<string, unknown>;
        const moduleName = typeof entry.moduleName === "string" ? entry.moduleName : "";
        if (!moduleName) return [];
        return [
          {
            moduleName,
            reached: Number(entry.reached) || 0,
            stopped: describeStopRaw(entry.stoppedAt),
          },
        ];
      }),
  };
}

/** 存进库的 stoppedAt 是纯数据，这里只做「哪层 + 什么原因」的中文描述 */
function describeStopRaw(stoppedAt: unknown): string {
  if (!stoppedAt || typeof stoppedAt !== "object") return "全部答对";
  const entry = stoppedAt as Record<string, unknown>;
  const level = Number(entry.level);
  const reason = entry.reason;
  const levelText = Number.isInteger(level) ? `第 ${level} 层` : "某一层";
  if (reason === "wrong") return `${levelText}答错`;
  if (reason === "no-question") return `${levelText}没题，未测`;
  return `${levelText}没作答`;
}

function describeStop(stoppedAt: { level: Level; reason: StopReason } | null, labels: LevelLabels) {
  if (!stoppedAt) return "能测的层全部答对";
  const name = labels[stoppedAt.level] ?? `L${stoppedAt.level}`;
  if (stoppedAt.reason === "wrong") return `${name} 答错，这层没过`;
  if (stoppedAt.reason === "no-question") return `${name} 没有可判分的题，未测`;
  return `${name} 没作答`;
}

/**
 * 诊断入口。
 *
 * 这里必须把「这次测不到什么」写在开始之前，而不是等结果出来才解释。
 * 中项题库的 L5 全是实操题（无对错），诊断卷抽不出可判分的题——
 * 所以结论最高只到 L4。开始前先说，做完才不会觉得被骗。
 */
export function DiagnosticEntry({
  questionCount,
  moduleCount,
  untestableLevels,
  lastDiagnostic,
  levelLabels,
  isStarting,
  onStart,
}: {
  questionCount: number;
  moduleCount: number;
  /** 抽不出可判分题的层号（去重），通常是 L5 */
  untestableLevels: number[];
  lastDiagnostic: ReturnType<typeof readStoredDiagnostic>;
  levelLabels: LevelLabels;
  isStarting: boolean;
  onStart: () => void;
}) {
  const untestableText =
    untestableLevels.length > 0
      ? untestableLevels.map((level) => levelLabels[level as Level] ?? `L${level}`).join("、")
      : "";

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">能力诊断</h2>
        {lastDiagnostic ? (
          <span className="text-xs text-slate-400">
            上次 {lastDiagnostic.takenAt.slice(0, 10)}
          </span>
        ) : null}
      </div>

      {lastDiagnostic ? (
        <div className="mt-3">
          <p className="text-sm font-medium text-slate-800">{lastDiagnostic.headline}</p>
          <ul className="mt-2 space-y-1">
            {lastDiagnostic.modules.map((module) => (
              <li key={module.moduleName} className="flex flex-wrap gap-x-2 text-xs">
                <span className="font-medium text-slate-600">{module.moduleName}</span>
                {/* reached 为 0 时不再写「连续通过 0 层」——那句话既别扭又不准：
                    真实含义是「第 1 层就没过」，后半句已经说了，别重复。 */}
                <span className="text-slate-400">
                  {module.reached > 0
                    ? `连续通过 ${module.reached} 层 · ${module.stopped}`
                    : module.stopped}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-sm leading-6 text-slate-600">
          还没做过诊断。{moduleCount} 个模块按能力层级各抽题，答完能判出每块
          <strong className="font-semibold text-slate-700">卡在哪一层</strong>
          ，知道该从哪一层往上练。六块里最薄的那块先动。
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={questionCount === 0 || isStarting}
          onClick={onStart}
          type="button"
        >
          {isStarting ? "组卷中…" : lastDiagnostic ? "重新诊断" : "开始诊断"}
        </button>
        <span className="text-xs text-slate-500">
          {questionCount > 0
            ? `${questionCount} 道题，一次做完，约 ${Math.max(5, Math.round(questionCount * 1.2))} 分钟`
            : "题库里抽不出可判分的题"}
        </span>
      </div>

      {untestableText ? (
        <p className="mt-2 text-xs leading-5 text-slate-400">
          {untestableText} 这几层只有实操题（没有标准答案），这次测不到——
          诊断结论只覆盖有可判分题的层，没测的层不会当成「不会」。
        </p>
      ) : null}
    </section>
  );
}

/**
 * 本次诊断结果。
 *
 * 两件事刻意分开摆：**规则判的层级**（可复算，不能改）与 **模型的归因**（可改，人说了算）。
 * 混在一起摆会让人以为层级也是模型给的，那样他改文案时会以为自己改动了结论。
 */
export function DiagnosticReport({
  inference,
  advice,
  adviceError,
  isLoadingAdvice,
  levelLabels,
  isSaving,
  saved,
  saveError,
  onRetryAdvice,
  onSave,
  onDiscard,
}: {
  inference: DiagnosticInference;
  advice: DiagnosticAdvice | null;
  adviceError: string | null;
  isLoadingAdvice: boolean;
  levelLabels: LevelLabels;
  isSaving: boolean;
  saved: boolean;
  saveError: string | null;
  onRetryAdvice: () => void;
  onSave: (edited: DiagnosticAdvice | null) => void;
  onDiscard: () => void;
}) {
  // 归因可编辑：模型说错的地方人要能当场改掉。用受控草稿，保存时以草稿为准。
  //
  // 草稿只从 props 初始化一次——父组件在每次拿到新归因时换 key 重挂本组件，
  // 所以不需要在渲染里同步 props 到 state（那种写法容易死循环，也很难读）。
  const [draft, setDraft] = useState<DiagnosticAdvice | null>(advice);

  function patchModule(moduleId: string, patch: Partial<DiagnosticAdvice["modules"][number]>) {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        modules: prev.modules.map((module) =>
          module.moduleId === moduleId ? { ...module, ...patch } : module,
        ),
      };
    });
  }

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">诊断结果</h2>
        <span className="text-xs text-slate-400">
          答了 {inference.answered}/{inference.total} 题
          {inference.repeatedCount > 0 ? ` · ${inference.repeatedCount} 题以前做过` : ""}
          {inference.gapCount > 0 ? ` · ${inference.gapCount} 个格子没题` : ""}
        </span>
      </div>

      <p className="mt-2 text-sm font-medium text-slate-800">{inference.headline}</p>

      {inference.repeatedCount > 0 ? (
        <p className="mt-1 text-xs leading-5 text-amber-700">
          有 {inference.repeatedCount} 道题你以前做过，结论可能偏高。想更准就隔一段时间重测。
        </p>
      ) : null}

      {/* 规则判的层级：这部分不可编辑，也不来自模型 */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="py-2 pr-3 text-left font-medium text-slate-500">内容模块</th>
              <th className="px-2 py-2 text-left font-medium text-slate-500">连续通过</th>
              <th className="px-2 py-2 text-left font-medium text-slate-500">卡在哪</th>
            </tr>
          </thead>
          <tbody>
            {inference.modules.map((module) => (
              <tr key={module.moduleId} className="border-b border-slate-100">
                <td className="py-2 pr-3 text-slate-800">{module.moduleName}</td>
                <td className="px-2 py-2 tabular-nums text-slate-700">
                  {module.reached === 0 ? "—" : `${module.reached} 层`}
                  {module.reached > 0 ? (
                    <span className="ml-1 text-xs text-slate-400">
                      {levelLabels[module.reached as Level]}
                    </span>
                  ) : null}
                </td>
                <td className="px-2 py-2 text-xs text-slate-500">
                  {describeStop(module.stoppedAt, levelLabels)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 模型的归因：可改 */}
      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">归因与下一步</h3>
          <span className="text-xs text-slate-400">这段是 AI 写的，可以改，改了以你为准</span>
        </div>

        {isLoadingAdvice ? (
          <p className="mt-2 text-sm text-slate-500">正在分析错题…</p>
        ) : adviceError ? (
          <div className="mt-2">
            <p className="text-sm text-amber-700">
              归因没生成出来：{adviceError}
            </p>
            <div className="mt-2 flex gap-3">
              <button
                className="text-sm font-medium text-blue-600 hover:underline"
                onClick={onRetryAdvice}
                type="button"
              >
                再试一次
              </button>
              <button
                className="text-sm font-medium text-slate-500 hover:underline"
                onClick={() => onSave(null)}
                type="button"
              >
                不要归因，只存层级结论
              </button>
            </div>
          </div>
        ) : draft ? (
          <div className="mt-2 space-y-4">
            {draft.summary ? (
              <label className="block">
                <span className="text-xs font-medium text-slate-500">总的看</span>
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none"
                  onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
                  rows={2}
                  value={draft.summary}
                />
              </label>
            ) : null}

            {draft.modules.map((module) => {
              const verdict = inference.modules.find((item) => item.moduleId === module.moduleId);
              return (
                <div key={module.moduleId} className="rounded-lg bg-slate-50 p-3">
                  <p className="text-sm font-medium text-slate-700">
                    {verdict?.moduleName ?? module.moduleId}
                  </p>

                  <label className="mt-2 block">
                    <span className="text-xs font-medium text-slate-500">卡在哪</span>
                    <input
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-blue-400 focus:outline-none"
                      onChange={(event) => patchModule(module.moduleId, { stuck: event.target.value })}
                      value={module.stuck}
                    />
                  </label>

                  <label className="mt-2 block">
                    <span className="text-xs font-medium text-slate-500">
                      缺的知识点（逗号分隔）
                    </span>
                    <input
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-blue-400 focus:outline-none"
                      onChange={(event) =>
                        patchModule(module.moduleId, {
                          missing: event.target.value
                            .split(/[,，、]/)
                            .map((item) => item.trim())
                            .filter(Boolean),
                        })
                      }
                      value={module.missing.join("、")}
                    />
                  </label>

                  <label className="mt-2 block">
                    <span className="text-xs font-medium text-slate-500">下一步（一行一条）</span>
                    <textarea
                      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-blue-400 focus:outline-none"
                      onChange={(event) =>
                        patchModule(module.moduleId, {
                          next: event.target.value
                            .split("\n")
                            .map((item) => item.trim())
                            .filter(Boolean),
                        })
                      }
                      rows={Math.max(2, module.next.length)}
                      value={module.next.join("\n")}
                    />
                  </label>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">没有需要归因的模块（可能整卷都答对了）。</p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
        <button
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={isSaving || saved}
          onClick={() => onSave(draft)}
          type="button"
        >
          {saved ? "已保存" : isSaving ? "保存中…" : "保存这次诊断"}
        </button>
        <button
          className="text-sm font-medium text-slate-500 hover:underline"
          onClick={onDiscard}
          type="button"
        >
          {saved ? "返回" : "不保存，返回"}
        </button>
        {saveError ? (
          <span className="text-xs text-red-600">保存失败：{saveError}</span>
        ) : (
          // 这里**不能写**「保存后今日计划会按这次判出的层级排题」——在 M4 里这句是假的。
          // 今日计划仍按练习覆盖算，诊断结论还没有接进排题逻辑（那是下一步的事）。
          // 文案只承诺已经做到的事：结论能存下来、下次打开还能看到。
          <span className="text-xs text-slate-400">
            保存后这份结论会留在目标页，下次打开还能看到
          </span>
        )}
      </div>
    </section>
  );
}
