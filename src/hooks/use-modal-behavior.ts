"use client";

import { useEffect } from "react";

export function useModalBehavior(
  onClose: () => void,
  disabled = false,
) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    if (disabled) {
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [disabled, onClose]);
}
