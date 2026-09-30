// 采集产出件的直读解析（线索 3 M2.2 T15）。
//
// 话术里写死了产出物契约：每个 .md 一条候选规则、`# 标题` 起头、不要 frontmatter。
// 落库命令靠这个文件把产出件直接读成草稿条目，不再过一遍 AI 提炼——
// 智能体已经按格式整理过一遍，再提炼一次只会把元信息变成垃圾资产。

export type CollectionOutputFile = {
  filename: string;
  content: string;
};

export type CollectionOutputItem = {
  title: string;
  summary: string;
  content: string;
  sourceFilename: string;
};

const HEADING_PATTERN = /^#\s+(.+?)\s*$/;
const SUMMARY_MAX_LENGTH = 80;

// 话术不让写 YAML frontmatter，但真写了也不该让它进正文——
// 产品不读这些字段，留着只会被当规则正文的一部分。
function stripFrontmatter(text: string): string {
  if (!text.startsWith("---")) {
    return text;
  }

  const secondFence = text.indexOf("\n---", 3);

  if (secondFence === -1) {
    return text;
  }

  return text.slice(secondFence + 4).replace(/^\r?\n/, "");
}

function firstHeading(lines: string[]): string | null {
  for (const line of lines) {
    const matched = HEADING_PATTERN.exec(line);

    if (matched) {
      return matched[1];
    }
  }

  return null;
}

function firstBodyLine(lines: string[]): string {
  for (const line of lines) {
    const trimmed = line.trim();

    // 跳过标题行与分隔线，取第一条真正的正文
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("---")) {
      continue;
    }

    return trimmed.length > SUMMARY_MAX_LENGTH
      ? `${trimmed.slice(0, SUMMARY_MAX_LENGTH)}…`
      : trimmed;
  }

  return "";
}

export function parseCollectionOutputFiles(
  files: CollectionOutputFile[],
): CollectionOutputItem[] {
  const items: CollectionOutputItem[] = [];

  for (const file of files) {
    const body = stripFrontmatter(file.content).trim();

    if (!body) {
      continue;
    }

    const lines = body.split("\n");
    const title = firstHeading(lines) ?? file.filename.replace(/\.md$/i, "");

    items.push({
      title,
      summary: firstBodyLine(lines) || title,
      content: body,
      sourceFilename: file.filename,
    });
  }

  return items;
}
