"use client";

import { Check, Copy, X } from "lucide-react";
import { useRef, useState } from "react";

import { collectionEcosystems } from "@/data/assets";
import { buildCollectionTaskPrompt } from "@/lib/external-sources-ledger";

// 采集任务单生成器（线索 3 M2.1 T13）。
//
// 产品不联网，也不应该联网——这里只把用户填的「目标来源 + 生态 + 关注点」
// 参数化成一段可复制的话术，交给 WorkBuddy / Codex 执行。
// 模板源自 seed-packs/external-sources/README.md 第五节采集作业 SOP。

const inputClassName =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition-colors focus:border-blue-400";
const labelClassName = "text-xs font-semibold text-slate-600";

type CollectionTaskDialogProps = {
  onClose: () => void;
};

export function CollectionTaskDialog({ onClose }: CollectionTaskDialogProps) {
  const [sourceUrl, setSourceUrl] = useState("");
  const [ecosystem, setEcosystem] = useState("");
  const [focus, setFocus] = useState("");
  const [prompt, setPrompt] = useState("");
  const [hasCopied, setHasCopied] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  function handleGenerate() {
    if (!sourceUrl.trim()) {
      return;
    }

    setPrompt(
      buildCollectionTaskPrompt({
        sourceUrl,
        ecosystem: ecosystem || undefined,
        focus: focus || undefined,
      }),
    );
    setHasCopied(false);
  }

  async function handleCopy() {
    if (!prompt) {
      return;
    }

    // 先走异步剪贴板 API（HTTPS / localhost 可用）；
    // 它被拒时（非安全上下文、无权限）退回选中文本 + execCommand，
    // 这样按钮状态在两种环境下都如实反映是否复制成功。
    try {
      await navigator.clipboard.writeText(prompt);
      setHasCopied(true);
      return;
    } catch {
      // 落到下面的兜底
    }

    const node = promptRef.current;

    if (node) {
      node.focus();
      node.select();

      if (document.execCommand("copy")) {
        setHasCopied(true);
      }
    }
  }

  const canGenerate = sourceUrl.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        aria-label="关闭采集任务单"
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
        type="button"
      />
      <div
        aria-labelledby="collection-task-title"
        aria-modal="true"
        className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        role="dialog"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2
            className="text-base font-semibold text-slate-900"
            id="collection-task-title"
          >
            生成采集任务单
          </h2>
          <button
            aria-label="关闭采集任务单"
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-sm leading-6 text-slate-600">
            填下目标来源和关注点，产品生成一段可复制的话术，交给智能体执行采集。
            <strong className="font-semibold text-slate-800">
              产品本身不联网搜索
            </strong>
            ，只是帮你把 README 第五节那份 SOP 参数化。
            智能体交回 .md / .zip 产出件后，回到台账点
            <strong className="font-semibold text-slate-800">「给压缩包」</strong>
            导入，台账会自动多一行采集记录，候选资产落在公共库等你确认。
          </p>

          <div className="mt-4 flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className={labelClassName}>
                目标来源（仓库地址 / 官方页 / 名称）<span className="text-rose-500">*</span>
              </span>
              <input
                className={inputClassName}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="例：https://github.com/anthropics/skills"
                type="text"
                value={sourceUrl}
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className={labelClassName}>生态</span>
              <select
                className={inputClassName}
                onChange={(event) => setEcosystem(event.target.value)}
                value={ecosystem}
              >
                <option value="">不选</option>
                {collectionEcosystems.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2">
              <span className={labelClassName}>关注点（可选）</span>
              <textarea
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-blue-400"
                onChange={(event) => setFocus(event.target.value)}
                placeholder="例：重点提炼设计规范类规则，不要安装相关的"
                rows={2}
                value={focus}
              />
            </label>
          </div>

          {prompt && (
            <div className="mt-5">
              <span className={labelClassName}>话术（复制后交给智能体）</span>
              <textarea
                className="mt-2 h-64 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs leading-5 text-slate-800 outline-none"
                readOnly
                ref={promptRef}
                value={prompt}
              />
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-4">
          <button
            className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            关闭
          </button>
          {prompt && (
            <button
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100"
              onClick={() => void handleCopy()}
              type="button"
            >
              {hasCopied ? (
                <>
                  <Check aria-hidden="true" className="size-4 text-emerald-600" />
                  已复制
                </>
              ) : (
                <>
                  <Copy aria-hidden="true" className="size-4" />
                  复制话术
                </>
              )}
            </button>
          )}
          <button
            className="inline-flex h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-slate-300"
            disabled={!canGenerate}
            onClick={handleGenerate}
            type="button"
          >
            {prompt ? "重新生成" : "生成话术"}
          </button>
        </footer>
      </div>
    </div>
  );
}
