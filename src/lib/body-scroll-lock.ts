type ScrollLockTarget = {
  style: {
    overflow: string;
  };
};

// 计数式滚动锁：多个弹窗叠加时，只有全部关闭才恢复滚动。
// 旧写法是每个弹窗各自记住「打开前的值」再恢复，弹窗叠加时后关闭的那个会把
// 「已锁定」当成原始值写回去，导致页面再也滚不动，只能刷新。
export function createBodyScrollLock(target: ScrollLockTarget) {
  let lockCount = 0;
  let previousOverflow = "";

  return {
    lock() {
      if (lockCount === 0) {
        previousOverflow = target.style.overflow;
        target.style.overflow = "hidden";
      }

      lockCount += 1;
    },
    unlock() {
      if (lockCount === 0) {
        return;
      }

      lockCount -= 1;

      if (lockCount === 0) {
        target.style.overflow = previousOverflow;
      }
    },
  };
}