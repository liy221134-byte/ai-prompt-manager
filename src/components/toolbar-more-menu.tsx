"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type ToolbarMenuItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  onSelect: () => void;
};

type ToolbarMoreMenuProps = {
  items: ToolbarMenuItem[];
  label?: string;
};

// 主按钮区的收纳入口：低频操作放进「更多」，避免一屏挤十几个按钮。
export function ToolbarMoreMenu({
  items,
  label = "更多",
}: ToolbarMoreMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#dbe7f5] bg-white px-5 text-sm font-semibold text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-700"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <ChevronDown aria-hidden="true" className="size-4" />
        {label}
      </button>

      {isOpen && (
        <div
          className="absolute right-0 z-30 mt-2 flex w-60 flex-col rounded-lg border border-[#dbe7f5] bg-white p-1.5 shadow-[0_16px_36px_rgba(15,23,42,0.16)]"
          role="menu"
        >
          {items.map((item) => (
            <button
              className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:text-slate-300"
              disabled={item.disabled}
              key={item.key}
              onClick={() => {
                setIsOpen(false);
                item.onSelect();
              }}
              role="menuitem"
              type="button"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
