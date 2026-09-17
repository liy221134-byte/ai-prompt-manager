import { BookOpenText, Layers3 } from "lucide-react";

import { PromptCard } from "@/components/prompt-card";
import { promptCards } from "@/data/prompts";

export default function Home() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-[#dbe7f5] bg-white/85">
        <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
              <BookOpenText aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                提示词资产库
              </p>
              <p className="text-xs text-slate-500">个人工作台</p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-[#dbe7f5] bg-white px-3 py-2 text-sm text-slate-600">
            <Layers3 aria-hidden="true" className="size-4 text-blue-600" />
            <span>{promptCards.length} 条提示词</span>
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-[1280px] px-5 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold text-blue-700">
            个人 AI 提示词资产库
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-normal text-slate-950 sm:text-5xl">
            AI 编程提示词卡片
          </h1>
          <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">
            积累每一个好用的提示词
          </p>
        </div>

        <div className="mt-10 grid items-start gap-6 md:grid-cols-2 lg:grid-cols-3">
          {promptCards.map((prompt, index) => (
            <PromptCard index={index} key={prompt.id} prompt={prompt} />
          ))}
        </div>
      </section>
    </main>
  );
}
