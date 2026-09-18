"use client";

import {
  BookOpenText,
  LoaderCircle,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

import { PromptLibrary } from "@/components/prompt-library";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function CloudAuthGate() {
  const clientRef = useRef<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | undefined;

    const initializationTimer = window.setTimeout(() => {
      try {
        const supabase = getSupabaseBrowserClient();
        clientRef.current = supabase;

        void supabase.auth.getSession().then(({ data }) => {
          setSession(data.session);
          setIsLoading(false);
        });

        const authState = supabase.auth.onAuthStateChange(
          (_event, nextSession) => {
            setSession(nextSession);
            setIsLoading(false);
          },
        );

        subscription = authState.data.subscription;
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
      subscription?.unsubscribe();
    };
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const client = clientRef.current;

    if (!client || !email.trim()) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setMessage(null);

    const { error } = await client.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setErrorMessage("登录链接发送失败，请稍后重试。");
    } else {
      setMessage("登录链接已发送，请检查邮箱。");
    }

    setIsSubmitting(false);
  }

  async function handleSignOut() {
    const client = clientRef.current;

    if (!client) {
      return;
    }

    await client.auth.signOut();
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

  if (session?.user) {
    return (
      <PromptLibrary
        dataMode="supabase"
        onSignOut={handleSignOut}
        userEmail={session.user.email}
      />
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
          使用邮箱接收一次性登录链接，不需要设置和记忆密码。
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

          {message && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
              <ShieldCheck
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
            disabled={isSubmitting || isLoading}
            type="submit"
          >
            {isSubmitting && (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin"
              />
            )}
            {isSubmitting ? "正在发送" : "发送登录链接"}
          </button>
        </form>

        <p className="mt-5 text-xs leading-5 text-slate-400">
          登录后只有你的账户能够读取和修改这些提示词。
        </p>
      </section>
    </main>
  );
}
