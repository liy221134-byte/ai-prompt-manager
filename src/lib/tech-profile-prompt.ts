// 技术档案提示词：给「零代码、没有 package.json」的项目用。
// 复制这段话交给 AI，把 AI 产出的技术栈清单贴回编辑器保存。

export function buildTechProfilePrompt(input: {
  projectName: string;
  projectGoal: string;
  stack: Array<{ name: string; version?: string }>;
}) {
  const goal = input.projectGoal.trim();
  const current = input.stack
    .filter((entry) => entry.name.trim())
    .map((entry) =>
      entry.version?.trim()
        ? `- ${entry.name.trim()}：${entry.version.trim()}`
        : `- ${entry.name.trim()}`,
    );

  return [
    `我要为项目「${input.projectName.trim() || "未命名项目"}」整理一份技术档案。`,
    "",
    "项目说明：",
    goal || "（还没写，按下面第 1 步先帮我补一句）",
    "",
    current.length > 0
      ? ["现在已经记下来的技术栈：", ...current].join("\n")
      : "现在还没有记任何技术栈。",
    "",
    "请按这个顺序帮我：",
    "1. 先问我 3 到 5 个必要问题（用来确定约束，例如用户量、数据敏感度、是否要自有服务器、预算、维护人力），一次问完，等我回答。",
    "2. 然后给出技术栈清单，每行一条：技术名称 | 版本（不确定就写「待定」） | 在这个项目里负责什么。",
    "3. 明确写出哪些是不该引入的（禁止项），以及什么条件下才允许替换。",
    "4. 如果某条偏离了本项目的默认选型，说明理由，提醒我需要另外写一条决策记录（ADR）。",
    "",
    "约束：不要一次给多个方案让我挑，直接给一套并说明理由；版本不确定就写「待定」，不要编版本号。",
  ].join("\n");
}
