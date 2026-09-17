import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 编程提示词卡片",
  description: "积累、整理和复用高质量 AI 提示词。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-[#eef6ff] text-slate-950 antialiased">
        {children}
      </body>
    </html>
  );
}
