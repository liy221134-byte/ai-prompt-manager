export type PromptLineDiffType = "same" | "added" | "removed";

export type PromptLineDiff = {
  type: PromptLineDiffType;
  text: string;
};

// 按行做最小编辑距离对比。提示词都很短，直接用 LCS 表就够了，不需要引入差异库。
export function diffPromptLines(
  before: string,
  after: string,
): PromptLineDiff[] {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const lengths: number[][] = Array.from(
    { length: beforeLines.length + 1 },
    () => new Array<number>(afterLines.length + 1).fill(0),
  );

  for (let i = beforeLines.length - 1; i >= 0; i -= 1) {
    for (let j = afterLines.length - 1; j >= 0; j -= 1) {
      lengths[i][j] =
        beforeLines[i] === afterLines[j]
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  const result: PromptLineDiff[] = [];
  let i = 0;
  let j = 0;

  while (i < beforeLines.length && j < afterLines.length) {
    if (beforeLines[i] === afterLines[j]) {
      result.push({ type: "same", text: beforeLines[i] });
      i += 1;
      j += 1;
      continue;
    }

    if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      result.push({ type: "removed", text: beforeLines[i] });
      i += 1;
    } else {
      result.push({ type: "added", text: afterLines[j] });
      j += 1;
    }
  }

  while (i < beforeLines.length) {
    result.push({ type: "removed", text: beforeLines[i] });
    i += 1;
  }

  while (j < afterLines.length) {
    result.push({ type: "added", text: afterLines[j] });
    j += 1;
  }

  return result;
}
