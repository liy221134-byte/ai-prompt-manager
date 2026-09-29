"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpenText,
  Check,
  Copy,
  ExternalLink,
  ShieldCheck,
  X,
} from "lucide-react";

import ledgerSnapshotJson from "@/data/external-sources-ledger.json";
import {
  compileStatusLabels,
  type CompileStatusLevel,
  type LedgerSnapshot,
  type LedgerSnapshotEntry,
} from "@/lib/external-sources-ledger";

// 采集台账只读视图（线索 3 M1）。
// 数据来自构建期生成的 JSON 快照 src/data/external-sources-ledger.json——
// 它是 seed-packs/external-sources/README.md 第六节台账的镜像，本地／云端读同一份，
// 所以我们不查库、不写库，纯只读渲染。
//
// 台账本身由人在 README 里维护；这个视图只是「看得见、能查、能核」。
// 改 README 后要重跑 npm run generate:leads3-ledger 才会更新（测试会挡住不同步）。

const snapshot = ledgerSnapshotJson as unknown as LedgerSnapshot;

const COMPLIANCE_COMMAND = "npm run check:leads3-compliance";

const levelTones: Record<CompileStatusLevel, string> = {
  empty: "bg-slate-100 text-slate-600",
  not_imported: "bg-amber-50 text-amber-700",
  template: "bg-blue-50 text-blue-700",
  knowledge: "bg-emerald-50 text-emerald-700",
  not_compiled: "bg-slate-100 text-slate-600",
  compiled_candidate: "bg-emerald-100 text-emerald-800",
};

// 统计条按这个顺序展示，覆盖全部档位（当前为 0 的也显示，让档位含义可见）
const levelOrder: CompileStatusLevel[] = [
  "empty",
  "not_imported",
  "template",
  "knowledge",
  "not_compiled",
  "compiled_candidate",
];

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-3 border-b border-slate-100 py-3 last:border-b-0">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="min-w-0 text-sm leading-6 text-slate-800">{children}</dd>
    </div>
  );
}

export function ExternalSourcesLedgerView() {
  const [activeSeq, setActiveSeq] = useState<number | null>(null);
  const [isCheckHintOpen, setIsCheckHintOpen] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);

  const activeEntry: LedgerSnapshotEntry | null =
    snapshot.sources.find((entry) => entry.seq === activeSeq) ?? null;

  const levelCounts = useMemo(() => {
    const counts = new Map<CompileStatusLevel, number>();
    for (const entry of snapshot.sources) {
      const level = entry.compileStatus.level;
      counts.set(level, (counts.get(level) ?? 0) + 1);
    }
    return counts;
  }, []);

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(COMPLIANCE_COMMAND);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    } catch {
      // 剪贴板不可用时忽略：命令在提示条里已经可见，可手抄
    }
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-[#dbe7f5] bg-white/85">
        <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
              <BookOpenText aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">采集台账（只读）</p>
              <p className="text-xs text-slate-500">
                外部来源采集进度 · README 台账的只读镜像
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100"
              onClick={() => setIsCheckHintOpen((open) => !open)}
              type="button"
            >
              <ShieldCheck aria-hidden="true" className="size-4" />
              运行采集合规检查
            </button>
            <Link
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#dbe7f5] bg-white px-4 text-sm font-semibold text-slate-600 transition-colors hover:border-blue-300 hover:text-blue-700"
              href="/"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              返回资产库
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-[1280px] px-5 pt-8 sm:px-8">
        {isCheckHintOpen && (
          <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50/70 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-blue-800">
              <ShieldCheck aria-hidden="true" className="size-4" />
              合规检查在本机终端运行，结果不写入数据
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              检查要读本机库（<code className="rounded bg-white px-1 py-0.5 text-xs">
                .data/prompts.sqlite
              </code>），云端模式浏览器读不到库，所以这一步在终端跑。
              它会扫出所有外部来源资产，逐条核对 SOP 四硬约束
              （默认候选／初始假设／必须带来源／未经确认不许升 active），只读不改。
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="rounded-lg border border-[#dbe7f5] bg-white px-3 py-2 text-sm text-slate-800">
                {COMPLIANCE_COMMAND}
              </code>
              <button
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#dbe7f5] bg-white px-3 text-sm font-semibold text-slate-600 transition-colors hover:border-blue-300 hover:text-blue-700"
                onClick={() => void copyCommand()}
                type="button"
              >
                {hasCopied ? (
                  <Check aria-hidden="true" className="size-4 text-emerald-600" />
                ) : (
                  <Copy aria-hidden="true" className="size-4" />
                )}
                {hasCopied ? "已复制" : "复制命令"}
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-lg border border-[#dbe7f5] bg-white p-4 shadow-[0_10px_28px_rgba(30,64,175,0.05)]">
            <p className="text-xs text-slate-500">全部来源</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {snapshot.count}
            </p>
          </div>
          {levelOrder.map((level) => (
            <div
              className="rounded-lg border border-[#dbe7f5] bg-white p-4 shadow-[0_10px_28px_rgba(30,64,175,0.05)]"
              key={level}
            >
              <p className="text-xs leading-5 text-slate-500">
                {compileStatusLabels[level]}
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {levelCounts.get(level) ?? 0}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6 overflow-hidden rounded-lg border border-[#dbe7f5] bg-white shadow-[0_10px_28px_rgba(30,64,175,0.05)]">
          {snapshot.sources.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-slate-500">
              台账里还没有来源。请先在 seed-packs/external-sources/README.md
              第六节登记，再重跑生成脚本。
            </p>
          ) : (
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[#dbe7f5] text-xs font-semibold text-slate-500">
                  <th className="w-12 px-4 py-3">#</th>
                  <th className="px-4 py-3">来源</th>
                  <th className="w-28 px-4 py-3">类型</th>
                  <th className="w-32 px-4 py-3">状态</th>
                  <th className="w-44 px-4 py-3">处置结论</th>
                  <th className="w-56 px-4 py-3">是否编译</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.sources.map((entry) => (
                  <tr
                    aria-label={`查看来源：${entry.source}`}
                    className="cursor-pointer border-b border-slate-100 transition-colors last:border-b-0 hover:bg-blue-50/50 focus:bg-blue-50/50 focus:outline-none"
                    key={entry.seq}
                    onClick={() => setActiveSeq(entry.seq)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setActiveSeq(entry.seq);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <td className="px-4 py-3 text-slate-400">{entry.seq}</td>
                    <td className="max-w-0 truncate px-4 py-3 font-medium text-slate-800">
                      {entry.source || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{entry.type || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{entry.status || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {entry.disposition || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${
                          levelTones[entry.compileStatus.level]
                        }`}
                      >
                        {entry.compileStatus.label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="pb-12 pt-4 text-xs leading-6 text-slate-500">
          台账一手真相源在 <code>seed-packs/external-sources/README.md</code> 第六节，
          由人手工维护；本视图是只读镜像，改了 README 请重跑
          <code className="ml-1">npm run generate:leads3-ledger</code>。
        </p>
      </section>

      {activeEntry && (
        <div className="fixed inset-0 z-50">
          <button
            aria-label="关闭详情"
            className="absolute inset-0 bg-slate-900/30"
            onClick={() => setActiveSeq(null)}
            type="button"
          />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#dbe7f5] px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-blue-700">
                  第 {activeEntry.seq} 条来源
                </p>
                <h2 className="mt-1 text-base font-bold leading-6 text-slate-900">
                  {activeEntry.source || "—"}
                </h2>
              </div>
              <button
                aria-label="关闭"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[#dbe7f5] bg-white text-slate-500 transition-colors hover:border-blue-300 hover:text-blue-700"
                onClick={() => setActiveSeq(null)}
                type="button"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
              <dl>
                <FieldRow label="类型">{activeEntry.type || "—"}</FieldRow>
                <FieldRow label="状态">{activeEntry.status || "—"}</FieldRow>
                <FieldRow label="来源链接">
                  {activeEntry.sourceUrl ? (
                    /^https?:\/\//.test(activeEntry.sourceUrl) ? (
                      <a
                        className="inline-flex items-center gap-1 text-blue-700 underline-offset-2 hover:underline"
                        href={activeEntry.sourceUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {activeEntry.sourceUrl}
                        <ExternalLink aria-hidden="true" className="size-3.5" />
                      </a>
                    ) : (
                      activeEntry.sourceUrl
                    )
                  ) : (
                    "—"
                  )}
                </FieldRow>
                <FieldRow label="处置结论">{activeEntry.disposition || "—"}</FieldRow>
                <FieldRow label="落到哪条资产">
                  <div className="flex flex-col gap-2">
                    <span>{activeEntry.landing || "—"}</span>
                    {activeEntry.compileStatus.matchedAssets.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {activeEntry.compileStatus.matchedAssets.map((asset) => (
                          <Link
                            className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100"
                            href={`/?asset=${encodeURIComponent(asset.libraryAssetId)}`}
                            key={asset.libraryAssetId}
                          >
                            <BookOpenText aria-hidden="true" className="size-3.5" />
                            打开资产：{asset.title}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </FieldRow>
                <FieldRow label="核实日期">{activeEntry.verifiedAt || "—"}</FieldRow>
                <FieldRow label="备注">
                  <span className="text-slate-600">{activeEntry.note || "—"}</span>
                </FieldRow>
                <FieldRow label="是否编译">
                  <div className="flex flex-col gap-2">
                    <span
                      className={`inline-flex w-fit rounded-md px-2 py-1 text-xs font-semibold ${
                        levelTones[activeEntry.compileStatus.level]
                      }`}
                    >
                      {activeEntry.compileStatus.label}
                    </span>
                    <span className="flex items-start gap-1.5 text-xs leading-5 text-slate-500">
                      <AlertTriangle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                      M1 阶段按库内状态简化推导，不解析 AGENTS.md 正文做精确比对。
                    </span>
                  </div>
                </FieldRow>
              </dl>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
