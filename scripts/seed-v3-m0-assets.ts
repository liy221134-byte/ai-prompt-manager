// 零代码交付线 M0（2026-09-30）：把「环境交付清单」和「部署/回滚手册模板」两条资产
// 一次性种进公共资产库（default-project）。
//
// 这两条资产是 M0 的载体（见 docs/superpowers/specs/2026-09-30-v3-m0-design-and-tasks.md）：
//   - 环境交付清单 → rule 形态，覆盖草案第三节断点清单的 7 个环节，每项带勾选标准与卡点记录位
//   - 部署/回滚手册 → template 形态，含环境档案/部署/回滚/验证/排查五段，留占位符
//
// 来源标 manual（本产品出品，不是外部采集，不走台账落库命令）；状态 draft（M0 是起点，
// 等真实交付跑过再升 active）。脚本可重复执行：同 ID 已存在则跳过，第二遍 0 新增。
//
// 用法：
//   npm run seed:v3-m0 -- --dry-run    只列清单，不写库
//   npm run seed:v3-m0                 真写（落本地主库，之后 npm run sync --push 推云端）
//
// 写库目标由 PROMPT_DB_PATH 决定；不传则用 .data/prompts.sqlite（本机主库）。

import { resolve } from "node:path";

import {
  createInitialAssetVersionId,
  isAssetData,
  type AssetData,
  type RuleAssetData,
  type TemplateAssetData,
} from "../src/data/assets.ts";
import { DEFAULT_PROJECT_ID } from "../src/data/projects.ts";
import { getPromptDatabase } from "../src/lib/server/prompt-database.ts";

const projectRoot = resolve(import.meta.dirname, "..");
const dryRun = process.argv.includes("--dry-run");

const now = new Date().toISOString();

// —— 资产一：环境交付清单（rule） ——
// 覆盖 v3 草案第三节断点清单的 7 个环节。每条给「勾选标准」与「卡点记录位」。
const deliveryChecklistContent = `# 环境交付清单（零代码交付线 M0）

本清单是「真实环境交付」的通用勾选底稿，覆盖从登记到排查的 7 个环节。
**用法**：每接一个真实交付项目，复制本清单，逐条要么勾选、要么在「卡点」处记下来——
强行勾的环节不算过。所有勾不了 / 卡住的，汇总进待办，标注「值得做成代码 / 永远手工」，
作为 M1–M3 的设计输入（见 M0 设计稿第四节 T4）。

> 既定约束（写死，后面段沿用）：数据库 **MySQL 与 PostgreSQL 双库都做**；
> 部署目标限**大陆边上的云**（阿里云 / 腾讯云 / 华为云 / 浪潮云等国内可达 RDS），不走境外。

---

## 1. 环境信息登记
- [ ] 客户/项目名、环境（开发/测试/生产）已登记
- [ ] 服务器入口方式已确认：直连 SSH / 堡垒机 / 网闸摆渡（决定部署走「推」还是「拉」）
- [ ] 代码仓库已确认：Gitea / GitLab / 其他（决定 CI 模板怎么写）
- [ ] 操作系统、架构、可用端口、磁盘余量已记录
- [ ] 访问账号与权限边界已留痕（不在聊天记录里传明文密码）
- **卡点记录位**：________________________________

## 2. 部署动作单
- [ ] 制品来源已定：本机构建产物 / 第三方包 / 源码现场构建
- [ ] 部署步骤已写成有序清单（含每条命令与预期输出）
- [ ] 配置文件来源已确认：环境变量 / 配置中心 / 手工下发
- [ ] 启动顺序与依赖就绪检查已列清（数据库先于应用、缓存先于读写）
- [ ] 健康探针 / 就绪探针已配置
- **卡点记录位**：________________________________

## 3. 数据库迁移（MySQL / PostgreSQL 双库）
- [ ] 目标库类型与版本已确认（MySQL ? / PostgreSQL ? / 两者）
- [ ] 迁移脚本已就绪，且区分「结构变更」与「数据变更」
- [ ] 已对生产库**先备份再迁移**（备份位置与可恢复性已验证）
- [ ] 迁移可逆：回滚脚本与正向脚本成对存在
- [ ] 大表/长事务有分批方案，避免锁表拖垮业务
- [ ] 字符集、时区、大小写敏感等隐性差异已核对（MySQL 与 PG 差异点）
- **卡点记录位**：________________________________

## 4. 回滚预案
- [ ] 回滚触发条件已写清（哪些信号出现就回退）
- [ ] 回滚步骤已排序：关流量 → 回退应用 → 回退数据（或放弃数据回退）
- [ ] 回滚时长预期已估，且业务方已知会
- [ ] 回滚后的数据一致性校验步骤已列
- **卡点记录位**：________________________________

## 5. 内网摆渡清单
- [ ] 若走网闸：摆渡文件清单、 Hash 校验值、摆渡方向已确认
- [ ] 摆渡介质（光盘/专用 U 盘/单向网闸）已按客户规定准备
- [ ] 入网前病毒查杀 / 合规扫描步骤已列
- [ ] 摆渡失败的重试与人工兜底路径已写
- **卡点记录位**：________________________________

## 6. 部署后验证
- [ ] 核心链路冒烟用例已跑（登录、主流程读写、关键接口）
- [ ] 外部依赖连通性已验证（数据库 / 缓存 / 第三方）
- [ ] 日志与监控已确认有输出、无报错刷屏
- [ ] 验收证据链可挂（引用验收标准或证据资产）
- **卡点记录位**：________________________________

## 7. 出故障排查
- [ ] 常用排查入口已列：日志位置、进程状态、端口监听、资源占用
- [ ] 已知坑与对应解法已沉淀（本次交付踩过的写在这里）
- [ ] 升级路径已写：谁、走什么渠道、什么级别拉人
- **卡点记录位**：________________________________
`;

const deliveryChecklistAsset: RuleAssetData = {
  id: "rule-delivery-checklist-v3m0",
  projectId: DEFAULT_PROJECT_ID,
  assetType: "rule",
  title: "环境交付清单（零代码交付线 M0）",
  summary:
    "真实环境交付的通用勾选底稿：7 个环节（登记/部署/迁移/回滚/摆渡/验证/排查），每条带勾选标准与卡点记录位。",
  content: deliveryChecklistContent,
  metadata: {
    ruleType: "process",
    scope: "global",
    purpose:
      "把已有资产第一次接到真实环境交付链路，跑通一次，回收值得做成代码的卡点（M0 设计稿）。",
    confidence: "provisional",
    lifecycle: "draft",
    techContext: ["MySQL", "PostgreSQL", "大陆边上的云（阿里/腾讯/华为/浪潮 RDS）"],
    rationale:
      "零代码交付线 M0 的载体之一；用现有规则包机制装一份交付清单，不写代码，等真实项目跑过再升 active。",
    relations: [],
  },
  source: {
    sourceType: "manual",
    sourceAssetId: null,
    importBatchId: null,
    originalFilename: null,
  },
  currentVersionId: createInitialAssetVersionId("rule-delivery-checklist-v3m0"),
  status: "draft",
  archivedAt: null,
  deletedAt: null,
  deletedReason: null,
  createdAt: now,
  updatedAt: now,
};

// —— 资产二：部署/回滚手册模板（template） ——
// 五段式，留占位符，实战时填真实值。
const handbookTemplateContent = `# 部署 / 回滚手册：{{项目名称}}

> 本手册由「部署/回滚手册模板」（零代码交付线 M0）生成。把 {{占位符}} 换成真实值即可。
> 配套勾选底稿见资产「环境交付清单（零代码交付线 M0）」。

## 一、环境档案
- 客户 / 项目：{{客户名}} / {{项目名}}
- 环境：{{开发 / 测试 / 生产}}
- 服务器入口：{{直连 SSH / 堡垒机 / 网闸摆渡}}
- 代码仓库：{{Gitea / GitLab / 其他}}，分支：{{部署分支}}
- 操作系统 / 架构：{{OS}} / {{arch}}
- 数据库：{{MySQL X.Y / PostgreSQL X.Y / 两者}}

## 二、部署步骤
1. 备份：{{备份命令与目标位置}}
2. 取制品：{{来源与路径}}
3. 下发配置：{{配置来源}}
4. 启动顺序：{{先数据库后应用，依赖就绪检查}}
5. 探活：{{健康探针 / 就绪检查命令}}

## 三、回滚步骤
- 触发条件：{{哪些信号出现就回退}}
- 顺序：关流量 → 回退应用（{{命令}}）→ 回退数据（{{回滚脚本}}或放弃）
- 预期时长：{{分钟}}，业务方已知会
- 回滚后校验：{{一致性检查步骤}}

## 四、验证
- 冒烟用例：{{登录 / 主流程读写 / 关键接口}}
- 外部依赖：{{数据库 / 缓存 / 第三方连通性}}
- 日志监控：{{位置}}，确认无报错刷屏
- 验收证据：{{引用验收标准或证据资产 ID}}

## 五、排查
- 日志：{{路径}}
- 进程 / 端口：{{查看命令}}
- 已知坑：{{本次踩过的与解法}}
- 升级路径：{{谁 / 渠道 / 级别}}
`;

const handbookTemplateAsset: TemplateAssetData = {
  id: "template-deploy-rollback-handbook-v3m0",
  projectId: DEFAULT_PROJECT_ID,
  assetType: "template",
  title: "部署/回滚手册模板（零代码交付线 M0）",
  summary:
    "五段式交付手册模板：环境档案 / 部署 / 回滚 / 验证 / 排查，留 {{占位符}}，实战时填真实值。",
  content: handbookTemplateContent,
  metadata: {
    outputFileName: "部署回滚手册.md",
    note: "配套使用「环境交付清单（零代码交付线 M0）」逐条勾选；占位符 {{}} 实战时替换。",
    relations: [],
  },
  source: {
    sourceType: "manual",
    sourceAssetId: null,
    importBatchId: null,
    originalFilename: null,
  },
  currentVersionId: createInitialAssetVersionId(
    "template-deploy-rollback-handbook-v3m0",
  ),
  status: "draft",
  archivedAt: null,
  deletedAt: null,
  deletedReason: null,
  createdAt: now,
  updatedAt: now,
};

const assets: AssetData[] = [deliveryChecklistAsset, handbookTemplateAsset];

const database = getPromptDatabase();
const existing = database.listAssets() as AssetData[];
const existingIds = new Set(existing.map((asset) => asset.id));

console.log(
  `${dryRun ? "空跑（不写库）" : "写入本机库"}：M0 资产 ${assets.length} 条`,
);
console.log(`  当前库资产总数：${existing.length}`);

let 新增 = 0;
let 跳过 = 0;

for (const asset of assets) {
  if (!isAssetData(asset)) {
    throw new Error(`资产结构不合法，已拦下：${asset.id}（${asset.title}）`);
  }

  if (existingIds.has(asset.id)) {
    跳过 += 1;
    console.log(`  跳过（已存在）：${asset.id}｜${asset.title}`);
    continue;
  }

  if (dryRun) {
    新增 += 1;
    console.log(`  [空跑] ${asset.id}｜${asset.assetType}｜${asset.title}`);
    continue;
  }

  const created = database.createAsset({
    asset,
    versionId: asset.currentVersionId,
    changeReason: "零代码交付线 M0 播种：环境交付清单 + 部署/回滚手册模板",
  });

  if (!created) {
    跳过 += 1;
    console.log(`  跳过（写入被拒）：${asset.id}｜${asset.title}`);
    continue;
  }

  新增 += 1;
  console.log(`  已建 ${asset.id}｜${asset.assetType}｜${asset.title}`);
}

console.log(`\n完成：新增 ${新增}，跳过 ${跳过}`);
console.log(
  dryRun
    ? "（空跑结束，未改动库）"
    : "已写本机主库。要进产品界面：在 E:/codeX项目 跑 `npm run sync --push` 推云端。",
);

if (!dryRun) {
  database.close();
}
