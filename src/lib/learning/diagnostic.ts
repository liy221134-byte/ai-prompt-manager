// 学习系统 M4 的诊断：组卷 + 层级推断。纯函数，不碰网络、不碰 React，方便单测。
//
// 这一模块要先讲清两件事，否则读代码的人会以为下面那些限制是偷懒：
//
// 一、**诊断只用可判分的题**。题库里有两类题：单选（84 道）和实操（34 道）。
//    实操题没有标准答案，提交即记「完成」，拿它判层级等于永远判对——
//    那不是诊断，是自孙。所以组卷只从单选/多选/判断里抽，实操题一概不进。
//
// 二、**结论给区间，不给「你在第几层」这种断言**。历史教训写在
//    docs/superpowers/specs/2026-10-27-v4-m1-module-level-practice-design-and-tasks.md：
//    每格一题定生死，判出来的结论不可信。既不能因为不可信就不判（那样 M4 就没了），
//    也不能判完就当事实宣布。折中的办法是：结论只说「连续过了哪几层」和「在哪一层停下、
//    为什么停」，并把「每层只有一道题」这个前提亮出来，让看的人自己决定信几分。
//
//    停下的原因是两类，绝不能混：
//      - "wrong"      ——答错了。这是「这层没过」，结论有依据。
//      - "no-question"——这层压根没题。这是「没测」，不是「不会」。
//      - "unanswered" ——卷子没做完。同样是「没测」。
//    把后两种当成「不会」，等于把题库的缺口算在人的头上。这是这一版最容易犯、也最伤人的错。

export type Level = 1 | 2 | 3 | 4 | 5;

export const DIAGNOSTIC_LEVELS: Level[] = [1, 2, 3, 4, 5];

/**
 * 能判对错的题型。
 *
 * 判据是「有没有唯一的标准答案」，不是「难不难」。将来加「多选 / 判断」不用改这里，
 * 加「案例分析」这种主观题型则必须往 SCORABLE 外面放——这是故意的。
 */
export const SCORABLE_TYPES = ["单选", "多选", "判断"] as const;

export function isScorableType(type: string | null | undefined): boolean {
  if (!type) return false;
  return (SCORABLE_TYPES as readonly string[]).includes(type);
}

export type DiagnosticModule = {
  id: string;
  name: string;
  order_index: number;
};

export type DiagnosticQuestion = {
  id: string;
  module_id: string | null;
  level: number | null;
  type: string;
  /** 所属知识点，AI 归因要用它说「你缺哪一块」 */
  knowledge_point?: string | null;
};

/** 卷子上的一格：某个模块的某一层。questionId 为 null 表示这一格抽不出可判分的题 */
export type PaperSlot = {
  moduleId: string;
  level: Level;
  questionId: string | null;
  /**
   * 这道题之前做过。
   *
   * 做过意味着可能记得答案，诊断会偏高。不隐藏这个事实，而是在结果里标出来——
   * 「你这次诊断有三道题之前做过」比一个看不出水分的分数有用。
   */
  repeated: boolean;
};

export type DiagnosticPaper = {
  /** 实际要答的题，按模块顺序、层数升序排好 */
  items: Array<{ questionId: string; moduleId: string; level: Level; repeated: boolean }>;
  /** 全部 模块 × 层 格子，含抽不出题的（用来画「哪几层没测」） */
  slots: PaperSlot[];
  /** 抽不出可判分题的格子。这不是错误，是要如实展示的缺口 */
  gaps: Array<{ moduleId: string; level: Level }>;
  moduleOrder: string[];
};

/**
 * 组卷：每个「模块 × 层」抽一道可判分的题。
 *
 * 为什么是每格一道而不是同一层多道：诊断的目的是找出**边界在哪**，不是测分值。
 * 边界判定只需要「这一层过没过」，再往上加题只是把同一个判断做得更准——
 * 而准确度可以通过「结论标注为初判 + 让人自己去补做该层剩下的题」来解决，
 * 不必把卷子从 24 道加到 48 道。人坐下来一次性答 24 道还撑得住，48 道会中途放弃，
 * 放弃的卷子连初判都给不出来。
 *
 * 抽题优先级：
 *   1. 没做过的题（避免记答案）
 *   2. 都做过时按 id 排序取第一道（保证同一份题库每次组出同一张卷，可复现）
 */
export function buildDiagnosticPaper(
  modules: DiagnosticModule[],
  questions: DiagnosticQuestion[],
  doneQuestionIds: Iterable<string> = [],
): DiagnosticPaper {
  const done = new Set(doneQuestionIds);
  const ordered = modules.slice().sort((a, b) => a.order_index - b.order_index);

  const slots: PaperSlot[] = [];
  const items: DiagnosticPaper["items"] = [];
  const gaps: DiagnosticPaper["gaps"] = [];

  for (const currentModule of ordered) {
    for (const level of DIAGNOSTIC_LEVELS) {
      const candidates = questions
        .filter(
          (question) =>
            question.module_id === currentModule.id &&
            question.level === level &&
            isScorableType(question.type),
        )
        .sort((a, b) => a.id.localeCompare(b.id));

      if (candidates.length === 0) {
        slots.push({ moduleId: currentModule.id, level, questionId: null, repeated: false });
        gaps.push({ moduleId: currentModule.id, level });
        continue;
      }

      // 没做过的优先：做过的人可能记得答案，抽新题更能反映真实水平
      const fresh = candidates.filter((question) => !done.has(question.id));
      const picked = fresh.length > 0 ? fresh[0] : candidates[0];

      slots.push({
        moduleId: currentModule.id,
        level,
        questionId: picked.id,
        repeated: done.has(picked.id),
      });
      items.push({
        questionId: picked.id,
        moduleId: currentModule.id,
        level,
        repeated: done.has(picked.id),
      });
    }
  }

  return { items, slots, gaps, moduleOrder: ordered.map((item) => item.id) };
}

/** 判定停下的原因。三种含义完全不同，展示时不能合并 */
export type StopReason = "wrong" | "no-question" | "unanswered";

export type ModuleVerdict = {
  moduleId: string;
  moduleName: string;
  /** 从 L1 起连续答对的层 */
  passedLevels: Level[];
  /** 连续通过的层数，也就是「至少到这里」 */
  reached: Level | 0;
  /** 停下来的那一层与原因；全测全对时为 null */
  stoppedAt: { level: Level; reason: StopReason } | null;
  /** 出了结论的层（有题且答过） */
  testedLevels: Level[];
  /** 答错的层 */
  wrongLevels: Level[];
  /** 这卷里「做过重复题」的层，结论可能偏高 */
  repeatedLevels: Level[];
  /** 这个模块有没有任何一层是能实测的 */
  measurable: boolean;
};

export type DiagnosticInference = {
  modules: ModuleVerdict[];
  /** 整体一句结论，给页面顶部用 */
  headline: string;
  /** 卷子答了几题 / 共几题 */
  answered: number;
  total: number;
  /** 重复题数量，用来标注「这次有水分」 */
  repeatedCount: number;
  /** 有缺口（某层没题）的层数 */
  gapCount: number;
};

/**
 * 按「从 L1 往上，第一层没过就停」判每个模块。
 *
 * 这个规则刻意简单到可以复算：不交给模型判，是因为模型给出的层数无法复现，
 * 也没法跟人解释「为什么我是 L2」。规则判层级，模型只做归因（哪块知识缺、下一步做什么）。
 */
export function inferLevels(
  modules: DiagnosticModule[],
  paper: DiagnosticPaper,
  answers: Record<string, boolean>,
): DiagnosticInference {
  const ordered = modules.slice().sort((a, b) => a.order_index - b.order_index);
  const byModuleLevel = new Map<string, PaperSlot>();
  for (const slot of paper.slots) {
    byModuleLevel.set(`${slot.moduleId}::${slot.level}`, slot);
  }

  const verdicts: ModuleVerdict[] = ordered.map((currentModule) => {
    const passedLevels: Level[] = [];
    const testedLevels: Level[] = [];
    const wrongLevels: Level[] = [];
    const repeatedLevels: Level[] = [];
    let stoppedAt: ModuleVerdict["stoppedAt"] = null;

    for (const level of DIAGNOSTIC_LEVELS) {
      const slot = byModuleLevel.get(`${currentModule.id}::${level}`);
      // 模块不在卷子里（例如新建了模块还没出题）：整块算没测
      if (!slot || !slot.questionId) {
        stoppedAt = { level, reason: "no-question" };
        break;
      }

      const answer = answers[slot.questionId];
      if (answer === undefined) {
        stoppedAt = { level, reason: "unanswered" };
        break;
      }

      testedLevels.push(level);
      if (slot.repeated) repeatedLevels.push(level);

      if (answer) {
        passedLevels.push(level);
      } else {
        wrongLevels.push(level);
        stoppedAt = { level, reason: "wrong" };
        break;
      }
    }

    const reached = (passedLevels.length > 0
      ? passedLevels[passedLevels.length - 1]
      : 0) as Level | 0;

    return {
      moduleId: currentModule.id,
      moduleName: currentModule.name,
      passedLevels,
      reached,
      stoppedAt,
      testedLevels,
      wrongLevels,
      repeatedLevels,
      measurable: wrongLevels.length > 0 || passedLevels.length > 0,
    };
  });

  const answered = paper.items.filter((item) => answers[item.questionId] !== undefined).length;
  const repeatedCount = paper.items.filter(
    (item) => item.repeated && answers[item.questionId] !== undefined,
  ).length;

  return {
    modules: verdicts,
    headline: buildHeadline(verdicts, answered, paper.items.length),
    answered,
    total: paper.items.length,
    repeatedCount,
    gapCount: paper.gaps.length,
  };
}

/**
 * 一句话结论。
 *
 * 措辞上刻意避开「你具备 L3 能力」这类断言——每层只有一道题的样本量撑不起这种话。
 * 用的是「连续答对到第几层」「哪层没过」「哪层没测」这三种可复核的说法。
 */
function buildHeadline(
  verdicts: ModuleVerdict[],
  answered: number,
  total: number,
): string {
  const measurable = verdicts.filter((verdict) => verdict.measurable);

  if (measurable.length === 0) {
    return total === 0
      ? "这套题库抽不出可判分的题，诊断做不了。先补题目。"
      : "还没答任何题，判不出层级。";
  }
  if (answered < total) {
    return `只答了 ${answered} / ${total} 题，结论不完整——先做完再判。`;
  }

  const weakest = measurable.reduce((min, verdict) =>
    verdict.reached < min.reached ? verdict : min,
  );
  const strong = measurable.filter(
    (verdict) => verdict.stoppedAt === null || verdict.stoppedAt.reason !== "wrong",
  );

  if (weakest.reached === 0) {
    return `最薄的一块是「${weakest.moduleName}」，第 1 层就没过。六块里没有一块能算稳，从基础上手。`;
  }
  if (strong.length === measurable.length) {
    return `六块都过了能测的层，最低到 ${weakest.reached} 层。这套卷子测不出更细的差别，改用整套模拟卷看分数。`;
  }
  return `最薄的一块是「${weakest.moduleName}」，连续答对到 ${weakest.reached} 层就断了。`;
}

/**
 * 把归因需要的材料整理成一份「只含答错的题」的清单。
 *
 * 只送错题，不送整卷：模型看 24 道题的全文只会产出一段泛泛的话；
 * 看 3—5 道错题 + 五层定义，才可能说出「你卡在把输入当成输出的那一步」这种具体的判断。
 */
export type WrongAnswerDetail = {
  moduleId: string;
  moduleName: string;
  level: Level;
  questionId: string;
  title: string;
  type: string;
  selected: string | null;
  correct: string | null;
  knowledgePointId: string | null;
  knowledgePointName: string | null;
};

export function collectWrongAnswers(
  inference: DiagnosticInference,
  paper: DiagnosticPaper,
  questionsById: Map<string, DiagnosticQuestion>,
  details: Map<
    string,
    {
      title: string;
      type: string;
      selected?: string | null;
      correct?: string | null;
      knowledgePointName?: string | null;
    }
  >,
): WrongAnswerDetail[] {
  const result: WrongAnswerDetail[] = [];

  for (const verdict of inference.modules) {
    for (const level of verdict.wrongLevels) {
      const item = paper.items.find(
        (candidate) => candidate.moduleId === verdict.moduleId && candidate.level === level,
      );
      if (!item) continue;

      const question = questionsById.get(item.questionId);
      const detail = details.get(item.questionId);
      result.push({
        moduleId: verdict.moduleId,
        moduleName: verdict.moduleName,
        level,
        questionId: item.questionId,
        title: detail?.title ?? question?.id ?? item.questionId,
        type: detail?.type ?? question?.type ?? "",
        selected: detail?.selected ?? null,
        correct: detail?.correct ?? null,
        knowledgePointId: question?.knowledge_point ?? null,
        knowledgePointName: detail?.knowledgePointName ?? null,
      });
    }
  }

  return result;
}

/** 存进 learning_diagnostics.result 的形状。字段名写全，方便以后换实现时仍能读老数据 */
export type DiagnosticResultPayload = {
  version: 1;
  takenAt: string;
  paperSize: number;
  answered: number;
  repeatedCount: number;
  gapCount: number;
  inference: {
    headline: string;
    modules: Array<{
      moduleId: string;
      moduleName: string;
      reached: Level | 0;
      passedLevels: Level[];
      stoppedAt: { level: Level; reason: StopReason } | null;
    }>;
  };
  /** 规则判出来的边界，原样留一份：模型的话可以改，这个改不了 */
  wrongAnswers: Array<{
    moduleId: string;
    level: Level;
    questionId: string;
    title: string;
  }>;
};
