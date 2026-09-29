"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpenText,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";

import { collectionEcosystems, type AssetData } from "@/data/assets";
import { ExternalSourceRecordDialog } from "@/components/external-source-record-dialog";
import {
  compileStatusLabels,
  filterByEcosystem,
  orDash,
  summarizeEcosystems,
  toCollectionRecordRows,
  type CollectionRecordRow,
  type CompileStatusLevel,
} from "@/lib/external-sources-ledger";
import {
  createSupabasePromptDataSource,
  localPromptDataSource,
  type PromptDataSource,
} from "@/lib/prompt-source";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

// 采集台账（线索 3 M2）。
//
// M1 时这个视图是 README 台账的只读镜像（读构建期 JSON 快照）；
// M2 起改成读库——数据就是资产库里的「采集记录」文档，本地走 /api/assets、
// 云端走 Supabase，两种模式同一套读写通道，所以表现一致。
//
// 页面上只有两处写动作，都要人点：登记新来源、编辑已有记录。
// 确认（谁认可这条来源/这条规则进候选）在资产编辑器里做，见 T6。

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

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-3 border-b border-slate-100 py-3 last:border-b-0">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="min-w-0 text-sm leading-6 text-slate-800">{children}</dd>
    </div>
  );
}

export function ExternalSourcesLedgerView({
  dataMode,
}: {
  dataMode: "local" | "supabase";
}) {
  const dataSource = useMemo<PromptDataSource>(() => {
    if (dataMode === "supabase") {
      return createSupabasePromptDataSource(getSupabaseBrowserClient());
    }

    return localPromptDataSource;
  }, [dataMode]);

  const [assets, setAssets] = useState<AssetData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ecosystemFilter, setEcosystemFilter] = useState("");
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  // undefined = 没开表单；null = 新建；有值 = 编辑这一条
  const [dialogAsset, setDialogAsset] = useState<AssetData | null | undefined>(
    undefined,
  );
  const [isCheckHintOpen, setIsCheckHintOpen] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const list = await dataSource.fetchAssets();
    setAssets(list);
    return list;
  }, [dataSource]);

  useEffect(() => {
    let cancelled = false;

    // 整段加载从微任务起步：在 effect 体里同步调用 setState 会触发
    // react-hooks/set-state-in-effect。这条 lint 规则是线上构建的一道门
    // （vercel.json 的 buildCommand = npm run check），报 error 会让部署失败。
    void Promise.resolve().then(async () => {
      if (cancelled) {
        return;
      }

      setIsLoading(true);

      try {
        const list = await dataSource.fetchAssets();

        if (cancelled) {
          return;
        }

        setAssets(list);
        setLoadError(null);
      } catch (error: unknown) {
        if (cancelled) {
          return;
        }

        setLoadError(
          error instanceof Error ? error.message : "读取采集记录失败。",
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [dataSource]);

  const rows = useMemo(() => toCollectionRecordRows(assets), [assets]);
  const visibleRows = useMemo(
    () => filterByEcosystem(rows, ecosystemFilter),
    [rows, ecosystemFilter],
  );
  const ecosystemSummary = useMemo(() => summarizeEcosystems(rows), [rows]);

  const levelCounts = useMemo(() => {
    const counts = new Map<CompileStatusLevel, number>();

    for (const row of rows) {
      const level = row.compileStatus.level;
      counts.set(level, (counts.get(level) ?? 0) + 1);
    }

    return counts;
  }, [rows]);

  const activeRow: CollectionRecordRow | null =
    rows.find((row) => row.assetId === activeAssetId) ?? null;
  const activeAsset = activeRow
    ? (assets.find((asset) => asset.id === activeRow.assetId) ?? null)
    : null;
  const nextSeq = rows.reduce((max, row) => Math.max(max, row.seq), 0) + 1;

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(COMPLIANCE_COMMAND);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    } catch {
      // 剪贴板不可用时忽略：命令在提示条里已经可见，可手抄
    }
  }

  async function handleSaved(message: string) {
    setDialogAsset(undefined);
    setNotice(message);
    setTimeout(() => setNotice(null), 3200);

    try {
      await reload();
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "保存成功，但刷新列表失败。",
      );
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
              <p className="text-sm font-semibold text-slate-900">采集台账</p>
              <p className="text-xs text-slate-500">
                外部来源采集进度 · 存在资产库里，本地与云端同一套
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              onClick={() => setDialogAsset(null)}
              type="button"
            >
              <Plus aria-hidden="true" className="size-4" />
              新建采集
            </button>
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
              检查要读本机库（
              <code className="rounded bg-white px-1 py-0.5 text-xs">
                .data/prompts.sqlite
              </code>
              ），云端模式浏览器读不到库，所以这一步在终端跑。
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

        {notice && (
          <p className="mb-6 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            <Check aria-hidden="true" className="size-4" />
            {notice}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-lg border border-[#dbe7f5] bg-white p-4 shadow-[0_10px_28px_rgba(30,64,175,0.05)]">
            <p className="text-xs text-slate-500">全部来源</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{rows.length}</p>
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

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">生态</span>
          <button
            className={`inline-flex h-8 items-center rounded-lg border px-3 text-xs font-semibold transition-colors ${
              ecosystemFilter === ""
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-[#dbe7f5] bg-white text-slate-600 hover:border-blue-300"
            }`}
            onClick={() => setEcosystemFilter("")}
            type="button"
          >
            全部 {rows.length}
          </button>
          {collectionEcosystems.map((ecosystem) => {
            const count =
              ecosystemSummary.find((item) => item.ecosystem === ecosystem)
                ?.count ?? 0;

            return (
              <button
                className={`inline-flex h-8 items-center rounded-lg border px-3 text-xs font-semibold transition-colors ${
                  ecosystemFilter === ecosystem
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : count === 0
                      ? "border-slate-100 bg-slate-50 text-slate-400"
                      : "border-[#dbe7f5] bg-white text-slate-600 hover:border-blue-300"
                }`}
                key={ecosystem}
                onClick={() => setEcosystemFilter(ecosystem)}
                type="button"
              >
                {ecosystem} {count}
              </button>
            );
          })}
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-[#dbe7f5] bg-white shadow-[0_10px_28px_rgba(30,64,175,0.05)]">
          {isLoading ? (
            <p className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-slate-500">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              正在读取采集记录…
            </p>
          ) : loadError ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm text-rose-700">{loadError}</p>
              <button
                className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition-colors hover:border-blue-300 hover:text-blue-700"
                onClick={() => void reload().catch(() => undefined)}
                type="button"
              >
                <RefreshCw aria-hidden="true" className="size-4" />
                重新读取
              </button>
            </div>
          ) : visibleRows.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-slate-500">
              {rows.length === 0
                ? "还没有采集记录。点右上角「新建采集」登记一条来源。"
                : "这个生态下还没有来源，换个生态看看。"}
            </p>
          ) : (
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[#dbe7f5] text-xs font-semibold text-slate-500">
                  <th className="w-12 px-4 py-3">#</th>
                  <th className="w-24 px-4 py-3">生态</th>
                  <th className="px-4 py-3">来源</th>
                  <th className="w-28 px-4 py-3">类型</th>
                  <th className="w-40 px-4 py-3">处置结论</th>
                  <th className="w-56 px-4 py-3">是否编译</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr
                    aria-label={`查看来源：${row.source}`}
                    className="cursor-pointer border-b border-slate-100 transition-colors last:border-b-0 hover:bg-blue-50/50 focus:bg-blue-50/50 focus:outline-none"
                    key={row.assetId}
                    onClick={() => setActiveAssetId(row.assetId)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setActiveAssetId(row.assetId);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <td className="px-4 py-3 text-slate-400">{row.seq}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {orDash(row.ecosystem)}
                    </td>
                    <td className="max-w-0 truncate px-4 py-3 font-medium text-slate-800">
                      {orDash(row.source)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {orDash(row.type)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {orDash(row.disposition)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${
                          levelTones[row.compileStatus.level]
                        }`}
                      >
                        {row.compileStatus.label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="pb-12 pt-4 text-xs leading-6 text-slate-500">
          每条采集记录就是资产库里的一份文档（类型「采集记录」），落点在库内的会挂上资产跳转。
          台账的历史形态（<code>seed-packs/external-sources/README.md</code> 第六节）
          保留为作业指引，不再要求与产品同步。
        </p>
      </section>

      {activeRow && (
        <div className="fixed inset-0 z-50">
          <button
            aria-label="关闭详情"
            className="absolute inset-0 bg-slate-900/30"
            onClick={() => setActiveAssetId(null)}
            type="button"
          />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#dbe7f5] px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-blue-700">
                  第 {activeRow.seq} 条来源 · {orDash(activeRow.ecosystem)}
                </p>
                <h2 className="mt-1 text-base font-bold leading-6 text-slate-900">
                  {orDash(activeRow.source)}
                </h2>
              </div>
              <button
                aria-label="关闭"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[#dbe7f5] bg-white text-slate-500 transition-colors hover:border-blue-300 hover:text-blue-700"
                onClick={() => setActiveAssetId(null)}
                type="button"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
              <dl>
                <FieldRow label="类型">{orDash(activeRow.type)}</FieldRow>
                <FieldRow label="状态">{orDash(activeRow.status)}</FieldRow>
                <FieldRow label="来源链接">
                  {activeRow.sourceUrl ? (
                    /^https?:\/\//.test(activeRow.sourceUrl) ? (
                      <a
                        className="inline-flex items-center gap-1 break-all text-blue-700 underline-offset-2 hover:underline"
                        href={activeRow.sourceUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {activeRow.sourceUrl}
                        <ExternalLink
                          aria-hidden="true"
                          className="size-3.5 shrink-0"
                        />
                      </a>
                    ) : (
                      activeRow.sourceUrl
                    )
                  ) : (
                    "—"
                  )}
                </FieldRow>
                <FieldRow label="处置结论">
                  {orDash(activeRow.disposition)}
                </FieldRow>
                <FieldRow label="落到哪条资产">
                  <div className="flex flex-col gap-2">
                    <span>{orDash(activeRow.landing)}</span>
                    {activeRow.compileStatus.matchedAssets.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {activeRow.compileStatus.matchedAssets.map((asset) => (
                          <span
                            className="flex flex-wrap items-center gap-2"
                            key={asset.libraryAssetId}
                          >
                            <Link
                              className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100"
                              href={`/?asset=${encodeURIComponent(asset.libraryAssetId)}`}
                            >
                              <BookOpenText
                                aria-hidden="true"
                                className="size-3.5"
                              />
                              打开资产：{asset.title}
                            </Link>
                            <span className="text-xs text-slate-500">
                              {asset.assetType === "rule"
                                ? `规则 · ${asset.status}`
                                : `文档 · ${asset.status}`}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </FieldRow>
                <FieldRow label="核实日期">
                  {orDash(activeRow.verifiedAt)}
                </FieldRow>
                <FieldRow label="备注">
                  <span className="text-slate-600">{orDash(activeRow.note)}</span>
                </FieldRow>
                <FieldRow label="是否编译">
                  <div className="flex flex-col gap-2">
                    <span
                      className={`inline-flex w-fit rounded-md px-2 py-1 text-xs font-semibold ${
                        levelTones[activeRow.compileStatus.level]
                      }`}
                    >
                      {activeRow.compileStatus.label}
                    </span>
                    <span className="flex items-start gap-1.5 text-xs leading-5 text-slate-500">
                      <AlertTriangle
                        aria-hidden="true"
                        className="mt-0.5 size-3.5 shrink-0"
                      />
                      按落点资产的当前状态推导：规则升到 active 才算进编译候选，
                      文档类本就进知识库、不编译进 AGENTS.md。
                    </span>
                  </div>
                </FieldRow>
                <FieldRow label="人工确认">
                  {activeRow.confirmed ? (
                    <span className="flex flex-col gap-1">
                      <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                        <Check aria-hidden="true" className="size-3.5" />
                        已确认 · {activeRow.confirmed.confirmedBy}
                      </span>
                      <span className="text-xs leading-5 text-slate-500">
                        {activeRow.confirmed.confirmedAt.slice(0, 10)}
                        {activeRow.confirmed.basis
                          ? ` · ${activeRow.confirmed.basis}`
                          : ""}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs leading-5 text-slate-500">
                      还没有确认记录。在资产里做确认动作时写入（谁、何时、凭什么）。
                    </span>
                  )}
                </FieldRow>
              </dl>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-[#dbe7f5] px-5 py-4">
              <Link
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#dbe7f5] bg-white px-4 text-sm font-semibold text-slate-600 transition-colors hover:border-blue-300 hover:text-blue-700"
                href={`/?asset=${encodeURIComponent(activeRow.assetId)}`}
              >
                <BookOpenText aria-hidden="true" className="size-4" />
                在资产库里打开
              </Link>
              <button
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                onClick={() => {
                  if (activeAsset) {
                    setDialogAsset(activeAsset);
                  }
                }}
                type="button"
              >
                <Pencil aria-hidden="true" className="size-4" />
                编辑
              </button>
            </div>
          </aside>
        </div>
      )}

      {dialogAsset !== undefined && (
        <ExternalSourceRecordDialog
          asset={dialogAsset}
          assets={assets}
          dataSource={dataSource}
          nextSeq={nextSeq}
          onClose={() => setDialogAsset(undefined)}
          onSaved={(message) => void handleSaved(message)}
        />
      )}
    </main>
  );
}
