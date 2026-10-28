// 学习系统 M1 的矩阵计算：纯函数，不碰网络、不碰 React，方便单测。
//
// 这一版算的是「练习覆盖矩阵」——每格只说：这层有几道题、你做了几道、对了几道。
// 它**不给「你在第几层」的结论**，那是 M2 的诊断。原因写在
// docs/superpowers/specs/2026-10-27-v4-m1-module-level-practice-design-and-tasks.md：
// 首次诊断卷用单题定生死，判出来的结论不可信，这个错不能再犯。

export type Level = 1 | 2 | 3 | 4 | 5;

// 每格至少这么多题，才允许拿来下结论（界面上也只在这时去掉「题量不足」提示）
export const MIN_QUESTIONS_FOR_LEVEL = 3;

export type ModuleInput = {
  id: string;
  name: string;
  order_index: number;
  weight?: number | null;
  expected_gap?: number | null;
  planned_hours?: number | null;
  exit_criteria?: string | null;
};

export type QuestionInput = {
  id: string;
  module_id: string | null;
  level: number | null;
};

export type AttemptInput = {
  question_id: string;
  is_correct: boolean;
  created_at: string;
};

export type LevelCell = {
  total: number;
  done: number;
  correct: number;
  enoughQuestions: boolean;
};

export type MatrixRow = {
  module: ModuleInput;
  cells: Record<Level, LevelCell>;
  // 归入格子的题数（模块对得上且有层级）
  totalQuestions: number;
  totalDone: number;
  // 归到本模块但没标层级的题数：不进格子，但要让人看见「有题没打标」
  unleveled: number;
};

const LEVELS: Level[] = [1, 2, 3, 4, 5];

function emptyCell(): LevelCell {
  return { total: 0, done: 0, correct: 0, enoughQuestions: false };
}

/**
 * 按模块 × 层级汇总题量与作答情况。
 *
 * - 题目必须同时有 `module_id`（且在该模块列表里）和 1—5 的 `level`，才会计入格子；
 * - 没标层级的题只计入 `unleveled`，不凭空塞进某一层；
 * - 同一题做多次，以 `created_at` 最新的一次为准；
 * - 答题记录里若出现已被删掉的题，直接忽略，不污染统计。
 */
export function buildPracticeMatrix(
  modules: ModuleInput[],
  questions: QuestionInput[],
  attempts: AttemptInput[],
): MatrixRow[] {
  // 每题的最新一次作答结果
  const latest = new Map<string, { correct: boolean; at: string }>();
  for (const attempt of attempts) {
    const prev = latest.get(attempt.question_id);
    // ISO 时间字符串可以直接按字典序比较，不需要转 Date
    if (!prev || attempt.created_at > prev.at) {
      latest.set(attempt.question_id, { correct: attempt.is_correct, at: attempt.created_at });
    }
  }

  const rows: MatrixRow[] = modules
    .slice()
    .sort((a, b) => a.order_index - b.order_index)
    .map((module) => {
      const cells = {} as Record<Level, LevelCell>;
      for (const lv of LEVELS) cells[lv] = emptyCell();
      return { module, cells, totalQuestions: 0, totalDone: 0, unleveled: 0 };
    });

  const byModuleId = new Map(rows.map((row) => [row.module.id, row]));

  for (const question of questions) {
    if (!question.module_id) continue;
    const row = byModuleId.get(question.module_id);
    if (!row) continue; // 题目挂在一个不在本主题里的模块上，忽略

    if (question.level == null || isInvalidLevel(question.level)) {
      row.unleveled += 1;
      continue;
    }

    const level = question.level as Level;
    const cell = row.cells[level];
    cell.total += 1;
    row.totalQuestions += 1;

    const done = latest.get(question.id);
    if (done) {
      cell.done += 1;
      row.totalDone += 1;
      if (done.correct) cell.correct += 1;
    }
  }

  for (const row of rows) {
    for (const lv of LEVELS) {
      row.cells[lv].enoughQuestions = row.cells[lv].total >= MIN_QUESTIONS_FOR_LEVEL;
    }
  }

  return rows;
}

function isInvalidLevel(level: number): boolean {
  return !Number.isInteger(level) || level < 1 || level > 5;
}

/**
 * 两个日期之间差几个自然日（正数表示目标在未来）。
 *
 * 刻意不按 24 小时算：考试日、报名日都是「哪一天」，不是「多少小时后」。
 * 纯日期字符串取字面值（"2027-03-20" 就是 3 月 20 日，不受时区影响）；
 * Date 对象取本地日期。
 */
export function daysUntil(target: Date | string, now: Date = new Date()): number {
  const [ty, tm, td] = toYmd(target);
  const [ny, nm, nd] = [now.getFullYear(), now.getMonth(), now.getDate()];
  const targetUtc = Date.UTC(ty, tm, td);
  const nowUtc = Date.UTC(ny, nm, nd);
  return Math.round((targetUtc - nowUtc) / 86_400_000);
}

function toYmd(value: Date | string): [number, number, number] {
  if (typeof value === "string") {
    const matched = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (matched) {
      return [Number(matched[1]), Number(matched[2]) - 1, Number(matched[3])];
    }
    const parsed = new Date(value);
    return [parsed.getFullYear(), parsed.getMonth(), parsed.getDate()];
  }
  return [value.getFullYear(), value.getMonth(), value.getDate()];
}

export type Milestone = { name: string; date: string; note?: string };

export type MilestoneView = {
  milestone: Milestone;
  daysLeft: number;
  passed: boolean;
};

/** 关键节点按日期升序排好，并标出哪些已经过去。主题页顶部就渲染这个。 */
export function upcomingMilestones(
  milestones: Milestone[] | null | undefined,
  now: Date = new Date(),
): MilestoneView[] {
  if (!Array.isArray(milestones)) return [];

  return milestones
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((milestone) => {
      const daysLeft = daysUntil(milestone.date, now);
      return { milestone, daysLeft, passed: daysLeft < 0 };
    });
}
