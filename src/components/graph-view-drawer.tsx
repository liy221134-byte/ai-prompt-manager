"use client";

import { ArrowRight, GitBranch, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";

import { graphNodeTypes, type AssetData, type GraphNodeAssetData, type GraphNodeType } from "@/data/assets";
import { graphNodeTypeLabels } from "@/lib/asset-list";
import {
  analyzeNodeImpact,
  buildGraphTree,
  buildNodePath,
} from "@/lib/graph-node";
import { useModalBehavior } from "@/hooks/use-modal-behavior";

type GraphViewDrawerProps = {
  projectName: string;
  nodes: GraphNodeAssetData[];
  assets: AssetData[];
  // 可以挂到节点上的文档资产（项目里的）
  documents: Array<{ id: string; title: string }>;
  onCreateNode: (nodeType: GraphNodeType) => void;
  onLinkDocuments: (input: {
    nodeIds: string[];
    documentId: string;
  }) => Promise<void>;
  onOpenAsset: (asset: AssetData) => void;
  onClose: () => void;
};

export function GraphViewDrawer({
  projectName,
  nodes,
  assets,
  documents,
  onCreateNode,
  onLinkDocuments,
  onOpenAsset,
  onClose,
}: GraphViewDrawerProps) {
  const [activeType, setActiveType] = useState<GraphNodeType>("requirement");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [linkNodeIds, setLinkNodeIds] = useState<string[]>([]);
  const [linkDocumentId, setLinkDocumentId] = useState("");
  const [isLinking, setIsLinking] = useState(false);

  useModalBehavior(onClose);

  const typedNodes = useMemo(
    () => nodes.filter((node) => node.metadata.nodeType === activeType),
    [activeType, nodes],
  );
  const tree = useMemo(() => buildGraphTree(typedNodes), [typedNodes]);
  const selected = typedNodes.find((node) => node.id === selectedId) ?? null;
  const impact = useMemo(
    () => (selected ? analyzeNodeImpact({ node: selected, assets }) : null),
    [assets, selected],
  );

  function renderTree(items: GraphNodeAssetData[], depth: number) {
    return items.map((node) => (
      <li key={node.id}>
        <button
          className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
            node.id === selectedId
              ? "bg-teal-50 font-semibold text-teal-800"
              : "text-slate-700 hover:bg-slate-50"
          }`}
          onClick={() => setSelectedId(node.id)}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          type="button"
        >
          <GitBranch aria-hidden="true" className="mt-1 size-3.5 shrink-0 text-slate-400" />
          <span className="min-w-0">
            <span className="block truncate">
              {node.metadata.code ? `${node.metadata.code} ` : ""}
              {node.title}
            </span>
          </span>
        </button>
        {tree.childrenOf.get(node.id) && (
          <ul>{renderTree(tree.childrenOf.get(node.id) ?? [], depth + 1)}</ul>
        )}
      </li>
    ));
  }

  return (
    // 外层固定覆盖层不能省：只写内层 absolute 会相对页面原点定位，页面一滚动浮层就跑到可视区外
    <div className="fixed inset-0 z-50">
      <button
        aria-label="关闭项目图谱"
        className="absolute inset-0 cursor-default bg-slate-950/35 backdrop-blur-[2px]"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-labelledby="graph-view-title"
        aria-modal="true"
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl sm:max-w-3xl"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <GitBranch aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-slate-500">项目图谱</p>
              <h2
                className="mt-1 break-words text-lg font-semibold text-slate-950"
                id="graph-view-title"
              >
                {projectName}
              </h2>
            </div>
          </div>

          <button
            aria-label="关闭项目图谱"
            className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3 sm:px-6">
          {graphNodeTypes.map((nodeType) => {
            const count = nodes.filter(
              (node) => node.metadata.nodeType === nodeType,
            ).length;

            return (
              <button
                aria-pressed={activeType === nodeType}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  activeType === nodeType
                    ? "bg-teal-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                key={nodeType}
                onClick={() => {
                  setActiveType(nodeType);
                  setSelectedId(null);
                }}
                type="button"
              >
                {graphNodeTypeLabels[nodeType]} {count}
              </button>
            );
          })}
          <button
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            onClick={() => onCreateNode(activeType)}
            type="button"
          >
            <Plus aria-hidden="true" className="size-4" />
            新建{graphNodeTypeLabels[activeType]}节点
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-700">
                {graphNodeTypeLabels[activeType]}树（{typedNodes.length}）
              </h3>
              {typedNodes.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">
                  还没有{graphNodeTypeLabels[activeType]}节点，点右上角新建一个。
                </p>
              ) : (
                <ul className="mt-2">{renderTree(tree.roots, 0)}</ul>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 px-4 py-3">
              {!selected || !impact ? (
                <p className="text-sm text-slate-500">
                  选左边一个节点，这里会显示它的编号、路径、映射关系和间接影响。
                </p>
              ) : (
                <>
                  <h3 className="text-sm font-semibold text-slate-700">
                    {selected.metadata.code ? `${selected.metadata.code} ` : ""}
                    {selected.title}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    路径：
                    {buildNodePath(nodes, selected.id)
                      .map((node) => node.title)
                      .join(" → ")}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                    {selected.content}
                  </p>
                  {selected.metadata.note && (
                    <p className="mt-2 text-xs text-slate-500">
                      备注：{selected.metadata.note}
                    </p>
                  )}
                  <button
                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline"
                    onClick={() => onOpenAsset(selected)}
                    type="button"
                  >
                    去编辑这个节点
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </button>

                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <p className="text-xs font-semibold text-slate-500">
                      这个节点指向谁（{impact.outgoing.length}）
                    </p>
                    {impact.outgoing.length === 0 ? (
                      <p className="mt-1 text-xs text-slate-400">还没有出向关系</p>
                    ) : (
                      <ul className="mt-1 flex flex-col gap-1">
                        {impact.outgoing.map((entry) => (
                          <li key={entry.asset.id}>
                            <button
                              className="text-left text-xs text-slate-600 hover:text-teal-700"
                              onClick={() => onOpenAsset(entry.asset)}
                              type="button"
                            >
                              {entry.asset.title}
                              {entry.note ? `（${entry.note}）` : ""}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <p className="text-xs font-semibold text-slate-500">
                      谁指向它（{impact.incoming.length}）
                    </p>
                    {impact.incoming.length === 0 ? (
                      <p className="mt-1 text-xs text-slate-400">
                        还没有资产或节点指向它
                      </p>
                    ) : (
                      <ul className="mt-1 flex flex-col gap-1">
                        {impact.incoming.map((entry) => (
                          <li key={entry.asset.id}>
                            <button
                              className="text-left text-xs text-slate-600 hover:text-teal-700"
                              onClick={() => onOpenAsset(entry.asset)}
                              type="button"
                            >
                              {entry.asset.title}
                              {entry.note ? `（${entry.note}）` : ""}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <p className="text-xs font-semibold text-slate-500">
                      间接影响（{impact.indirect.length}）
                    </p>
                    {impact.indirect.length === 0 ? (
                      <p className="mt-1 text-xs text-slate-400">
                        没有第二层影响
                      </p>
                    ) : (
                      <ul className="mt-1 flex flex-col gap-1">
                        {impact.indirect.map((entry) => (
                          <li key={entry.asset.id}>
                            <button
                              className="text-left text-xs text-slate-600 hover:text-teal-700"
                              onClick={() => onOpenAsset(entry.asset)}
                              type="button"
                            >
                              {entry.asset.title}
                              <span className="text-slate-400">
                                （通过 {entry.via?.join("、")}）
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>

          <section className="mt-5 rounded-xl border border-slate-200 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-700">
                批量挂文档
              </h3>
              <span className="text-xs text-slate-500">
                把一份文档一次挂到多个节点上（关系类型：引用）
              </span>
            </div>
            {documents.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                项目里还没有文档资产。先在项目视图导入或新建一份文档，再回来挂。
              </p>
            ) : nodes.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                还没有图谱节点。需求节点用右上角「新建需求节点」；模块和数据表用代码视图的
                「导入代码」（建表语句或代码目录）。
              </p>
            ) : (
              <>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    文档
                    <select
                      aria-label="选择要挂上的文档"
                      className="h-9 max-w-64 rounded-lg border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-900 outline-none"
                      onChange={(event) => setLinkDocumentId(event.target.value)}
                      value={linkDocumentId}
                    >
                      <option value="">选一份文档</option>
                      {documents.map((document) => (
                        <option key={document.id} value={document.id}>
                          {document.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="text-xs font-semibold text-teal-700 hover:underline"
                    onClick={() =>
                      setLinkNodeIds(
                        linkNodeIds.length === nodes.length
                          ? []
                          : nodes.map((node) => node.id),
                      )
                    }
                    type="button"
                  >
                    {linkNodeIds.length === nodes.length ? "全不选" : "全选节点"}
                  </button>
                </div>

                <ul className="mt-2 max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                  {nodes.map((node) => (
                    <li className="px-3 py-1.5" key={node.id}>
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                        <input
                          checked={linkNodeIds.includes(node.id)}
                          className="size-4 shrink-0 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                          onChange={() =>
                            setLinkNodeIds((current) =>
                              current.includes(node.id)
                                ? current.filter((id) => id !== node.id)
                                : [...current, node.id],
                            )
                          }
                          type="checkbox"
                        />
                        <span className="text-xs text-slate-500">
                          {graphNodeTypeLabels[node.metadata.nodeType]}
                        </span>
                        <span className="truncate">
                          {node.metadata.code ? `${node.metadata.code} ` : ""}
                          {node.title}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>

                <button
                  className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  disabled={
                    isLinking || !linkDocumentId || linkNodeIds.length === 0
                  }
                  onClick={() => {
                    setIsLinking(true);
                    void onLinkDocuments({
                      nodeIds: linkNodeIds,
                      documentId: linkDocumentId,
                    }).finally(() => {
                      setIsLinking(false);
                      setLinkNodeIds([]);
                    });
                  }}
                  type="button"
                >
                  {isLinking ? "正在挂…" : `挂到选中的 ${linkNodeIds.length} 个节点`}
                </button>
              </>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
