// 文档包识别草稿：AI 只产出草稿，正式项目和资产要等用户确认后才创建。

export const sourcePackageDraftTypes = ["prompt", "rule", "document"] as const;
export type SourcePackageDraftType = (typeof sourcePackageDraftTypes)[number];

// 一次导入最多创建多少个资产，超出要求分批
export const SOURCE_PACKAGE_MAX_ASSETS = 200;

export type SourcePackageDraftItem = {
  id: string;
  sourceFilename: string;
  assetType: SourcePackageDraftType;
  title: string;
  summary: string;
  content: string;
  reason: string;
};

export type SourcePackageDraftSkipped = {
  sourceFilename: string;
  reason: string;
};

export type SourcePackageDraft = {
  project: { name: string; goal: string };
  items: SourcePackageDraftItem[];
  skipped: SourcePackageDraftSkipped[];
};

export type SourcePackageDraftEdits = {
  removedIds?: string[];
  typeOverrides?: Record<string, SourcePackageDraftType>;
  merges?: Array<{ targetId: string; sourceIds: string[] }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function readDraftType(value: unknown): SourcePackageDraftType {
  return sourcePackageDraftTypes.includes(value as SourcePackageDraftType)
    ? (value as SourcePackageDraftType)
    : "document";
}

function stripCodeFence(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  return fenced ? fenced[1] : trimmed;
}

// 解析 AI 返回的草稿。形状不可用时抛中文错误，由接口转成 502。
export function normalizeSourcePackageDraft(content: string): SourcePackageDraft {
  let parsed: unknown;

  try {
    parsed = JSON.parse(stripCodeFence(content));
  } catch {
    throw new Error("AI 返回的草稿不是有效的 JSON。");
  }

  if (!isRecord(parsed)) {
    throw new Error("AI 返回的草稿结构不正确。");
  }

  const project = isRecord(parsed.project) ? parsed.project : {};
  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  const rawSkipped = Array.isArray(parsed.skipped) ? parsed.skipped : [];

  const items: SourcePackageDraftItem[] = [];

  rawItems.forEach((value, index) => {
    if (!isRecord(value)) {
      return;
    }

    const body = readText(value.content);
    const sourceFilename = readText(value.sourceFilename, "未命名文件");

    // 没有正文的条目无法创建资产，归到「无法识别」里让用户看到
    if (!body) {
      rawSkipped.push({ sourceFilename, reason: "AI 没有给出正文内容。" });
      return;
    }

    items.push({
      id: `draft-${index + 1}`,
      sourceFilename,
      assetType: readDraftType(value.assetType),
      title: readText(value.title, sourceFilename),
      summary: readText(value.summary),
      content: body,
      reason: readText(value.reason),
    });
  });

  const skipped: SourcePackageDraftSkipped[] = rawSkipped
    .filter(isRecord)
    .map((value) => ({
      sourceFilename: readText(value.sourceFilename, "未命名文件"),
      reason: readText(value.reason, "没有说明原因。"),
    }));

  if (items.length === 0 && skipped.length === 0) {
    throw new Error("AI 没有识别出任何可用内容，请换一个文档包试试。");
  }

  return {
    project: {
      name: readText(project.name, "导入的项目"),
      goal: readText(project.goal),
    },
    items,
    skipped,
  };
}

// 预览里的改动：跳过、改类型、合并，统一在这里落成新的草稿
export function applySourcePackageDraftEdits(
  draft: SourcePackageDraft,
  edits: SourcePackageDraftEdits,
): SourcePackageDraft {
  const removed = new Set(edits.removedIds ?? []);
  const overrides = edits.typeOverrides ?? {};

  let items = draft.items
    .filter((item) => !removed.has(item.id))
    .map((item) =>
      overrides[item.id]
        ? { ...item, assetType: overrides[item.id] }
        : item,
    );

  for (const merge of edits.merges ?? []) {
    const target = items.find((item) => item.id === merge.targetId);

    if (!target) {
      continue;
    }

    const sources = items.filter(
      (item) => item.id !== target.id && merge.sourceIds.includes(item.id),
    );

    if (sources.length === 0) {
      continue;
    }

    const mergedContent = [
      target.content,
      ...sources.map((source) => `## ${source.title}\n\n${source.content}`),
    ].join("\n\n");

    const merged: SourcePackageDraftItem = {
      ...target,
      title: target.title,
      content: mergedContent,
      reason: [target.reason, `合并了 ${sources.length} 条草稿。`]
        .filter(Boolean)
        .join(" "),
      sourceFilename: target.sourceFilename,
    };

    const sourceIds = new Set(sources.map((source) => source.id));
    items = items
      .filter((item) => !sourceIds.has(item.id))
      .map((item) => (item.id === target.id ? merged : item));
  }

  return { ...draft, items };
}

// 确认创建前的上限检查，超出返回中文提示
export function checkSourcePackageDraftLimit(draft: SourcePackageDraft) {
  if (draft.items.length === 0) {
    return "至少要保留一条资产才能创建。";
  }

  if (draft.items.length > SOURCE_PACKAGE_MAX_ASSETS) {
    return `一次最多创建 ${SOURCE_PACKAGE_MAX_ASSETS} 条资产，请分批导入。`;
  }

  return null;
}

// 按 Markdown 二级标题把正文切成若干段，供预览里的「拆分」使用
function splitIntoSections(content: string) {
  const sections: Array<{ title: string; content: string }> = [];
  let current: { title: string; lines: string[] } | null = null;

  for (const line of content.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+?)\s*$/);

    if (heading) {
      if (current) {
        sections.push({
          title: current.title,
          content: current.lines.join("\n").trim(),
        });
      }

      current = { title: heading[1].trim(), lines: [] };
      continue;
    }

    if (current) {
      current.lines.push(line);
    }
  }

  if (current) {
    sections.push({
      title: current.title,
      content: current.lines.join("\n").trim(),
    });
  }

  return sections.filter((section) => section.content);
}

// 一条草稿拆成多条；拆不动时原样返回，并说明原因
export function splitSourcePackageDraftItem(
  draft: SourcePackageDraft,
  itemId: string,
): { draft: SourcePackageDraft; message?: string } {
  const index = draft.items.findIndex((item) => item.id === itemId);

  if (index < 0) {
    return { draft, message: "找不到这条草稿。" };
  }

  const item = draft.items[index];
  const sections = splitIntoSections(item.content);

  if (sections.length < 2) {
    return {
      draft,
      message: "这条内容里没有两个以上的 ## 小标题，加上小标题后再拆。",
    };
  }

  const splitItems = sections.map((section, sectionIndex) => ({
    ...item,
    id: `${item.id}-${sectionIndex + 1}`,
    title: section.title || `${item.title}（${sectionIndex + 1}）`,
    content: section.content,
  }));

  return {
    draft: {
      ...draft,
      items: [
        ...draft.items.slice(0, index),
        ...splitItems,
        ...draft.items.slice(index + 1),
      ],
    },
    message: `已拆成 ${splitItems.length} 条。`,
  };
}
