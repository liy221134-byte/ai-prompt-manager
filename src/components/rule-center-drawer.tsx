"use client";

import {
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  LoaderCircle,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
  X,
  XCircle,
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

import {
  createRuleAssetId,
  rulePriorityLabels,
  ruleTypeLabels,
  type ExtractedRule,
  type RuleAssetData,
  type RulePriority,
  type RuleSourceType,
  type RuleStatus,
  type RuleType,
} from "@/data/rule-assets";
import { useModalBehavior } from "@/hooks/use-modal-behavior";
import { exportRulesToMarkdown } from "@/lib/rule-ai";

type RuleCenterDrawerProps = {
  onClose: () => void;
  onNotify: (message: string) => void;
};

type ExtractionState = {
  title: string;
  category: string;
  rules: ExtractedRule[];
  sourceType: RuleSourceType;
  content: string;
};

type RuleAssetsResponse = {
  assets?: RuleAssetData[];
  error?: string;
};

const inputClassName =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

function downloadMarkdown(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function RuleCenterDrawer({
  onClose,
  onNotify,
}: RuleCenterDrawerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<"extract" | "assets">("extract");
  const [assets, setAssets] = useState<RuleAssetData[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  const [sourceText, setSourceText] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceType, setSourceType] = useState<RuleSourceType>("paste");
  const [extraction, setExtraction] = useState<ExtractionState | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedAssetId, setExpandedAssetId] = useState<string | null>(null);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);

  useModalBehavior(onClose);

  useEffect(() => {
    let cancelled = false;

    const timer = window.setTimeout(() => {
      void fetch("/api/rule-assets", { cache: "no-store" })
        .then(async (response) => {
          const body = (await response.json()) as RuleAssetsResponse;

          if (!response.ok) {
            throw new Error(body.error ?? "读取规则资产失败。");
          }

          if (!cancelled) {
            setAssets(body.assets ?? []);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setErrorMessage(
              error instanceof Error ? error.message : "读取规则资产失败。",
            );
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoadingAssets(false);
          }
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setErrorMessage("单个资产文件不能超过 2 MB。");
      return;
    }

    const content = await file.text();

    setSourceText(content);
    setSourceTitle(file.name.replace(/\.(md|txt)$/i, ""));
    setSourceType(file.name.toLowerCase().endsWith(".md") ? "markdown" : "text");
    setErrorMessage(null);
  }

  async function handleExtract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (sourceText.trim().length < 20) {
      return;
    }

    setIsExtracting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/ai/extract-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: sourceText }),
      });
      const body = (await response.json()) as {
        extraction?: {
          title: string;
          category: string;
          rules: ExtractedRule[];
        };
        error?: string;
      };

      if (!response.ok || !body.extraction) {
        throw new Error(body.error ?? "AI 规则提取失败。");
      }

      setExtraction({
        ...body.extraction,
        title: sourceTitle.trim() || body.extraction.title,
        sourceType,
        content: sourceText,
      });
      setActiveTab("extract");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "AI 规则提取失败。",
      );
    } finally {
      setIsExtracting(false);
    }
  }

  function updateRule(ruleId: string, updates: Partial<ExtractedRule>) {
    setExtraction((current) =>
      current
        ? {
            ...current,
            rules: current.rules.map((rule) =>
              rule.id === ruleId ? { ...rule, ...updates } : rule,
            ),
          }
        : current,
    );
  }

  async function saveAssets(nextAssets: RuleAssetData[]) {
    const changedAsset = nextAssets[0];

    if (!changedAsset) {
      return;
    }

    const response = await fetch("/api/rule-assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset: changedAsset }),
    });
    const body = (await response.json()) as RuleAssetsResponse;

    if (!response.ok) {
      throw new Error(body.error ?? "保存规则资产失败。");
    }

    setAssets(body.assets ?? []);
  }

  async function handleSaveExtraction() {
    if (!extraction || extraction.rules.length === 0) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const now = new Date().toISOString();
      const asset: RuleAssetData = {
        id: createRuleAssetId(),
        title: extraction.title.trim() || "未命名开发资产",
        category: extraction.category.trim() || "开发规范",
        sourceType: extraction.sourceType,
        content: extraction.content,
        rules: extraction.rules,
        createdAt: now,
        updatedAt: now,
      };

      await saveAssets([asset]);
      setExtraction(null);
      setSourceText("");
      setSourceTitle("");
      setActiveTab("assets");
      onNotify("规则资产已保存");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "保存规则资产失败。",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(assetId: string) {
    try {
      const response = await fetch(
        `/api/rule-assets/${encodeURIComponent(assetId)}`,
        { method: "DELETE" },
      );
      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(body.error ?? "删除规则资产失败。");
      }

      setAssets((current) =>
        current.filter((asset) => asset.id !== assetId),
      );
      setDeletingAssetId(null);
      onNotify("规则资产已删除");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "删除规则资产失败。",
      );
    }
  }

  function handleExport(asset: RuleAssetData) {
    const markdown = exportRulesToMarkdown(asset.title, asset.rules);

    if (!markdown) {
      onNotify("没有已确认的规则可以导出");
      return;
    }

    downloadMarkdown(
      `${asset.title.replace(/[\\/:*?"<>|]/g, "-")}-rules.md`,
      markdown,
    );
    onNotify("规则 Markdown 已导出");
  }

  const approvedRuleCount = extraction?.rules.filter(
    (rule) => rule.status === "approved",
  ).length;

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="关闭规则资产中心"
        className="absolute inset-0 cursor-default bg-slate-950/40 backdrop-blur-[2px]"
        onClick={onClose}
        type="button"
      />

      <aside
        aria-labelledby="rule-center-title"
        aria-modal="true"
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl sm:max-w-4xl"
        role="dialog"
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <ShieldCheck aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-xs font-semibold text-emerald-700">
                开发规则与资产
              </p>
              <h2
                className="mt-1 text-lg font-semibold text-slate-950"
                id="rule-center-title"
              >
                规则资产中心
              </h2>
            </div>
          </div>

          <button
            aria-label="关闭规则资产中心"
            className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>

        <div className="flex border-b border-slate-200 px-5 sm:px-6">
          <button
            className={`border-b-2 px-3 py-3 text-sm font-semibold transition ${
              activeTab === "extract"
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
            onClick={() => setActiveTab("extract")}
            type="button"
          >
            提取规则
          </button>
          <button
            className={`border-b-2 px-3 py-3 text-sm font-semibold transition ${
              activeTab === "assets"
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
            onClick={() => setActiveTab("assets")}
            type="button"
          >
            规则资产 {assets.length > 0 ? `(${assets.length})` : ""}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-6">
          {activeTab === "extract" && !extraction && (
            <form onSubmit={handleExtract}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">
                    资产标题
                  </span>
                  <input
                    className={`${inputClassName} mt-2`}
                    onChange={(event) => setSourceTitle(event.target.value)}
                    placeholder="例如：我的开发规范"
                    value={sourceTitle}
                  />
                </label>

                <div>
                  <span className="text-sm font-medium text-slate-700">
                    来源文件
                  </span>
                  <input
                    accept=".md,.txt,text/markdown,text/plain"
                    className="hidden"
                    onChange={handleFileChange}
                    ref={fileInputRef}
                    type="file"
                  />
                  <button
                    className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                  >
                    <Upload aria-hidden="true" className="size-4" />
                    上传 MD 或 TXT
                  </button>
                </div>
              </div>

              <label className="mt-5 block">
                <span className="text-sm font-medium text-slate-700">
                  开发资产内容
                </span>
                <textarea
                  className="mt-2 min-h-[360px] w-full resize-y rounded-lg border border-slate-300 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                  maxLength={50000}
                  onChange={(event) => {
                    setSourceText(event.target.value);
                    setSourceType("paste");
                  }}
                  placeholder="粘贴开发规范、项目规则、交付要求或已有文档"
                  value={sourceText}
                />
              </label>

              <div className="mt-3 flex items-center justify-between gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Sparkles aria-hidden="true" className="size-3.5" />
                  内容会发送到已配置的 AI 服务进行规则提取。
                </span>
                <span>{sourceText.length}/50000</span>
              </div>

              {errorMessage && (
                <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errorMessage}
                </p>
              )}

              <div className="mt-5 flex justify-end">
                <button
                  className="inline-flex h-11 min-w-32 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={isExtracting || sourceText.trim().length < 20}
                  type="submit"
                >
                  {isExtracting ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                  ) : (
                    <WandSparkles aria-hidden="true" className="size-4" />
                  )}
                  {isExtracting ? "正在提取" : "提取规则"}
                </button>
              </div>
            </form>
          )}

          {activeTab === "extract" && extraction && (
            <div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">
                    资产标题
                  </span>
                  <input
                    className={`${inputClassName} mt-2`}
                    onChange={(event) =>
                      setExtraction((current) =>
                        current
                          ? { ...current, title: event.target.value }
                          : current,
                      )
                    }
                    value={extraction.title}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">
                    资产分类
                  </span>
                  <input
                    className={`${inputClassName} mt-2`}
                    onChange={(event) =>
                      setExtraction((current) =>
                        current
                          ? { ...current, category: event.target.value }
                          : current,
                      )
                    }
                    value={extraction.category}
                  />
                </label>
              </div>

              <div className="mt-5 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">
                  提取到 {extraction.rules.length} 条规则
                </p>
                <p className="text-xs text-slate-500">
                  已确认 {approvedRuleCount ?? 0} / {extraction.rules.length}
                </p>
              </div>

              <div className="mt-3 space-y-4">
                {extraction.rules.map((rule, index) => (
                  <section
                    className="rounded-lg border border-slate-200 p-4"
                    key={rule.id}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-xs font-semibold text-slate-400">
                        RULE {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="flex items-center gap-2">
                        <select
                          aria-label="规则状态"
                          className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700"
                          onChange={(event) =>
                            updateRule(rule.id, {
                              status: event.target.value as RuleStatus,
                            })
                          }
                          value={rule.status}
                        >
                          <option value="pending">待确认</option>
                          <option value="approved">已确认</option>
                          <option value="rejected">已拒绝</option>
                        </select>
                      </div>
                    </div>

                    <textarea
                      className="mt-3 min-h-16 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm leading-6 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      onChange={(event) =>
                        updateRule(rule.id, {
                          statement: event.target.value,
                        })
                      }
                      value={rule.statement}
                    />

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <select
                        className={`${inputClassName} h-10`}
                        onChange={(event) =>
                          updateRule(rule.id, {
                            type: event.target.value as RuleType,
                          })
                        }
                        value={rule.type}
                      >
                        {Object.entries(ruleTypeLabels).map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                      <select
                        className={`${inputClassName} h-10`}
                        onChange={(event) =>
                          updateRule(rule.id, {
                            priority: event.target.value as RulePriority,
                          })
                        }
                        value={rule.priority}
                      >
                        {Object.entries(rulePriorityLabels).map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {value} · {label}
                            </option>
                          ),
                        )}
                      </select>
                    </div>

                    {rule.rationale && (
                      <p className="mt-3 text-xs leading-5 text-slate-500">
                        原因：{rule.rationale}
                      </p>
                    )}
                    {rule.sourceExcerpt && (
                      <blockquote className="mt-3 border-l-2 border-slate-200 pl-3 text-xs leading-5 text-slate-400">
                        来源：{rule.sourceExcerpt}
                      </blockquote>
                    )}
                  </section>
                ))}
              </div>

              {errorMessage && (
                <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errorMessage}
                </p>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  onClick={() => setExtraction(null)}
                  type="button"
                >
                  重新提取
                </button>
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={isSaving}
                  onClick={() => void handleSaveExtraction()}
                  type="button"
                >
                  {isSaving ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                  ) : (
                    <Save aria-hidden="true" className="size-4" />
                  )}
                  {isSaving ? "正在保存" : "保存规则资产"}
                </button>
              </div>
            </div>
          )}

          {activeTab === "assets" &&
            (isLoadingAssets ? (
              <div className="flex items-center justify-center py-20 text-sm text-slate-500">
                <LoaderCircle
                  aria-hidden="true"
                  className="mr-2 size-5 animate-spin text-blue-600"
                />
                正在读取规则资产
              </div>
            ) : assets.length === 0 ? (
              <div className="flex min-h-72 flex-col items-center justify-center text-center">
                <FileText
                  aria-hidden="true"
                  className="size-10 text-slate-300"
                />
                <h3 className="mt-4 text-base font-semibold text-slate-800">
                  还没有规则资产
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  从开发规范中提取第一批可执行规则。
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {assets.map((asset) => {
                  const approvedCount = asset.rules.filter(
                    (rule) => rule.status === "approved",
                  ).length;
                  const isExpanded = expandedAssetId === asset.id;

                  return (
                    <section
                      className="rounded-lg border border-slate-200"
                      key={asset.id}
                    >
                      <div className="flex items-start justify-between gap-4 p-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-slate-900">
                              {asset.title}
                            </h3>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                              {asset.category}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-slate-500">
                            {asset.rules.length} 条规则 · 已确认{" "}
                            {approvedCount} 条
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            aria-label="导出规则"
                            className="flex size-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-blue-700"
                            onClick={() => handleExport(asset)}
                            title="导出已确认规则"
                            type="button"
                          >
                            <Download aria-hidden="true" className="size-4" />
                          </button>
                          <button
                            aria-label="删除规则资产"
                            className="flex size-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-red-50 hover:text-red-700"
                            onClick={() =>
                              setDeletingAssetId(
                                deletingAssetId === asset.id ? null : asset.id,
                              )
                            }
                            title="删除规则资产"
                            type="button"
                          >
                            <Trash2 aria-hidden="true" className="size-4" />
                          </button>
                          <button
                            aria-label={isExpanded ? "收起规则" : "展开规则"}
                            className="flex size-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                            onClick={() =>
                              setExpandedAssetId(
                                isExpanded ? null : asset.id,
                              )
                            }
                            type="button"
                          >
                            <ChevronDown
                              aria-hidden="true"
                              className={`size-4 transition-transform ${
                                isExpanded ? "rotate-180" : ""
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      {deletingAssetId === asset.id && (
                        <div className="flex items-center justify-between gap-4 border-t border-red-100 bg-red-50 px-4 py-3">
                          <p className="text-sm text-red-800">
                            确认删除这个规则资产及其全部规则？
                          </p>
                          <div className="flex gap-2">
                            <button
                              className="h-8 rounded-md border border-red-200 bg-white px-3 text-xs font-semibold text-red-700"
                              onClick={() => setDeletingAssetId(null)}
                              type="button"
                            >
                              取消
                            </button>
                            <button
                              className="h-8 rounded-md bg-red-600 px-3 text-xs font-semibold text-white"
                              onClick={() => void handleDelete(asset.id)}
                              type="button"
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      )}

                      {isExpanded && (
                        <div className="border-t border-slate-100 px-4 py-3">
                          {asset.rules.map((rule) => (
                            <div
                              className="flex items-start gap-3 border-b border-slate-100 py-3 last:border-b-0"
                              key={rule.id}
                            >
                              {rule.status === "approved" ? (
                                <CheckCircle2
                                  aria-hidden="true"
                                  className="mt-0.5 size-4 shrink-0 text-emerald-600"
                                />
                              ) : rule.status === "rejected" ? (
                                <XCircle
                                  aria-hidden="true"
                                  className="mt-0.5 size-4 shrink-0 text-red-500"
                                />
                              ) : (
                                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-amber-400" />
                              )}
                              <div>
                                <p className="text-sm leading-6 text-slate-700">
                                  {rule.statement}
                                </p>
                                <p className="mt-1 text-xs text-slate-400">
                                  {rulePriorityLabels[rule.priority]} ·{" "}
                                  {ruleTypeLabels[rule.type]}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            ))}
        </div>
      </aside>
    </div>
  );
}
