"use client";

import { useEffect } from "react";

import { createBodyScrollLock } from "@/lib/body-scroll-lock";

type BodyScrollLock = ReturnType<typeof createBodyScrollLock>;

// 整个页面共用一把滚动锁。只能在使用时创建，因为服务端渲染阶段没有 document。
let sharedScrollLock: BodyScrollLock | null = null;

function getSharedScrollLock() {
  if (!sharedScrollLock) {
    sharedScrollLock = createBodyScrollLock(document.body);
  }

  return sharedScrollLock;
}

export function useModalBehavior(
  onClose: () => void,
  disabled = false,
) {
  useEffect(() => {
    const scrollLock = getSharedScrollLock();

    scrollLock.lock();

    if (disabled) {
      return () => {
        scrollLock.unlock();
      };
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      scrollLock.unlock();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [disabled, onClose]);
}