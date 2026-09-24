"use client";

import {
  AlertTriangle,
  ClipboardCopy,
  Download,
  FileCode2,
  LoaderCircle,
  Save,
  X,
} from "lucide-react";
import { useState } from "react";

import type { RuleAssetData } from "@/data/assets";
import type { TemplateAssetData } from "@/data/assets";
import { ruleConfidenceLabels } from "@/lib/asset-list";
import { downloadCompiledDraft } from "@/lib/backup-download";
import type {
  CompileCandidates,
  CompiledDraft,
  ConflictCandidate,
} from "@/lib/rule-compile";
import { useModalBehavior } from "@/hooks/use-modal-behavior";

type RuleCompileDrawerProps = {
  projectName: string;
  candidates: CompileCandidates;
  conflicts: ConflictCandidate[];
  drafts: { agents: CompiledDraft; startPrompt: CompiledDraft };
  templates: TemplateAssetData[];
  selectedTemplateId: string;
  pendingVariables: string[];
  rulesAppended: boolean;
  packTitles: Record<string, string>;
  isBusy: boolean;
  onSelectTemplate: (templateId: string) => void;
  onExcludeRule: (rule: RuleAssetData, note: string) => Promise<void>;
  onIncludeRule: (rule: RuleAssetData) => Promise<void>;
  onSaveDraft: (draft: CompiledDraft) => Promise<void>;
  onClose: () => void;
  onNotify: (message: string) => void;
};

type DraftTab = "agents" | "start_prompt";

export function RuleCompileDrawer({
  projectName,
  candidates,
  conflicts,
  drafts,
  templates,
  selectedTemplateId,
  pendingVariables,
  rulesAppended,
  packTitles,
  isBusy,
  onSelectTemplate,
  onExcludeRule,
  onIncludeRule,
  onSaveDraft,
  onClose,
  onNotify,
}: RuleCompileDrawerProps) {
  const [activeTab, setActiveTab] = useState<DraftTab>("agents");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useModalBehavior(onClose);

  const draft = activeTab === "agents" ? drafts.agents : drafts.startPrompt;
  const isLocked = isBusy || busyKey !== null;

  async function runAction(key: string, action: () => Promise<void>) {
    setBusyKey(key);

    try {
      await action();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(draft.content);
      onNotify(`已复制 ${draft.fileName}`);
    } catch {
      onNotify("复制失败，请手动选中内容复制");
    }
  }

  return (
    // 外层固定覆盖层不能省：只写内层 absolute 会相对页面原点定位，页面一滚动浮层就跑到可视区外
    <div className="fixed inset-0 z-50">
      <button
        aria-label="关闭规则编译"
        className="absolute inset-0 cursor-default bg-slate-950/35 backdrop-blur-[2px]"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-labelledby="rule-compile-title"
        aria-modal="true"
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl sm:max-w-3xl"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
              <FileCode2 aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">规则编译</p>
              <h2
                className="mt-1 break-words text-lg font-semibold text-slate-950"
                id="rule-compile-title"
              >
                {projectName}
              </h2>
            </div>
          </div>

          <button
            aria-label="关闭规则编译"
            className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            {[
              `参与编译：${candidates.included.length} 条`,
              `已排除：${candidates.excluded.length} 条`,
              `冲突候选：${conflicts.length} 对`,
            ].map((item) => (
              <span
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                key={item}
              >
                {item}
              </span>
            ))}
          </div>

          {conflicts.length > 0 && (
            <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <AlertTriangle aria-hidden="true" className="size-4" />
                可能打架的规则（{conflicts.length} 对）
              </h3>
              <p className="mt-1 text-xs leading-5 text-amber-900/80">
                这里只按作用范围、作用层级和技术上下文把规则摆到一起，不自动判定对错。
                确认哪条不该参与编译，就把它排除。
              </p>
              <ul className="mt-3 flex flex-col gap-3">
                {conflicts.map((conflict) => (
                  <li
                    className="rounded-lg border border-amber-200 bg-white px-3 py-2"
                    key={`${conflict.left.id}-${conflict.right.id}`}
                  >
                    <p className="text-sm font-medium text-slate-800">
                      {conflict.left.title}
                      <span className="mx-1 text-slate-400">×</span>
                      {conflict.right.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      重叠在：{conflict.sharedDimensions.join("、")}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[conflict.left, conflict.right].map((rule) => (
                        <button
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition-colors hover:border-rose-300 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={isLocked}
                          key={rule.id}
                          onClick={() => {
                            void runAction(`conflict-${rule.id}`, () =>
                              onExcludeRule(rule, "冲突裁决：不参与本次编译"),
                            );
                          }}
                          type="button"
                        >
                          排除「{rule.title}」
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-5 rounded-xl border border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-700">
              参与编译的规则
            </h3>
            {candidates.included.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                这个项目还没有可以参与编译的活跃规则。
              </p>
            ) : (
              candidates.groups.map((group) => (
                <div className="mt-3" key={group.level}>
                  <p className="text-xs font-semibold text-slate-500">
                    {group.label}
                  </p>
                  <ul className="mt-1 flex flex-col divide-y divide-slate-100">
                    {group.rules.map((rule) => (
                      <li className="flex items-start gap-3 py-2" key={rule.id}>
                        <input
                          aria-label={`让「${rule.title}」参与编译`}
                          checked
                          className="mt-1 size-4 accent-indigo-600"
                          disabled={isLocked}
                          id={`compile-rule-${rule.id}`}
                          onChange={() => {
                            void runAction(`rule-${rule.id}`, () =>
                              onExcludeRule(rule, "在编译面板里排除"),
                            );
                          }}
                          type="checkbox"
                        />
                        <label
                          className="min-w-0 flex-1 cursor-pointer"
                          htmlFor={`compile-rule-${rule.id}`}
                        >
                          <span className="block text-sm font-medium text-slate-800">
                            {rule.title}
                          </span>
                          <span className="mt-0.5 block text-xs text-slate-500">
                            {[
                              rule.metadata.confidence
                                ? `可信度：${ruleConfidenceLabels[rule.metadata.confidence]}`
                                : "",
                              rule.metadata.pack
                                ? `来源：${packTitles[rule.metadata.pack.packId] ?? "规则包"}`
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}

            {candidates.excluded.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="text-xs font-semibold text-slate-500">
                  已排除（{candidates.excluded.length} 条）
                </p>
                <ul className="mt-1 flex flex-col gap-1">
                  {candidates.excluded.map((item) => (
                    <li
                      className="flex items-center justify-between gap-3 text-xs text-slate-500"
                      key={item.rule.id}
                    >
                      <span className="min-w-0 truncate">
                        {item.rule.title} —— {item.reason}
                      </span>
                      {item.reason === "你已裁决不参与编译" && (
                        <button
                          className="shrink-0 font-semibold text-indigo-700 hover:underline disabled:opacity-50"
                          disabled={isLocked}
                          onClick={() => {
                            void runAction(`restore-${item.rule.id}`, () =>
                              onIncludeRule(item.rule),
                            );
                          }}
                          type="button"
                        >
                          恢复参与
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="mt-5 rounded-xl border border-slate-200 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-700">产物模板</h3>
              <label className="flex items-center gap-2 text-xs text-slate-500">
                模板
                <select
                  aria-label="选择产物模板"
                  className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-900 outline-none"
                  onChange={(event) => onSelectTemplate(event.target.value)}
                  value={selectedTemplateId}
                >
                  <option value="">内置结构</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.title}
                      {template.metadata.outputFileName
                        ? `（${template.metadata.outputFileName}）`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              选模板后，主产物按模板结构生成：项目名、项目说明和技术栈自动填，
              <code className="mx-1 rounded bg-slate-100 px-1">{"{{规则集}}"}</code>
              位置插入规则段落；START_PROMPT.md 保持内置结构。
            </p>
            {rulesAppended && (
              <p className="mt-2 text-xs leading-5 text-amber-700">
                模板里没有 <code className="rounded bg-amber-100 px-1">{"{{规则集}}"}</code>
                占位符，规则段落已追加到产物末尾。
              </p>
            )}
            {pendingVariables.length > 0 && (
              <p className="mt-2 text-xs leading-5 text-slate-600">
                还要你填的变量：{pendingVariables.join("、")}
              </p>
            )}
          </section>

          <section className="mt-5 rounded-xl border border-slate-200 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {(["agents", "start_prompt"] as DraftTab[]).map((tab) => (
                  <button
                    aria-pressed={activeTab === tab}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                      activeTab === tab
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    type="button"
                  >
                    {tab === "agents"
                      ? `${drafts.agents.fileName}（${drafts.agents.ruleCount}）`
                      : `START_PROMPT.md（${drafts.startPrompt.ruleCount}）`}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  onClick={() => void handleCopy()}
                  type="button"
                >
                  <ClipboardCopy aria-hidden="true" className="size-4" />
                  复制
                </button>
                <button
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isLocked}
                  onClick={() => {
                    void runAction(`save-${draft.target}`, () =>
                      onSaveDraft(draft),
                    );
                  }}
                  type="button"
                >
                  {busyKey === `save-${draft.target}` ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                  ) : (
                    <Save aria-hidden="true" className="size-4" />
                  )}
                  保存成文档资产
                </button>
                <button
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  onClick={() => {
                    downloadCompiledDraft(draft);
                    onNotify(`已下载 ${draft.fileName}`);
                  }}
                  type="button"
                >
                  <Download aria-hidden="true" className="size-4" />
                  下载
                </button>
              </div>
            </div>

            <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-slate-950/95 px-4 py-3 text-xs leading-6 text-slate-100">
              {draft.content}
            </pre>
          </section>
        </div>
      </aside>
    </div>
  );
}
