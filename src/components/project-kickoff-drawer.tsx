"use client";

import { ClipboardCopy, Download, FileDown, Rocket, X } from "lucide-react";
import { useState } from "react";

import { useModalBehavior } from "@/hooks/use-modal-behavior";
import type { KickoffPrompt } from "@/lib/project-kickoff";

type ProjectKickoffDrawerProps = {
  projectName: string;
  prompts: KickoffPrompt[];
  packFileName: string;
  packFileCount: number;
  onCopyPrompt: (prompt: KickoffPrompt) => Promise<void>;
  onDownloadPack: () => void;
  onSavePackAsDocument: () => Promise<void>;
  onClose: () => void;
};

// 立项与交付：上半是四条立项提示词（复制给 AI 用），下半是导出开发体系包。
export function ProjectKickoffDrawer({
  projectName,
  prompts,
  packFileName,
  packFileCount,
  onCopyPrompt,
  onDownloadPack,
  onSavePackAsDocument,
  onClose,
}: ProjectKickoffDrawerProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useModalBehavior(isSaving ? () => undefined : onClose, isSaving);

  return (
    // 外层固定覆盖层不能省：只写内层 absolute 会相对页面原点定位，页面一滚动浮层就跑到可视区外
    <div className="fixed inset-0 z-50">
      <button
        aria-label="关闭立项与交付"
        className="absolute inset-0 cursor-default bg-slate-950/35 backdrop-blur-[2px]"
        onClick={isSaving ? undefined : onClose}
        type="button"
      />

      <aside
        aria-labelledby="project-kickoff-title"
        aria-modal="true"
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl sm:max-w-3xl"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
              <Rocket aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-xs text-slate-500">项目：{projectName}</p>
              <h2
                className="mt-1 text-lg font-semibold text-slate-950"
                id="project-kickoff-title"
              >
                立项与交付
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                上半：把立项该产出的四份东西交给 AI；下半：把项目现在的规则、文档、模板
                打成一个文件交出去。
              </p>
            </div>
          </div>

          <button
            aria-label="关闭立项与交付"
            className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <section className="rounded-xl border border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-700">
              一、立项提示词（复制给 AI）
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              每条都带上项目名、项目说明、质量等级和技术栈。贴给任意 AI，
              产出的内容再按对应类型存回项目。
            </p>

            <ul className="mt-3 flex flex-col divide-y divide-slate-100">
              {prompts.map((prompt) => (
                <li className="flex items-start gap-3 py-2.5" key={prompt.key}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">
                      {prompt.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500">
                      {prompt.hint}
                    </p>
                  </div>
                  <button
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 transition-colors hover:border-sky-300 hover:bg-sky-100"
                    onClick={() => {
                      void onCopyPrompt(prompt).then(() =>
                        setCopiedKey(prompt.key),
                      );
                    }}
                    type="button"
                  >
                    <ClipboardCopy aria-hidden="true" className="size-3.5" />
                    {copiedKey === prompt.key ? "已复制" : "复制"}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-5 rounded-xl border border-slate-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-700">
              二、导出开发体系包
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              把项目当前生效的 {packFileCount} 条内容按「规则 → 文档 → 模板」拼成一个
              Markdown 文件（<span className="font-mono">{packFileName}</span>），
              交给协作者或贴进新仓库时一次说清。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-sky-700"
                onClick={onDownloadPack}
                type="button"
              >
                <Download aria-hidden="true" className="size-4" />
                下载开发体系包
              </button>
              <button
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSaving}
                onClick={() => {
                  setIsSaving(true);
                  void onSavePackAsDocument().finally(() => setIsSaving(false));
                }}
                type="button"
              >
                <FileDown aria-hidden="true" className="size-4" />
                存成项目里的一份文档
              </button>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
