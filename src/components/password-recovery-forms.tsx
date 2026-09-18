"use client";

import {
  BookOpenText,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

function AuthShell({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef6ff] px-5 py-12">
      <section className="w-full max-w-md rounded-lg border border-[#dbe7f5] bg-white p-7 shadow-[0_18px_50px_rgba(30,64,175,0.12)] sm:p-8">
        <span className="flex size-12 items-center justify-center rounded-lg bg-blue-600 text-white">
          <BookOpenText aria-hidden="true" className="size-6" />
        </span>
        <p className="mt-6 text-sm font-semibold text-blue-700">
          云端提示词资产库
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">{description}</p>
        {children}
      </section>
    </main>
  );
}

export function RequestPasswordResetForm() {
  const clientRef = useRef<SupabaseClient | null>(null);
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        clientRef.current = getSupabaseBrowserClient();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "云端服务无法启动。",
        );
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = clientRef.current;

    if (!client || !email.trim()) {
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    setErrorMessage(null);

    const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/update-password`,
    });

    if (error) {
      setErrorMessage(
        error.message.toLowerCase().includes("rate limit")
          ? "邮件发送过于频繁，请等待一小时后再试。"
          : "重置邮件发送失败，请稍后重试。",
      );
    } else {
      setMessage("重置链接已发送，请检查邮箱。");
    }

    setIsSubmitting(false);
  }

  return (
    <AuthShell
      description="输入登录邮箱，收到链接后可以设置新密码。"
      title="重置登录密码"
    >
      <form className="mt-7" onSubmit={handleSubmit}>
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

        {message && (
          <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
            {message}
          </p>
        )}

        {errorMessage && (
          <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
            {errorMessage}
          </p>
        )}

        <button
          className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting && (
            <LoaderCircle
              aria-hidden="true"
              className="size-4 animate-spin"
            />
          )}
          {isSubmitting ? "正在发送" : "发送重置链接"}
        </button>
      </form>

      <Link
        className="mt-5 block text-center text-sm font-medium text-blue-700 hover:text-blue-900"
        href="/"
      >
        返回登录
      </Link>
    </AuthShell>
  );
}

export function UpdatePasswordForm() {
  const router = useRouter();
  const clientRef = useRef<SupabaseClient | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const client = getSupabaseBrowserClient();
        clientRef.current = client;

        void client.auth.getSession().then(({ data }) => {
          if (!data.session) {
            setErrorMessage("密码重置链接无效或已经过期。");
          }

          setIsSessionLoading(false);
        });
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "云端服务无法启动。",
        );
        setIsSessionLoading(false);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = clientRef.current;

    if (!client) {
      return;
    }

    if (password.length < 8) {
      setErrorMessage("密码至少需要 8 个字符。");
      return;
    }

    if (password !== confirmation) {
      setErrorMessage("两次输入的密码不一致。");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setMessage(null);

    const { error } = await client.auth.updateUser({ password });

    if (error) {
      setErrorMessage("密码更新失败，请重新发送重置邮件。");
      setIsSubmitting(false);
      return;
    }

    setMessage("密码已更新，正在返回登录页面。");

    window.setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 1200);
  }

  return (
    <AuthShell
      description="设置一个至少 8 个字符的新密码。"
      title="设置新密码"
    >
      {isSessionLoading ? (
        <div className="mt-7 flex items-center gap-2 text-sm text-slate-500">
          <LoaderCircle
            aria-hidden="true"
            className="size-4 animate-spin text-blue-600"
          />
          正在验证重置链接
        </div>
      ) : (
        <form className="mt-7" onSubmit={handleSubmit}>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">新密码</span>
            <div className="relative mt-2">
              <LockKeyhole
                aria-hidden="true"
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              />
              <input
                autoComplete="new-password"
                autoFocus
                className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-11 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                onChange={(event) => setPassword(event.target.value)}
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

          <label className="mt-4 block">
            <span className="text-sm font-medium text-slate-700">
              确认新密码
            </span>
            <div className="relative mt-2">
              <LockKeyhole
                aria-hidden="true"
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              />
              <input
                autoComplete="new-password"
                className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                onChange={(event) => setConfirmation(event.target.value)}
                required
                type={showPassword ? "text" : "password"}
                value={confirmation}
              />
            </div>
          </label>

          {message && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
              <CheckCircle2
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              {message}
            </div>
          )}

          {errorMessage && (
            <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
              {errorMessage}
            </p>
          )}

          <button
            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={isSubmitting || Boolean(errorMessage)}
            type="submit"
          >
            {isSubmitting && (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin"
              />
            )}
            {isSubmitting ? "正在更新" : "更新密码"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
