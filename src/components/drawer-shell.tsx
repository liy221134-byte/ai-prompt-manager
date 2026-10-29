"use client";

import { useEffect, type ReactNode } from "react";

import { createBodyScrollLock } from "@/lib/body-scroll-lock";

// 抽屉外框：两种形态。
//
// - panel（默认）：从右侧滑出的侧栏，盖住页面一部分，适合「一边看主页面一边对照」
// - fullscreen：整屏接管，适合「连续读一段长内容」
//
// 为什么两种都要：讲义是长文，侧栏只有 672px 宽、字号又被压小，读十几分钟很费劲；
// 而追问、素材表这类是「填一下就关」的表单，全屏反而让人失去「我在哪一页」的位置感。
// 所以按内容性质选，不统一。
//
// 为什么抽外壳：讲义、追问、素材表、图谱四个抽屉的骨架是同一套（遮罩 + 面板 + 标题栏
// + 关闭 + Esc + 滚动锁），改一次间距要改四份，漏一处就是四套行为。
//
// 滚动锁用 lib/body-scroll-lock 的计数版，不再各自记「打开前的值」：
// 两个抽屉叠着打开时（比如从追问里点开讲义），后关的那个会把「已锁定」当成原始值
// 写回去，页面就再也滚不动，只能刷新。

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
  variant = "panel",
  contentClassName,
  children,
}: {
  title: ReactNode;
  /** 标题下的一行小字。没有就不占位 */
  subtitle?: ReactNode;
  onClose: () => void;
  /** 侧栏宽度。素材表那种六段长表单要宽一点。全屏形态下不生效 */
  widthClassName?: string;
  /** panel = 右侧侧栏；fullscreen = 整屏 */
  variant?: "panel" | "fullscreen";
  /** 全屏形态下正文的宽度约束。默认居中 896px，是为了让中文一行不超过约 42 字 */
  contentClassName?: string;
  children: ReactNode;
}) {
  const isFull = variant === "fullscreen";

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

  // 全屏时没有遮罩可点（点了就关会误触），所以只靠 Esc 与右上角按钮退出。
  // 这也是全屏形态必须有一个「一眼能看见」的关闭按钮的原因。
  return (
    <div
      className={
        isFull ? "fixed inset-0 z-50 bg-white" : "fixed inset-0 z-50 flex justify-end bg-slate-950/30"
      }
      onClick={isFull ? undefined : onClose}
    >
      <div
        className={
          isFull
            ? "flex h-full w-full flex-col bg-white"
            : `flex h-full w-full ${widthClassName} flex-col border-l border-slate-200 bg-white shadow-xl`
        }
        onClick={(event) => event.stopPropagation()}
      >
        <header
          className={
            isFull
              ? "sticky top-0 z-10 border-b border-slate-100 bg-white/95 backdrop-blur"
              : "flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4"
          }
        >
          {/* 全屏时标题栏内部也要套同一层居中容器：否则标题贴左边缘、
              正文居中在中间，两段文字不在一条竖线上，看着是散的。
              宽度用与正文相同的 contentClassName，比例才对得上。 */}
          <div
            className={
              isFull
                ? `mx-auto flex w-full items-start justify-between gap-4 px-6 py-4 ${contentClassName ?? "max-w-4xl"}`
                : "flex items-start justify-between gap-4"
            }
          >
            <div>
              <h2
                className={
                  isFull
                    ? "text-xl font-semibold text-slate-900"
                    : "text-base font-semibold text-slate-900"
                }
              >
                {title}
              </h2>
              {subtitle ? (
                <p
                  className={
                    isFull ? "mt-1 text-sm text-slate-400" : "mt-0.5 text-xs text-slate-400"
                  }
                >
                  {subtitle}
                </p>
              ) : null}
            </div>
            <button
              className={
                isFull
                  ? "shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                  : "shrink-0 rounded px-2 py-1 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              }
              onClick={onClose}
              type="button"
            >
              关闭{isFull ? "（Esc）" : ""}
            </button>
          </div>
        </header>

        <div
          className={
            isFull ? "flex-1 overflow-y-auto px-6 py-8" : "flex-1 overflow-y-auto px-5 py-4"
          }
        >
          {isFull ? (
            <div className={contentClassName ?? "mx-auto w-full max-w-4xl"}>{children}</div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}
