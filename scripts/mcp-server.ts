// 本机 MCP 服务：把提示词、规则、文档和图谱节点开放给 AI 查，也可以新建、编辑和改状态。
// 只读写本机 SQLite（和界面用的是同一个库文件），不开端口、不需要账号、不写日志。
//
// 启动：npm run mcp
// 只读模式：设 MCP_READ_ONLY=1，写工具不会注册，客户端看不到它们。
//
// 注意：stdout 是 JSON-RPC 通道，任何提示都写 stderr（console.error）。

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod";

import {
  assetStatusLabels,
  assetTypeLabels,
  graphNodeTypeLabels,
  ruleScopeLabels,
  ruleTypeLabels,
} from "../src/lib/asset-list.ts";
import { createAssetVersionId } from "../src/lib/asset-versions.ts";
import type {
  AssetData,
  GraphNodeAssetData,
} from "../src/data/assets.ts";
import type { ProjectData } from "../src/data/projects.ts";
import {
  analyzeNodeImpactByReference,
  describeAsset,
  findAsset,
  listGraphNodeAssets,
  listProjectAssets,
  listRuleAssets,
  resolveProject,
  searchPromptAssets,
  type McpRelationEntry,
} from "../src/lib/mcp-query.ts";
import {
  buildMcpCreateAsset,
  buildMcpStatusChange,
  buildMcpUpdateAsset,
  mcpWritableAssetTypes,
} from "../src/lib/mcp-write.ts";
import { PromptDatabase } from "../src/lib/server/prompt-database.ts";
import {
  buildDocumentImportDrafts,
  materializeDocumentAssets,
} from "../src/lib/document-import.ts";
import { scanDocumentDirectory } from "../src/lib/server/document-directory-scan.ts";
import { findNodeWithSameCode } from "../src/lib/graph-node.ts";

// 只用到本地库的这几个读方法，测试里可以换成临时库
export type McpDatabase = Pick<
  PromptDatabase,
  "listProjects" | "listAssets" | "createAsset" | "updateAsset"
>;

export type McpServerOptions = {
  database: McpDatabase;
  // 关掉写工具，只留查询（MCP_READ_ONLY=1）
  allowWrite?: boolean;
  now?: () => string;
};

const SERVER_NAME = "ai-prompt-manager";
const SERVER_VERSION = "1.0.0";

const statusValues = ["draft", "pending", "active", "archived", "deprecated"] as const;
const ruleLevels = ["global", "module", "task", "code"] as const;
const ruleTypes = [
  "must",
  "forbidden",
  "recommended",
  "process",
  "acceptance",
  "technology",
] as const;
const ruleScopes = ["global", "project", "task"] as const;
const nodeTypes = ["requirement", "module", "data", "interface", "test"] as const;

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

function failure(error: unknown) {
  const message =
    error instanceof Error && error.message
      ? error.message
      : "操作失败，原因未知。";

  return {
    content: [{ type: "text" as const, text: `没有完成：${message}` }],
    isError: true,
  };
}

function readAssetTypeLabel(assetType: string) {
  return (
    assetTypeLabels[assetType as keyof typeof assetTypeLabels] ?? assetType
  );
}

function formatRelation(entry: McpRelationEntry) {
  const note = entry.note ? `（${entry.note}）` : "";
  const via = entry.via?.length ? `（通过 ${entry.via.join("、")}）` : "";

  return `- ${entry.title}｜${readAssetTypeLabel(entry.assetType)}｜${entry.assetId}${note}${via}`;
}

export function createMcpServer(options: McpServerOptions) {
  const { database } = options;
  const allowWrite = options.allowWrite ?? true;
  const now = options.now ?? (() => new Date().toISOString());
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // 每次调用都重新读一遍，保证界面刚改完的内容 AI 立刻能看到
  function readState() {
    const projects = database.listProjects();
    const assets = database.listAssets();

    return { projects, assets };
  }

  function requireProject(projects: ReturnType<typeof readState>["projects"], reference?: string) {
    const project = resolveProject(projects, reference);

    if (!project) {
      throw new Error(
        reference
          ? `没找到项目「${reference}」，先用 list_projects 看一下有哪些项目。`
          : "库里还没有项目。",
      );
    }

    return project;
  }

  server.registerTool(
    "list_projects",
    {
      description:
        "列出本机提示词管理工具里的项目（含项目标识、名称、阶段和资产数量）。",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const { projects, assets } = readState();

        if (projects.length === 0) {
          return text("库里还没有项目。");
        }

        const lines = projects.map((project) => {
          const count = listProjectAssets(assets, project.id).length;

          return `- ${project.name}｜阶段 ${project.stage}｜${
            project.archivedAt ? "已归档" : "进行中"
          }｜${count} 条资产｜项目标识 ${project.id}`;
        });

        return text(lines.join("\n"));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "search_prompts",
    {
      description:
        "按项目、关键词和标签搜提示词，返回标题、分类、标签、适用场景和正文。",
      inputSchema: z.object({
        project: z.string().optional().describe("项目名称或项目标识，省略则用默认项目"),
        query: z.string().optional().describe("关键词，匹配标题、适用场景和正文"),
        tag: z.string().optional().describe("按标签精确筛选"),
        limit: z.number().int().min(1).max(50).optional().describe("最多返回几条，默认 10"),
      }),
    },
    async (input) => {
      try {
        const { projects, assets } = readState();
        const project = requireProject(projects, input.project);
        const results = searchPromptAssets(assets, project.id, input);

        if (results.length === 0) {
          return text(`项目「${project.name}」里没有匹配的提示词。`);
        }

        const body = results
          .map((item) =>
            [
              `## ${item.title}`,
              `分类：${item.category}｜标签：${item.tags.join("、") || "无"}｜标识：${item.assetId}`,
              item.useCase ? `适用场景：${item.useCase}` : "",
              "",
              item.content,
            ]
              .filter((line) => line !== "")
              .join("\n"),
          )
          .join("\n\n---\n\n");

        return text(`项目「${project.name}」匹配 ${results.length} 条提示词：\n\n${body}`);
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "get_asset",
    {
      description:
        "按标识、标题或标题里的一段取一条资产的正文、元数据和关系（指向谁、被谁指向）。",
      inputSchema: z.object({
        asset: z.string().describe("资产标识、完整标题，或标题里的一段"),
      }),
    },
    async (input) => {
      try {
        const { assets } = readState();
        const asset = findAsset(assets, input.asset);

        if (!asset) {
          throw new Error(
            `没有唯一匹配「${input.asset}」的资产，换标识或写完整标题。`,
          );
        }

        const detail = describeAsset(assets, asset);
        const sections = [
          `# ${detail.title}`,
          `类型：${readAssetTypeLabel(detail.assetType)}｜状态：${
            assetStatusLabels[detail.status] ?? detail.status
          }｜标识：${detail.assetId}`,
          detail.summary ? `说明：${detail.summary}` : "",
          "",
          detail.content,
          "",
          `## 这条指向谁（${detail.outgoing.length}）`,
          detail.outgoing.map(formatRelation).join("\n") || "无",
          "",
          `## 谁指向它（${detail.incoming.length}）`,
          detail.incoming.map(formatRelation).join("\n") || "无",
          "",
          `原始元数据：${JSON.stringify(detail.metadata)}`,
        ];

        return text(sections.filter((line) => line !== "").join("\n"));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "list_rules",
    {
      description:
        "按项目列规则，可按作用层级、规则类型和范围筛选；返回正文、理由和来源片段。",
      inputSchema: z.object({
        project: z.string().optional().describe("项目名称或项目标识，省略则用默认项目"),
        level: z.enum(ruleLevels).optional().describe("作用层级"),
        ruleType: z.enum(ruleTypes).optional().describe("规则类型"),
        scope: z.enum(ruleScopes).optional().describe("适用范围"),
        query: z.string().optional().describe("关键词，匹配标题、正文和元数据"),
      }),
    },
    async (input) => {
      try {
        const { projects, assets } = readState();
        const project = requireProject(projects, input.project);
        const rules = listRuleAssets(assets, project.id, input);

        if (rules.length === 0) {
          return text(`项目「${project.name}」里没有匹配的规则。`);
        }

        const body = rules
          .map((rule) =>
            [
              `## ${rule.title}`,
              `类型：${ruleTypeLabels[rule.ruleType as keyof typeof ruleTypeLabels] ?? rule.ruleType}｜范围：${
                ruleScopeLabels[rule.scope as keyof typeof ruleScopeLabels] ?? rule.scope
              }｜层级：${rule.level || "未填"}｜状态：${
                assetStatusLabels[rule.status] ?? rule.status
              }｜标识：${rule.assetId}`,
              rule.purpose ? `用途：${rule.purpose}` : "",
              rule.rationale ? `理由：${rule.rationale}` : "",
              rule.sourceExcerpt ? `来源片段：${rule.sourceExcerpt}` : "",
              "",
              rule.content,
            ]
              .filter((line) => line !== "")
              .join("\n"),
          )
          .join("\n\n---\n\n");

        return text(`项目「${project.name}」匹配 ${rules.length} 条规则：\n\n${body}`);
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "list_graph_nodes",
    {
      description:
        "按项目列图谱节点（需求／模块／数据／接口／测试），返回编号、完整路径、说明和备注。",
      inputSchema: z.object({
        project: z.string().optional().describe("项目名称或项目标识，省略则用默认项目"),
        nodeType: z.enum(nodeTypes).optional().describe("节点类型，省略则五类都列"),
      }),
    },
    async (input) => {
      try {
        const { projects, assets } = readState();
        const project = requireProject(projects, input.project);
        const nodes = listGraphNodeAssets(assets, project.id, input.nodeType);

        if (nodes.length === 0) {
          return text(`项目「${project.name}」里没有匹配的图谱节点。`);
        }

        const lines = nodes.map(
          (node) =>
            `- ${node.code}｜${graphNodeTypeLabels[node.nodeType]}｜${node.title}｜路径：${
              node.path.join(" → ") || node.title
            }${node.note ? `｜备注：${node.note}` : ""}`,
        );

        return text(
          `项目「${project.name}」共 ${nodes.length} 个节点：\n\n${lines.join("\n")}`,
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "analyze_impact",
    {
      description:
        "按节点编号或标题做影响分析：这个节点指向谁、谁指向它、间接影响通过谁串起来。",
      inputSchema: z.object({
        project: z.string().optional().describe("项目名称或项目标识，省略则用默认项目"),
        node: z.string().describe("节点编号（例如 REQ-001）或节点标题"),
      }),
    },
    async (input) => {
      try {
        const { projects, assets } = readState();
        const project = requireProject(projects, input.project);
        const impact = analyzeNodeImpactByReference(assets, project.id, input.node);

        if (!impact) {
          throw new Error(
            `项目「${project.name}」里没有唯一匹配「${input.node}」的节点。`,
          );
        }

        const sections = [
          `# ${impact.node.code}｜${impact.node.title}`,
          `类型：${graphNodeTypeLabels[impact.node.nodeType]}｜路径：${
            impact.node.path.join(" → ") || impact.node.title
          }`,
          impact.node.note ? `备注：${impact.node.note}` : "",
          "",
          `## 这个节点指向谁（${impact.outgoing.length}）`,
          impact.outgoing.map(formatRelation).join("\n") || "无",
          "",
          `## 谁指向它（${impact.incoming.length}）`,
          impact.incoming.map(formatRelation).join("\n") || "无",
          "",
          `## 间接影响（${impact.indirect.length}）`,
          impact.indirect.map(formatRelation).join("\n") || "无",
        ];

        return text(sections.filter((line) => line !== "").join("\n"));
      } catch (error) {
        return failure(error);
      }
    },
  );

  if (!allowWrite) {
    return server;
  }

  server.registerTool(
    "create_asset",
    {
      description:
        "新建资产（提示词／规则／文档／图谱节点／模板／验收记录）。只新增，不覆盖任何已有内容。" +
        "验收记录的结论一律先是「待确认」，AI 不能把它标成通过。" +
        "发布记录不在可写范围：门禁是人工可验证证据，只能在界面上填。",
      inputSchema: z.object({
        assetType: z.enum(mcpWritableAssetTypes).describe("资产类型"),
        project: z.string().optional().describe("项目名称或项目标识，省略则用默认项目"),
        title: z.string().describe("标题"),
        content: z.string().describe("正文（Markdown）"),
        summary: z.string().optional().describe("一句话说明"),
        status: z.enum(statusValues).optional().describe("状态，默认活跃"),
        category: z.string().optional().describe("提示词分类"),
        tags: z.array(z.string()).optional().describe("提示词标签"),
        useCase: z.string().optional().describe("提示词适用场景"),
        ruleType: z.enum(ruleTypes).optional().describe("规则类型"),
        scope: z.enum(ruleScopes).optional().describe("规则适用范围"),
        level: z.enum(ruleLevels).optional().describe("规则作用层级"),
        purpose: z.string().optional().describe("规则用途"),
        rationale: z.string().optional().describe("规则的理由"),
        sourceExcerpt: z.string().optional().describe("规则的来源片段"),
        documentType: z.string().optional().describe("文档类型，默认参考资料"),
        nodeType: z.enum(nodeTypes).optional().describe("图谱节点类型"),
        code: z.string().optional().describe("图谱节点编号，例如 REQ-001"),
        parentCode: z.string().optional().describe("图谱节点父节点编号"),
        note: z.string().optional().describe("图谱节点或模板的备注"),
        outputFileName: z.string().optional().describe("模板产物文件名"),
        requirementCode: z
          .string()
          .optional()
          .describe("验收记录挂在哪个需求上，填需求编号，例如 REQ-001"),
        commitRef: z
          .string()
          .optional()
          .describe("验收记录对应的提交号或版本标签"),
        evidenceItems: z
          .array(
            z.object({
              label: z.string().describe("证据说明：怎么验的、看到什么"),
              reference: z.string().describe("链接或文件路径，可留空"),
            }),
          )
          .optional()
          .describe("验收记录的证据清单"),
      }),
    },
    async (input) => {
      try {
        const { projects, assets } = readState();
        const project = requireProject(projects, input.project);
        const saveInput = buildMcpCreateAsset(
          { ...input, projectId: project.id },
          { now: now(), assets },
        );
        const created = database.createAsset(saveInput);

        if (!created) {
          throw new Error("这个资产标识已经存在，换个标题重试。");
        }

        return text(
          `已新建${readAssetTypeLabel(saveInput.asset.assetType)}「${saveInput.asset.title}」，项目「${project.name}」，标识 ${saveInput.asset.id}。` +
            (saveInput.asset.assetType === "evidence"
              ? "结论是「待确认」，要让它在覆盖统计里算通过，得由人在界面上确认。"
              : ""),
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "update_asset",
    {
      description:
        "改一条资产：只覆盖你传的字段，没传的保持原样；每次修改都会写一条新版本，旧版本留着可以回退。" +
        "验收记录的结论改不了：通过与否只能由人在界面上确认。",
      inputSchema: z.object({
        asset: z.string().describe("资产标识或完整标题"),
        title: z.string().optional(),
        content: z.string().optional(),
        summary: z.string().optional(),
        category: z.string().optional().describe("提示词分类"),
        tags: z.array(z.string()).optional().describe("提示词标签"),
        useCase: z.string().optional().describe("提示词适用场景"),
        ruleType: z.enum(ruleTypes).optional(),
        scope: z.enum(ruleScopes).optional(),
        level: z.enum(ruleLevels).optional(),
        priority: z.enum(["must", "should", "may"]).optional(),
        stage: z.enum(["plan", "implement", "verify", "release"]).optional(),
        purpose: z.string().optional(),
        rationale: z.string().optional(),
        sourceExcerpt: z.string().optional(),
        documentType: z.string().optional(),
        nodeType: z.enum(nodeTypes).optional(),
        code: z.string().optional().describe("图谱节点编号"),
        parentCode: z.string().optional().describe("图谱节点父节点编号，空串表示改成根节点"),
        note: z.string().optional(),
        outputFileName: z.string().optional(),
        requirementCode: z
          .string()
          .optional()
          .describe("验收记录改挂到另一个需求上，填需求编号"),
        commitRef: z.string().optional().describe("验收记录的提交号或版本标签"),
        evidenceItems: z
          .array(
            z.object({
              label: z.string(),
              reference: z.string(),
            }),
          )
          .optional()
          .describe("验收记录的证据清单，传了就整份替换"),
      }),
    },
    async (input) => {
      try {
        const { assets } = readState();
        const asset = findAsset(assets, input.asset);

        if (!asset) {
          throw new Error(
            `没有唯一匹配「${input.asset}」的资产，先用 search_prompts 或 get_asset 找到它。`,
          );
        }

        const saveInput = buildMcpUpdateAsset(asset, input, {
          versionId: createAssetVersionId(),
          now: now(),
          assets,
        });
        const updated = database.updateAsset(saveInput);

        if (!updated) {
          throw new Error("这条资产已经不在了，重新查一遍再改。");
        }

        return text(
          `已更新${readAssetTypeLabel(asset.assetType)}「${saveInput.asset.title}」（标识 ${asset.id}），旧版本保留在历史里。`,
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "set_asset_status",
    {
      description:
        "改一条资产的状态：草稿／待确认／活跃／已废弃／已归档。归档后不再出现在默认列表里，内容和历史版本都保留。",
      inputSchema: z.object({
        asset: z.string().describe("资产标识或完整标题"),
        status: z.enum(statusValues).describe("目标状态"),
      }),
    },
    async (input) => {
      try {
        const { assets } = readState();
        const asset = findAsset(assets, input.asset);

        if (!asset) {
          throw new Error(`没有唯一匹配「${input.asset}」的资产。`);
        }

        const saveInput = buildMcpStatusChange(asset, input.status, {
          versionId: createAssetVersionId(),
          now: now(),
          assets,
        });
        const updated = database.updateAsset(saveInput);

        if (!updated) {
          throw new Error("这条资产已经不在了，重新查一遍再改。");
        }

        return text(
          `「${asset.title}」（标识 ${asset.id}）的状态已改成${
            assetStatusLabels[input.status]
          }。`,
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  // 批量入库：先按目录灌文档，再按编号灌节点
  registerBatchImportTools(server, {
    database,
    now,
    readState,
    requireProject,
  });

  return server;
}

// 批量入库的两个工具（阶段二）：
// 都只新增、不覆盖；同名的文档和同编号的节点默认跳过，并把跳过原因说清楚。
function registerBatchImportTools(
  server: McpServer,
  options: {
    database: McpDatabase;
    now: () => string;
    readState: () => { projects: ProjectData[]; assets: AssetData[] };
    requireProject: (
      projects: ProjectData[],
      reference?: string,
    ) => ProjectData;
  },
) {
  const { database, now, readState, requireProject } = options;

  server.registerTool(
    "import_documents",
    {
      description:
        "把一个本机目录里的 Markdown／纯文本按批导入项目文档（原样入库，不改内容）。" +
        "同名文档默认跳过；先加 dryRun 看会导入哪些，确认后再真导。",
      inputSchema: z.object({
        directoryPath: z
          .string()
          .describe("本机目录的绝对路径，例如 E:\\codeX项目\\docs"),
        project: z
          .string()
          .optional()
          .describe("项目名称或项目标识，省略则用默认项目"),
        documentType: z
          .string()
          .optional()
          .describe("按哪个文档类型入库，默认「参考资料」"),
        dryRun: z
          .boolean()
          .optional()
          .describe("只列出会导入哪些、不写库，默认 false"),
      }),
    },
    async (input) => {
      try {
        const { projects, assets } = readState();
        const project = requireProject(projects, input.project);
        const files = await scanDocumentDirectory({
          directoryPath: input.directoryPath,
        });
        const existingDocuments = assets.filter(
          (asset) =>
            asset.projectId === project.id &&
            asset.assetType === "document" &&
            asset.deletedAt === null,
        );
        const drafts = buildDocumentImportDrafts({
          files,
          existing: existingDocuments.map((asset) => ({
            id: asset.id,
            title: asset.title,
          })),
        });
        const importable = drafts.filter(
          (draft) => !draft.existingAssetId && !draft.tooLarge,
        );
        const skipped = drafts.filter(
          (draft) => draft.existingAssetId || draft.tooLarge,
        );
        const summary = [
          `目录：${input.directoryPath}`,
          `读到 ${files.length} 份文件，可导入 ${importable.length} 份，跳过 ${skipped.length} 份。`,
        ];

        if (input.dryRun) {
          return text(
            [
              ...summary,
              "",
              "会导入：",
              ...importable.map((draft) => `- ${draft.title}`),
              ...(skipped.length > 0
                ? [
                    "",
                    "会跳过：",
                    ...skipped.map(
                      (draft) =>
                        `- ${draft.title}（${
                          draft.existingAssetId ? "项目里已有同名文档" : "超过单份上限"
                        }）`,
                    ),
                  ]
                : []),
              "",
              "这是 dryRun，没有写库。确认后去掉 dryRun 再来一次。",
            ].join("\n"),
          );
        }

        const batchId = `mcp-import-${now()}`;
        const assetsToCreate = materializeDocumentAssets({
          drafts: importable,
          projectId: project.id,
          documentType: input.documentType?.trim() || "参考资料",
          batchId,
          now: now(),
        });
        const created: string[] = [];

        for (const asset of assetsToCreate) {
          const saved = database.createAsset({
            asset,
            versionId: asset.currentVersionId,
            changeReason: "MCP 批量导入文档",
            versionReason: "initial",
          });

          if (saved) {
            created.push(asset.title);
          }
        }

        return text(
          [
            ...summary,
            `已导入 ${created.length} 份到项目「${project.name}」：`,
            ...created.map((title) => `- ${title}`),
            ...(skipped.length > 0
              ? [
                  "",
                  "跳过的：",
                  ...skipped.map(
                    (draft) =>
                      `- ${draft.title}（${
                        draft.existingAssetId ? "项目里已有同名文档" : "超过单份上限"
                      }）`,
                  ),
                ]
              : []),
            "",
            "这些文档都是原样入库的，可以在项目视图的「文档」标签下按链路分组查看。",
          ].join("\n"),
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "import_graph_nodes",
    {
      description:
        "按编号批量新建图谱节点（需求／模块／数据／接口／测试）。" +
        "同类型同编号已存在就跳过，不覆盖已有正文；适合让 AI 把一批节点一次灌进来。",
      inputSchema: z.object({
        project: z
          .string()
          .optional()
          .describe("项目名称或项目标识，省略则用默认项目"),
        nodes: z
          .array(
            z.object({
              nodeType: z.enum(nodeTypes).describe("节点类型"),
              code: z.string().describe("节点编号，例如 REQ-001"),
              title: z.string().describe("节点标题"),
              content: z
                .string()
                .describe("节点说明（Markdown）；节点没有说明就等于没内容，所以必填"),
              note: z.string().optional().describe("备注"),
              parentCode: z.string().optional().describe("父节点编号"),
            }),
          )
          .describe("要建的节点清单"),
      }),
    },
    async (input) => {
      try {
        const { projects, assets } = readState();
        const project = requireProject(projects, input.project);
        const existingNodes = assets.filter(
          (asset): asset is GraphNodeAssetData =>
            asset.projectId === project.id &&
            asset.assetType === "graph_node" &&
            asset.deletedAt === null,
        );
        const created: string[] = [];
        const skipped: string[] = [];
        let knownNodes = [...existingNodes];

        for (const node of input.nodes) {
          const duplicated = findNodeWithSameCode(knownNodes, {
            id: "",
            nodeType: node.nodeType,
            code: node.code,
          });

          if (duplicated) {
            skipped.push(`${node.code}（已经有「${duplicated.title}」）`);
            continue;
          }

          const saveInput = buildMcpCreateAsset(
            {
              assetType: "graph_node",
              projectId: project.id,
              title: node.title,
              content: node.content,
              nodeType: node.nodeType,
              code: node.code,
              ...(node.note ? { note: node.note } : {}),
              ...(node.parentCode ? { parentCode: node.parentCode } : {}),
            },
            { now: now(), assets: knownNodes },
          );
          const saved = database.createAsset(saveInput);

          if (saved) {
            created.push(`${node.code} ${node.title}`);
            knownNodes = [...knownNodes, saveInput.asset as GraphNodeAssetData];
          }
        }

        return text(
          [
            `项目「${project.name}」：新建 ${created.length} 个节点，跳过 ${skipped.length} 个。`,
            ...(created.length > 0
              ? ["", "已新建：", ...created.map((line) => `- ${line}`)]
              : []),
            ...(skipped.length > 0
              ? ["", "已跳过：", ...skipped.map((line) => `- ${line}`)]
              : []),
            "",
            "建完可以打开项目图谱看树和影响分析。",
          ].join("\n"),
        );
      } catch (error) {
        return failure(error);
      }
    },
  );
}

export function readWriteMode(env: NodeJS.ProcessEnv = process.env) {
  return env.MCP_READ_ONLY !== "1";
}

async function main() {
  // 库文件按脚本所在仓库定位，不看启动目录：
  // MCP 客户端在别的目录里拉起进程时，也要打开同一个库。
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const databasePath =
    process.env.PROMPT_DB_PATH ??
    path.join(repositoryRoot, ".data", "prompts.sqlite");
  const allowWrite = readWriteMode();

  if (!existsSync(databasePath)) {
    console.error(
      `[mcp] 还没有本机库文件（${databasePath}），会按空库打开；先在界面上用过一次再来。`,
    );
  }

  const database = new PromptDatabase(databasePath);
  const server = createMcpServer({
    database,
    allowWrite,
  });
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error(
    `[mcp] 本机库：${databasePath}｜${allowWrite ? "可读可写" : "只读模式（MCP_READ_ONLY=1）"}`,
  );
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";

if (import.meta.url === entry) {
  main().catch((error) => {
    console.error("[mcp] 启动失败", error);
    process.exitCode = 1;
  });
}
