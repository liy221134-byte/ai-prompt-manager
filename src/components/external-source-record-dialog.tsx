"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";

import {
  collectionDispositionPresets,
  collectionDocumentType,
  collectionEcosystems,
  collectionSourceTypePresets,
  isCollectionRecordAsset,
  readCollectionRecord,
  type AssetData,
} from "@/data/assets";
import { DEFAULT_PROJECT_ID } from "@/data/projects";
import {
  assetToDraft,
  buildCreateAssetInput,
  buildUpdateAssetInput,
  createAssetId,
  createEmptyDocumentDraft,
} from "@/lib/asset-draft";
import { createAssetVersionId } from "@/lib/asset-versions";
import {
  buildCollectionRecordContent,
  resolveLandingAssets,
} from "@/lib/external-sources-ledger";
import type { PromptDataSource } from "@/lib/prompt-source";

// 采集记录的新建／编辑表单（线索 3 M2）。
//
// 这里只登记「这条外部来源是什么、怎么处置的」，不负责确认——
// 人工确认记录统一在资产编辑器里写（谁、何时、凭什么），一处机制覆盖规则与文档两类。

const inputClassName =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition-colors focus:border-blue-400";
const labelClassName = "text-xs font-semibold text-slate-600";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className={labelClassName}>{label}</span>
      {children}
      {hint && <span className="text-xs leading-5 text-slate-500">{hint}</span>}
    </label>
  );
}

export function ExternalSourceRecordDialog({
  asset,
  assets,
  dataSource,
  nextSeq,
  onClose,
  onSaved,
}: {
  /** 编辑已有采集记录时传原资产；新建时为 null */
  asset: AssetData | null;
  /** 库内全部资产：落点写资产标题时用来认出来并挂上跳转 */
  assets: AssetData[];
  dataSource: PromptDataSource;
  /** 新建时的登记序号，接着现有记录往后排 */
  nextSeq: number;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const existing =
    asset && isCollectionRecordAsset(asset) ? (readCollectionRecord(asset) ?? {}) : {};

  const [source, setSource] = useState(asset?.title ?? "");
  const [ecosystem, setEcosystem] = useState(existing.ecosystem ?? "开源社区");
  const [sourceType, setSourceType] = useState(existing.sourceType ?? "Skills");
  const [sourceUrl, setSourceUrl] = useState(existing.sourceUrl ?? "");
  const [disposition, setDisposition] = useState(existing.disposition ?? "已采");
  const [landing, setLanding] = useState(existing.landing ?? "");
  const [verifiedAt, setVerifiedAt] = useState(existing.verifiedAt ?? "");
  const [note, setNote] = useState(existing.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isEditing = Boolean(asset);

  async function handleSave() {
    const title = source.trim();

    if (!title) {
      setError("请填写来源名。");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const now = new Date().toISOString();
      const trimmedLanding = landing.trim();
      // 落点里认出来的库内资产并进原记录，不覆盖手工挂过的那些
      const collectedAssetIds = Array.from(
        new Set([
          ...(existing.collectedAssetIds ?? []),
          ...resolveLandingAssets(trimmedLanding, assets),
        ]),
      );
      const content = buildCollectionRecordContent({
        source: title,
        ecosystem,
        sourceType: sourceType.trim(),
        sourceUrl: sourceUrl.trim(),
        disposition: disposition.trim(),
        landing: trimmedLanding,
        verifiedAt: verifiedAt.trim(),
        note,
      });
      const summary = `外部采集来源 · ${ecosystem} · ${sourceType.trim() || "类型未填"}`;

      if (asset && isCollectionRecordAsset(asset)) {
        const draft = assetToDraft(asset);

        if (draft.assetType !== "document") {
          throw new Error("这条资产不是文档类型，无法按采集记录保存。");
        }

        draft.title = title;
        draft.summary = summary;
        draft.content = content;
        draft.collection = {
          seq: existing.seq,
          ecosystem,
          sourceType: sourceType.trim(),
          sourceUrl: sourceUrl.trim(),
          disposition: disposition.trim(),
          landing: trimmedLanding,
          verifiedAt: verifiedAt.trim(),
          note,
          ...(collectedAssetIds.length > 0 ? { collectedAssetIds } : {}),
        };

        await dataSource.updateAsset(
          buildUpdateAssetInput(asset, draft, {
            versionId: createAssetVersionId(),
            now,
          }),
        );

        onSaved("采集记录已更新");
        return;
      }

      const draft = createEmptyDocumentDraft({
        documentType: collectionDocumentType,
        collection: {
          seq: nextSeq,
          ecosystem,
          sourceType: sourceType.trim(),
          sourceUrl: sourceUrl.trim(),
          disposition: disposition.trim(),
          landing: trimmedLanding,
          verifiedAt: verifiedAt.trim(),
          note,
          ...(collectedAssetIds.length > 0 ? { collectedAssetIds } : {}),
        },
      });

      draft.title = title;
      draft.summary = summary;
      draft.content = content;
      // 外部来源的登记：未采信（authority false），与 M0 定下的口径一致
      draft.role = "source";
      draft.authority = false;
      draft.status = "active";

      await dataSource.createAsset(
        buildCreateAssetInput({
          id: createAssetId("document"),
          projectId: DEFAULT_PROJECT_ID,
          draft,
          now,
        }),
      );

      onSaved("采集来源已登记");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "保存失败，请稍后再试。",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        aria-label="关闭表单"
        className="absolute inset-0 bg-slate-900/30"
        onClick={onClose}
        type="button"
      />

      <div
        aria-label={isEditing ? "编辑采集记录" : "新建采集来源"}
        aria-modal="true"
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {isEditing ? "编辑采集记录" : "新建采集来源"}
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              外部来源登记在资产库里，本地与云端同一套数据；改动会留版本记录。
            </p>
          </div>
          <button
            aria-label="关闭"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-blue-300 hover:text-blue-700"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="来源名">
            <input
              className={inputClassName}
              onChange={(event) => setSource(event.target.value)}
              placeholder="例如：S9 某厂商 Skills"
              value={source}
            />
          </Field>

          <Field label="生态／厂商">
            <select
              className={inputClassName}
              onChange={(event) => setEcosystem(event.target.value)}
              value={ecosystem}
            >
              {collectionEcosystems.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>

          <Field label="类型" hint="Skills／MCP／资讯流…可以自己写">
            <input
              className={inputClassName}
              list="collection-source-types"
              onChange={(event) => setSourceType(event.target.value)}
              value={sourceType}
            />
            <datalist id="collection-source-types">
              {collectionSourceTypePresets.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </Field>

          <Field label="处置结论" hint="已采／暂缓／不采…可以自己写">
            <input
              className={inputClassName}
              list="collection-dispositions"
              onChange={(event) => setDisposition(event.target.value)}
              value={disposition}
            />
            <datalist id="collection-dispositions">
              {collectionDispositionPresets.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </Field>

          <Field label="来源链接">
            <input
              className={inputClassName}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="外部仓库／官方页；本机来源写「本机」"
              value={sourceUrl}
            />
          </Field>

          <Field label="核实日期">
            <input
              className={inputClassName}
              onChange={(event) => setVerifiedAt(event.target.value)}
              placeholder="例如：2026-09-29"
              value={verifiedAt}
            />
          </Field>

          <div className="sm:col-span-2">
            <Field
              label="落到哪条资产"
              hint="写资产标题或 ID 时会自动认出库内资产，视图里可以直接点开追溯"
            >
              <input
                className={inputClassName}
                onChange={(event) => setLanding(event.target.value)}
                placeholder="例如：RULE-EVIDENCE-SCOPE-001 等 3 条；没有就留空"
                value={landing}
              />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="备注">
              <textarea
                className="min-h-[88px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-800 outline-none transition-colors focus:border-blue-400"
                onChange={(event) => setNote(event.target.value)}
                placeholder="为什么采、提炼角度、注意什么"
                value={note}
              />
            </Field>
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition-colors hover:border-slate-300"
            onClick={onClose}
            type="button"
          >
            取消
          </button>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-slate-300"
            disabled={isSaving}
            onClick={() => void handleSave()}
            type="button"
          >
            {isSaving && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
            {isEditing ? "保存改动" : "登记来源"}
          </button>
        </div>
      </div>
    </div>
  );
}
