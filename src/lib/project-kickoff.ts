// 立项与交付：按项目画像推荐该装哪些公共资产、生成立项提示词、
// 把项目现有的东西打包成一份「开发体系」文件交出去。
// 全部是纯逻辑，不碰数据库。

import type { AssetData } from "../data/assets.ts";
import { readQualityProfile } from "./quality-level.ts";
import { readDocumentStage } from "./document-flow.ts";

// 同一条资产在项目里可能已经有一份（复制过去的标识不一样），所以按「类型 + 标题」判断装没装过
export function isAlreadyInProject(input: {
  candidate: AssetData;
  projectAssets: AssetData[];
}) {
  return input.projectAssets.some(
    (asset) =>
      asset.assetType === input.candidate.assetType &&
      asset.title.trim() === input.candidate.title.trim(),
  );
}

export type AssetRecommendation = {
  asset: AssetData;
  reason: string;
};

// 推荐装进项目的公共资产：按质量等级该关注的规则方向 + 还没装过的模板和工程文档。
// 只给建议清单，不去重装已经有的，也不自动装。
export function listPublicAssetRecommendations(input: {
  assets: AssetData[];
  publicProjectId: string;
  projectId: string;
  level: unknown;
  limit?: number;
}): AssetRecommendation[] {
  const limit = input.limit ?? 12;
  const profile = readQualityProfile(input.level);
  const alive = input.assets.filter(
    (asset) => asset.deletedAt === null && asset.status === "active",
  );
  const projectAssets = alive.filter(
    (asset) => asset.projectId === input.projectId,
  );
  const publicAssets = alive.filter(
    (asset) => asset.projectId === input.publicProjectId,
  );
  const recommendations: AssetRecommendation[] = [];

  // 规则：优先挑「必须 / 禁止」和编译去向含 agents 的，它们是硬约束
  const rules = publicAssets
    .filter(
      (asset) =>
        asset.assetType === "rule" &&
        !isAlreadyInProject({ candidate: asset, projectAssets }),
    )
    .sort((left, right) => {
      const weight = (asset: AssetData) => {
        const type = (asset.metadata as { ruleType?: string }).ruleType;

        return type === "must" ? 0 : type === "forbidden" ? 1 : 2;
      };

      return weight(left) - weight(right);
    });

  for (const rule of rules.slice(0, Math.max(0, limit - 4))) {
    const ruleType = (rule.metadata as { ruleType?: string }).ruleType;

    recommendations.push({
      asset: rule,
      reason:
        ruleType === "must" || ruleType === "forbidden"
          ? "硬约束（必须／禁止），这个等级的项目建议一开始就装上"
          : `建议关注：${profile.ruleFocus[0] ?? "按等级要求的工程纪律"}`,
    });
  }

  // 模板：产物骨架，装进项目后规则编译能直接套
  for (const template of publicAssets.filter(
    (asset) =>
      asset.assetType === "template" &&
      !isAlreadyInProject({ candidate: asset, projectAssets }),
  )) {
    recommendations.push({
      asset: template,
      reason: "产物骨架，规则编译时可以直接套用",
    });
  }

  // 工程文档：按等级要求命中的那些（还没装的才推荐）
  const requiredTypes = new Set(
    profile.documents.map((key) => key),
  );
  const levelDocumentTypes = new Set(
    [...requiredTypes].map((key) => key),
  );

  for (const document of publicAssets.filter(
    (asset) =>
      asset.assetType === "document" &&
      !isAlreadyInProject({ candidate: asset, projectAssets }),
  )) {
    const documentType = (document.metadata as { documentType?: string })
      .documentType;
    const stage = readDocumentStage(documentType ?? "");

    // 只推荐方法级参考：项目自己的文档实例不该从公共库搬
    if (stage !== "other") {
      continue;
    }

    recommendations.push({
      asset: document,
      reason: `参考资料：这个等级要关注的 ${[...levelDocumentTypes].length} 类工程文档可以照着它写`,
    });
  }

  return recommendations.slice(0, limit);
}

export type KickoffPrompt = {
  key: "prd" | "spec" | "tech" | "acceptance";
  title: string;
  hint: string;
  prompt: string;
};

// 立项提示词包：把「这次要做什么」交给 AI，让它按四份产物分别产出。
// 复制给人贴给任意 AI 用，产品不调用 AI。
export function buildKickoffPrompts(input: {
  projectName: string;
  projectGoal: string;
  levelLabel: string;
  stack: Array<{ name: string; version?: string }>;
}): KickoffPrompt[] {
  const name = input.projectName.trim() || "未命名项目";
  const goal = input.projectGoal.trim() || "（还没写，先帮我问清楚）";
  const stack = input.stack
    .filter((entry) => entry.name.trim())
    .map((entry) =>
      entry.version?.trim()
        ? `${entry.name.trim()} ${entry.version.trim()}`
        : entry.name.trim(),
    )
    .join("、");
  const common = [
    `项目：${name}`,
    `项目说明：${goal}`,
    `质量等级：${input.levelLabel}`,
    stack ? `已定技术栈：${stack}` : "技术栈：还没定",
    "",
    "要求：先问我该问的问题（一次问完，等我回答），再产出；不要一次给多个方案让我挑；不要编造事实。",
  ].join("\n");

  return [
    {
      key: "prd",
      title: "① 需求（PRD）",
      hint: "为什么做、做什么、成功标准、不做什么",
      prompt: `${common}\n\n请产出一份轻量 PRD：\n1. 要解决的问题和给谁用；\n2. 这次做什么（按功能列，每条一句话）；\n3. 明确不做什么；\n4. 成功标准（能验证的指标或现象）；\n5. 上线前必须满足的条件。\n控制在两页以内。`,
    },
    {
      key: "spec",
      title: "② 实现规格（Spec）",
      hint: "这次具体怎么改：动哪些文件、数据怎么变、边界在哪",
      prompt: `${common}\n\n请产出一份实现规格（Spec）：\n1. 需求追溯：对应哪条需求、成功标准；\n2. 现状：现在怎么做的、涉及哪些文件和数据；\n3. 方案：改成什么样、为什么这么选；\n4. 数据结构与迁移：表和字段怎么变、老数据怎么办、怎么回滚；\n5. 接口与状态：输入输出和状态流转；\n6. 边界与错误：空值、超长、重复、并发各自怎么处理；\n7. 验收映射：每条验收条件怎么验；\n8. 风险与回滚。\n用自然语言写，不要贴整段代码。`,
    },
    {
      key: "tech",
      title: "③ 技术档案",
      hint: "这个项目用什么技术、禁用什么、偏离默认选型的理由",
      prompt: `${common}\n\n请产出一份技术档案：\n1. 先问清约束（用户量、数据敏感度、要不要自有服务器、预算、维护人力）；\n2. 技术栈清单，每行：技术名称 | 版本（不确定写「待定」） | 在这个项目里负责什么；\n3. 禁止项（这个项目不该引入什么）；\n4. 什么条件下才允许替换；\n5. 偏离默认选型的部分，说明理由（我会另写一条决策记录）。`,
    },
    {
      key: "acceptance",
      title: "④ 验收清单",
      hint: "每条需求怎么验、看到什么算对",
      prompt: `${common}\n\n请产出一份验收清单：\n1. 按需求逐条列，每条写：验收条件、手工验证步骤、预期结果；\n2. 标出哪些必须自动化测试挡住；\n3. 标出边界情况（空数据、超长、重复、并发）；\n4. 每条都要我能自己点一遍就能判定通过或失败。`,
    },
  ];
}

export type DeliveryPackFile = {
  fileName: string;
  section: string;
};

// 交付包：把项目现有的东西按「交给外部协作者」的顺序拼成一份文件。
// 不做打包压缩，一个文件、按小节分，最容易核对。
export function buildDeliveryPack(input: {
  projectName: string;
  projectGoal: string;
  levelLabel: string;
  stack: Array<{ name: string; version?: string }>;
  assets: AssetData[];
  projectId: string;
  now: string;
}): { fileName: string; content: string; files: DeliveryPackFile[] } {
  const alive = input.assets.filter(
    (asset) =>
      asset.projectId === input.projectId &&
      asset.deletedAt === null &&
      asset.status === "active",
  );
  const rules = alive.filter((asset) => asset.assetType === "rule");
  const documents = alive.filter((asset) => asset.assetType === "document");
  const templates = alive.filter((asset) => asset.assetType === "template");
  const stackLine = input.stack
    .filter((entry) => entry.name.trim())
    .map((entry) =>
      entry.version?.trim()
        ? `${entry.name.trim()} ${entry.version.trim()}`
        : entry.name.trim(),
    )
    .join("、");
  const sections: string[] = [
    `# ${input.projectName} · 开发体系包`,
    "",
    `> 导出时间：${input.now}`,
    `> 项目说明：${input.projectGoal.trim() || "（未填写）"}`,
    `> 质量等级：${input.levelLabel}`,
    `> 技术栈：${stackLine || "（未填写）"}`,
    "",
    "这份文件把项目当前生效的规则、文档和模板按顺序拼在一起，交给协作者时一次说清。",
  ];
  const files: DeliveryPackFile[] = [];

  if (rules.length > 0) {
    sections.push("", "---", "", "## 一、规则", "");
    for (const rule of rules) {
      sections.push(`### ${rule.title}`, "", rule.content.trim(), "");
      files.push({ fileName: rule.title, section: "规则" });
    }
  }

  if (documents.length > 0) {
    sections.push("", "---", "", "## 二、文档", "");
    for (const document of documents) {
      const documentType = (document.metadata as { documentType?: string })
        .documentType;
      sections.push(
        `### ${document.title}（${documentType ?? "未分类"}）`,
        "",
        document.content.trim(),
        "",
      );
      files.push({ fileName: document.title, section: "文档" });
    }
  }

  if (templates.length > 0) {
    sections.push("", "---", "", "## 三、模板", "");
    for (const template of templates) {
      const outputFileName = (
        template.metadata as { outputFileName?: string }
      ).outputFileName;
      sections.push(
        `### ${template.title}${outputFileName ? `（产物：${outputFileName}）` : ""}`,
        "",
        template.content.trim(),
        "",
      );
      files.push({ fileName: template.title, section: "模板" });
    }
  }

  const slug = input.projectName.replace(/[\\/:*?"<>|\s]+/g, "-") || "project";

  return {
    fileName: `${slug}-开发体系包.md`,
    content: sections.join("\n"),
    files,
  };
}
