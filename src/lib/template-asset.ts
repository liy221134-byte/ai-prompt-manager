// 模板资产的纯逻辑：变量清单、模板库文件映射、套模板生成产物。
// 复用提示词的 {{变量}} 规则，模板和提示词用同一套占位符习惯。

import type {
  AssetData,
  TemplateAssetData,
  TemplateAssetMetadata,
} from "../data/assets.ts";
import { applyVariables, extractVariables } from "./prompt-utils.ts";
import {
  COMPILE_GENERATOR_VERSION,
  type CompiledDraft,
} from "./rule-compile.ts";

// 套模板时能自动填的三个槽位：项目名、项目一句话目标、技术栈。
// 模板作者写变量名的方式不会完全统一，所以按关键词识别，而不是死记变量名。
export type TemplateAutoSlot = "projectName" | "projectGoal" | "techStack";

export function resolveAutoVariable(name: string): TemplateAutoSlot | null {
  const normalized = name.replace(/[\s，,。.：:、（）()]/g, "");

  if (normalized.includes("名称")) {
    return "projectName";
  }

  if (
    normalized.includes("一句话") ||
    normalized.includes("解决什么问题") ||
    normalized.includes("一句话目标")
  ) {
    return "projectGoal";
  }

  if (
    normalized.includes("技术栈") ||
    normalized.includes("技术选型")
  ) {
    return "techStack";
  }

  return null;
}

// 规则内容的插入点：模板里写这个占位符，编译出的规则段落会替换到这里
export const TEMPLATE_RULES_PLACEHOLDER = "规则集";

export type TemplateFileInput = {
  fileName: string;
  content: string;
};

export type TemplateAssetDraftData = {
  title: string;
  summary: string;
  content: string;
  metadata: TemplateAssetMetadata;
};

// 模板详情要显示变量清单，直接按正文解析，不另存一份
export function readTemplateVariables(content: string) {
  return extractVariables(content);
}

// 模板库文件 → 模板资产草稿：文件名当标题和产物文件名，正文原样保留
export function templateFileToDraft(
  file: TemplateFileInput,
): TemplateAssetDraftData {
  const fileName = file.fileName.replace(/\\/g, "/").split("/").pop() ?? "";
  const heading = file.content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";

  return {
    title: fileName.replace(/\.md$/i, ""),
    summary: heading && heading !== fileName ? heading : "",
    content: file.content.trim(),
    metadata: {
      outputFileName: fileName,
      note: "从模板库导入",
    },
  };
}

// 建模板资产（导入时用），和别的资产一样带来源和版本标识
export function templateDraftToAsset(input: {
  id: string;
  projectId: string;
  draft: TemplateAssetDraftData;
  originalFilename: string;
  now: string;
}): TemplateAssetData {
  return {
    id: input.id,
    projectId: input.projectId,
    assetType: "template",
    title: input.draft.title,
    summary: input.draft.summary,
    content: input.draft.content,
    metadata: {
      outputFileName: input.draft.metadata.outputFileName,
      note: input.draft.metadata.note,
    },
    source: {
      sourceType: "import",
      sourceAssetId: null,
      importBatchId: null,
      originalFilename: input.originalFilename,
    },
    currentVersionId: `current-${input.id}`,
    status: "active",
    archivedAt: null,
    deletedAt: null,
    deletedReason: null,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export type TemplateAutoValues = Record<TemplateAutoSlot, string>;

// 三个槽位的值，供 resolveAutoVariable 匹配到的变量直接取用
export function buildAutoVariableValues(input: {
  projectName: string;
  projectGoal: string;
  techStack: string;
}): TemplateAutoValues {
  return {
    projectName: input.projectName.trim(),
    projectGoal: input.projectGoal.trim(),
    techStack: input.techStack.trim(),
  };
}

// 按模板里实际出现的变量名算出「能填的」和「还要人填的」
export function resolveTemplateVariableValues(
  variableNames: string[],
  values: TemplateAutoValues,
) {
  const resolved: Record<string, string> = {};
  const pending: string[] = [];

  for (const name of variableNames) {
    if (name === TEMPLATE_RULES_PLACEHOLDER) {
      continue;
    }

    const slot = resolveAutoVariable(name);
    const value = slot ? values[slot] : "";

    if (slot && value) {
      resolved[name] = value;
      continue;
    }

    pending.push(name);
  }

  return { resolved, pending };
}

export type TemplateCompileResult = CompiledDraft & {
  // 自动填上的变量和还要人填的变量
  filledVariables: string[];
  pendingVariables: string[];
  usedTemplate: boolean;
  rulesAppended: boolean;
};

function buildRulesSection(draft: CompiledDraft) {
  // 内置草稿的正文去掉自己的一级标题和头部说明，只留规则段落
  const [, ...rest] = draft.content.split(/\r?\n/);
  const bodyStart = rest.findIndex((line) => line.startsWith("## "));

  return (bodyStart >= 0 ? rest.slice(bodyStart) : rest).join("\n").trim();
}

// 套模板生成产物：模板正文当骨架，自动变量填好，规则内容插到 {{规则集}} 位置。
// 模板里没写这个占位符时，规则内容追加到末尾并注明。
export function compileWithTemplate(input: {
  template: TemplateAssetData;
  projectName: string;
  projectGoal: string;
  techStack: string;
  rulesDraft: CompiledDraft;
  now: string;
}): TemplateCompileResult {
  const autoValues = buildAutoVariableValues({
    projectName: input.projectName,
    projectGoal: input.projectGoal,
    techStack: input.techStack,
  });
  const variablesInTemplate = readTemplateVariables(input.template.content);
  const { resolved, pending } = resolveTemplateVariableValues(
    variablesInTemplate,
    autoValues,
  );
  const filledVariables = Object.keys(resolved);
  const rulesSection = buildRulesSection(input.rulesDraft);
  const hasRulesPlaceholder = variablesInTemplate.includes(
    TEMPLATE_RULES_PLACEHOLDER,
  );
  const withRules = hasRulesPlaceholder
    ? applyVariables(input.template.content, {
        ...resolved,
        [TEMPLATE_RULES_PLACEHOLDER]: rulesSection,
      })
    : `${input.template.content}\n\n## 规则（由编译追加）\n\n${rulesSection}\n`;
  const fileName =
    input.template.metadata.outputFileName || input.template.title;

  return {
    target: "agents",
    fileName,
    ruleCount: input.rulesDraft.ruleCount,
    // 产物头部带上生成信息，方便回溯是哪一版工具、什么时候生成的
    content: withGeneratorHeader(applyVariables(withRules, resolved), input.now),
    filledVariables,
    pendingVariables: pending,
    usedTemplate: true,
    rulesAppended: !hasRulesPlaceholder,
  };
}

// 生成产物头部统一加一行来源说明，避免产物看不出是哪一版工具生成的
export function withGeneratorHeader(content: string, now: string) {
  const generatedAt = new Date(now);
  const timestamp = Number.isNaN(generatedAt.getTime())
    ? now
    : generatedAt.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

  return `> 由 AI 提示词资产管理工具生成（${COMPILE_GENERATOR_VERSION}），${timestamp}\n\n${content}`;
}

// 找出项目里可用的模板资产，供编译面板下拉使用
export function listProjectTemplates(assets: AssetData[], projectId: string) {
  return assets
    .filter(
      (asset): asset is TemplateAssetData =>
        asset.assetType === "template" &&
        asset.projectId === projectId &&
        asset.deletedAt === null &&
        asset.status === "active",
    )
    .sort((left, right) => left.title.localeCompare(right.title, "zh"));
}
