"use client";

import { LoaderCircle, PlugZap, X } from "lucide-react";
import { useEffect, useState } from "react";

import { useModalBehavior } from "@/hooks/use-modal-behavior";

type McpSetupState =
  | { kind: "missing" }
  | { kind: "same" }
  | { kind: "different"; current: string };

type McpSetupStatus = {
  configPath: string;
  backupPath: string;
  fileExists: boolean;
  hasBackup: boolean;
  desiredBlock: string;
  state: McpSetupState;
};

type VerifyResult = {
  ok: boolean;
  tools: string[];
  elapsedMs: number;
  exitCode: number | null;
  output: string;
  error?: string;
};

type McpSetupDialogProps = {
  onClose: () => void;
  onNotify: (message: string) => void;
};

const actionButtonClassName =
  "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed";

// 本机 MCP 接入（只支持 Codex）：看状态、接入、撤销、验证。
// 只在本机模式出现——云端在 Vercel 上，碰不到用户本机的配置文件。
export function McpSetupDialog({
  onClose,
  onNotify,
}: McpSetupDialogProps) {
  const [status, setStatus] = useState<McpSetupStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useModalBehavior(busy ? () => undefined : onClose);

  useEffect(() => {
    let cancelled = false;

    // 先 await 再 setState：effect 里不直接改状态，避免级联渲染
    void (async () => {
      try {
        const response = await fetch("/api/mcp-setup");
        const payload = (await response.json()) as {
          status?: McpSetupStatus;
          error?: string;
        };

        if (!response.ok || !payload.status) {
          throw new Error(payload.error ?? "读不到接入状态。");
        }

        if (!cancelled) {
          setStatus(payload.status);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "读状态失败。",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function runAction(action: "apply" | "revert" | "verify") {
    setBusy(action);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/mcp-setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
        status?: McpSetupStatus;
        verify?: VerifyResult;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "操作失败。");
      }

      if (action === "verify") {
        setVerify(payload.verify ?? null);
        return;
      }

      if (payload.status) {
        setStatus(payload.status);
      }

      onNotify(payload.message ?? "操作完成。");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "操作失败。");
    } finally {
      setBusy(null);
    }
  }

  const isLocked = busy !== null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="关闭本机 MCP 接入"
        className="absolute inset-0 cursor-default bg-slate-950/35 backdrop-blur-[2px]"
        onClick={isLocked ? undefined : onClose}
        type="button"
      />

      <aside
        aria-labelledby="mcp-setup-title"
        aria-modal="true"
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl sm:max-w-2xl"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <PlugZap aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-xs text-slate-500">本机模式</p>
              <h2
                className="mt-1 text-lg font-semibold text-slate-950"
                id="mcp-setup-title"
              >
                接入本机 MCP
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                让 AI 工具能直接读写这个库。目前只支持 Codex，只会动它的
                config.toml，而且只动接入的那一段。
              </p>
            </div>
          </div>

          <button
            aria-label="关闭本机 MCP 接入"
            className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
            disabled={isLocked}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {isLoading ? (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              正在读配置文件…
            </p>
          ) : status ? (
            <>
              <section className="rounded-xl border border-slate-200 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-700">
                  现在的状态
                </h3>
                <dl className="mt-2 flex flex-col gap-1 text-xs leading-5">
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 text-slate-500">配置文件</dt>
                    <dd className="min-w-0 break-all text-slate-700">
                      {status.configPath}
                      {status.fileExists ? "" : "（现在还不存在，接入时会新建）"}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 text-slate-500">备份</dt>
                    <dd className="min-w-0 break-all text-slate-700">
                      {status.hasBackup
                        ? `${status.backupPath}（有，撤销时会用它还原）`
                        : "还没有（第一次接入时生成，只留最近一次）"}
                    </dd>
                  </div>
                </dl>

                <p className="mt-3 text-xs leading-5 text-slate-600">
                  {status.state.kind === "same"
                    ? "已经接好了，内容和这份代码一致。"
                    : status.state.kind === "different"
                      ? "接过，但内容在这之后被改过——接入会换成下面这份新的。"
                      : "还没有接入过。"}
                </p>

                {status.state.kind === "different" && (
                  <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-950 px-3 py-2 text-[11px] leading-5 text-slate-100">
                    {status.state.current}
                  </pre>
                )}

                <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-700">
                  {status.desiredBlock}
                </pre>
              </section>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  className={`${actionButtonClassName} bg-teal-600 text-white hover:bg-teal-700`}
                  disabled={isLocked || status.state.kind === "same"}
                  onClick={() => void runAction("apply")}
                  type="button"
                >
                  {busy === "apply" ? "正在接入…" : "接入"}
                </button>
                <button
                  className={`${actionButtonClassName} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
                  disabled={isLocked || status.state.kind === "missing"}
                  onClick={() => void runAction("revert")}
                  type="button"
                >
                  {busy === "revert"
                    ? "正在撤销…"
                    : status.hasBackup
                      ? "用备份还原"
                      : "删掉接入的那一段"}
                </button>
                <button
                  className={`${actionButtonClassName} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
                  disabled={isLocked}
                  onClick={() => void runAction("verify")}
                  type="button"
                >
                  {busy === "verify" ? "正在连一次…" : "验证能不能用"}
                </button>
              </div>

              <section className="mt-5 rounded-xl border border-slate-200 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-700">
                  验证结果
                </h3>
                {!verify ? (
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    点「验证能不能用」会真起一次 MCP 服务、连上去、列一遍工具，全程只读。
                  </p>
                ) : verify.ok ? (
                  <>
                    <p className="mt-1 text-xs leading-5 text-emerald-700">
                      连上了，用了 {verify.elapsedMs} 毫秒，看到 {verify.tools.length} 个工具。
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      {verify.tools.join("、")}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-xs leading-5 text-rose-700">
                      没连上：{verify.error ?? "自检没跑通"}
                      {verify.exitCode === null ? "" : `（退出码 ${verify.exitCode}）`}
                    </p>
                    <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-950 px-3 py-2 text-[11px] leading-5 text-slate-100">
                      {verify.output}
                    </pre>
                  </>
                )}
              </section>
            </>
          ) : null}

          {errorMessage && (
            <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
              {errorMessage}
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
