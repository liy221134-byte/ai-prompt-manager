"use client";

import {
  ArrowRight,
  LoaderCircle,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { FormEvent, useState } from "react";

import type { PromptDraft } from "@/data/prompts";
import { useModalBehavior } from "@/hooks/use-modal-behavior";

type AiCaptureDrawerProps = {
  onClose: () => void;
  onRecognized: (draft: PromptDraft) => void;
};

type ExtractionResponse = {
  draft?: PromptDraft;
  error?: string;
};

export function AiCaptureDrawer({
  onClose,
  onRecognized,
}: AiCaptureDrawerProps) {
  const [rawText, setRawText] = useState("");
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useModalBehavior(onClose);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (rawText.trim().length < 10) {
      return;
    }

    setIsRecognizing(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/ai/extract-prompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rawText }),
      });
      const responseBody = (await response.json()) as ExtractionResponse;

      if (!response.ok || !responseBody.draft) {
        throw new Error(
          responseBody.error ?? "AI 识别失败，请稍后重试。",
        );
      }

      onRecognized(responseBody.draft);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "AI 识别失败，请稍后重试。",
      );
    } finally {
      setIsRecognizing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="关闭智能采集"
        className="absolute inset-0 cursor-default bg-slate-950/35 backdrop-blur-[2px]"
        onClick={onClose}
        type="button"
      />

      <aside
        aria-labelledby="ai-capture-title"
        aria-modal="true"
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl sm:max-w-2xl"
        role="dialog"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
              <WandSparkles aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-xs font-semibold text-blue-700">智能采集</p>
              <h2
                className="mt-1 text-lg font-semibold text-slate-950"
                id="ai-capture-title"
              >
                从原始内容生成提示词
              </h2>
            </div>
          </div>

          <button
            aria-label="关闭智能采集"
            className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={handleSubmit}
        >
          <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-6">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                原始提示词
              </span>
              <textarea
                autoFocus
                className="mt-3 min-h-[380px] w-full resize-y rounded-lg border border-slate-300 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                maxLength={30000}
                onChange={(event) => setRawText(event.target.value)}
                placeholder="粘贴聊天记录、笔记或一段口语化提示词"
                value={rawText}
              />
            </label>

            <div className="mt-3 flex items-center justify-between gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <Sparkles aria-hidden="true" className="size-3.5" />
                内容将发送到已配置的 AI 服务进行结构识别。
              </span>
              <span>{rawText.length}/30000</span>
            </div>

            {errorMessage && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
                {errorMessage}
              </p>
            )}
          </div>

          <footer className="flex items-center justify-end gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
            <button
              className="h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isRecognizing}
              onClick={onClose}
              type="button"
            >
              取消
            </button>
            <button
              className="inline-flex h-11 min-w-32 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={isRecognizing || rawText.trim().length < 10}
              type="submit"
            >
              {isRecognizing ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 animate-spin"
                />
              ) : (
                <ArrowRight aria-hidden="true" className="size-4" />
              )}
              {isRecognizing ? "正在识别" : "开始识别"}
            </button>
          </footer>
        </form>
      </aside>
    </div>
  );
}
