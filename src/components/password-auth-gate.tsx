"use client";

import {
  BookOpenText,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSafeNextPath } from "@/lib/auth-routing";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

function getLoginErrorMessage(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("invalid login credentials")) {
    return "邮箱或密码不正确。";
  }

  if (normalizedMessage.includes("email not confirmed")) {
    return "邮箱尚未确认，请先完成邮箱验证。";
  }

  if (
    normalizedMessage.includes("too many") ||
    normalizedMessage.includes("rate limit")
  ) {
    return "登录尝试过于频繁，请稍后再试。";
  }

  return "登录失败，请稍后重试。";
}

type PasswordAuthGateProps = {
  redirectTo?: string;
};

export function PasswordAuthGate({
  redirectTo = "/",
}: PasswordAuthGateProps) {
  const router = useRouter();
  const clientRef = useRef<SupabaseClient | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const initializationTimer = window.setTimeout(() => {
      try {
        clientRef.current = getSupabaseBrowserClient();
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Supabase 登录服务无法启动。",
        );
        setIsLoading(false);
      }
    }, 0);

    return () => {
      window.clearTimeout(initializationTimer);
    };
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const client = clientRef.current;

    if (!client || !email.trim() || !password) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setErrorMessage(getLoginErrorMessage(error.message));
      setIsSubmitting(false);
      return;
    }

    if (data.session) {
      setPassword("");
      router.replace(getSafeNextPath(redirectTo));
      router.refresh();
      return;
    }

    setErrorMessage("登录未完成，请确认邮箱后重试。");
    setIsSubmitting(false);
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef6ff] px-5">
        <div className="flex items-center gap-3 rounded-lg border border-[#dbe7f5] bg-white px-5 py-4 text-sm text-slate-600 shadow-sm">
          <LoaderCircle
            aria-hidden="true"
            className="size-5 animate-spin text-blue-600"
          />
          正在连接云端账户
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef6ff] px-5 py-12">
      <section className="w-full max-w-md rounded-lg border border-[#dbe7f5] bg-white p-7 shadow-[0_18px_50px_rgba(30,64,175,0.12)] sm:p-8">
        <span className="flex size-12 items-center justify-center rounded-lg bg-blue-600 text-white">
          <BookOpenText aria-hidden="true" className="size-6" />
        </span>

        <p className="mt-6 text-sm font-semibold text-blue-700">
          云端提示词资产库
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">
          登录你的个人空间
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          使用你的个人账号访问云端提示词。
        </p>

        <form className="mt-7" onSubmit={handleLogin}>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">邮箱</span>
            <div className="relative mt-2">
              <Mail
                aria-hidden="true"
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              />
              <input
                autoComplete="email"
                autoFocus
                className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                required
                type="email"
                value={email}
              />
            </div>
          </label>

          <label className="mt-4 block">
            <span className="text-sm font-medium text-slate-700">密码</span>
            <div className="relative mt-2">
              <LockKeyhole
                aria-hidden="true"
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              />
              <input
                autoComplete="current-password"
                className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-11 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="输入密码"
                required
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                className="absolute right-2.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setShowPassword((current) => !current)}
                type="button"
              >
                {showPassword ? (
                  <EyeOff aria-hidden="true" className="size-4" />
                ) : (
                  <Eye aria-hidden="true" className="size-4" />
                )}
              </button>
            </div>
          </label>

          {errorMessage && (
            <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
              {errorMessage}
            </p>
          )}

          <button
            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={isSubmitting || isLoading}
            type="submit"
          >
            {isSubmitting && (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin"
              />
            )}
            {isSubmitting ? "正在登录" : "登录"}
          </button>
        </form>
        <div className="mt-5 text-center">
          <a
            className="text-sm font-medium text-blue-700 hover:text-blue-900"
            href="/auth/reset-password"
          >
            忘记密码
          </a>
        </div>

        <p className="mt-5 text-xs leading-5 text-slate-400">
          登录后只有你的账户能够读取和修改这些提示词。
        </p>
      </section>
    </main>
  );
}
