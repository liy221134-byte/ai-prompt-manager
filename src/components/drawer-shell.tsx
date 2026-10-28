"use client";

import { useEffect, type ReactNode } from "react";

import { createBodyScrollLock } from "@/lib/body-scroll-lock";

// 抽屉外框：从右侧滑出的整屏覆盖层。
//
// 为什么抽出来：讲义、追问、素材表三个抽屉的外壳是逐字相同的（遮罩 + 面板 + 标题栏
// + 关闭按钮），M6 的知识图谱检查会是第四个。改一次间距要改四份，漏一处就是四套行为。
//
// 为什么只抽外壳：每个抽屉里头差别很大（讲义是 markdown、追问是对话流、素材表是六个
// 输入框），把内容也收进来会变成一堆开关参数——那是把重复换成了耦合。
//
// 滚动锁用 lib/body-scroll-lock 的计数版，不再各自记「打开前的值」：
// 两个抽屉叠着打开时（比如从追问里点开讲义），后关的那个会把「已锁定」当成原始值
// 写回去，页面就再也滚不动，只能刷新。那个模块就是为这件事写的，之前三个抽屉都没用上。

let scrollLock: ReturnType<typeof createBodyScrollLock> | null = null;

function lockCounted() {
  if (typeof document === "undefined") return null;
  // 计数必须全局共用一把：每次抽屉各造一把，等于又退回「各记各的」
  scrollLock ??= createBodyScrollLock(document.body);
  return scrollLock;
}

export function DrawerShell({
  title,
  subtitle,
  onClose,
  widthClassName = "max-w-2xl",
  children,
}: {
  title: ReactNode;
  /** 标题下的一行小字。没有就不占位 */
  subtitle?: ReactNode;
  onClose: () => void;
  /** 面板宽度。素材表那种六段长表单要宽一点 */
  widthClassName?: string;
  children: ReactNode;
}) {
  // Esc 关闭。挂在 window 上而不是容器上：抽屉打开时焦点未必在容器里，
  // 挂在容器上会出现「按了 Esc 没反应」。
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // 抽屉打开时锁住背景滚动，否则滚轮会带着下面的矩阵一起动
  useEffect(() => {
    const lock = lockCounted();
    lock?.lock();
    return () => lock?.unlock();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" onClick={onClose}>
      <div
        className={`flex h-full w-full ${widthClassName} flex-col border-l border-slate-200 bg-white shadow-xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p> : null}
          </div>
          <button
            className="shrink-0 rounded px-2 py-1 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            onClick={onClose}
            type="button"
          >
            关闭
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
