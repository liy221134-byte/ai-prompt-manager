// 线索 3 M1：跑一次外部来源资产的采集合规检查（SOP 四硬约束）。
//
// 只读：扫本机库 .data/prompts.sqlite，不改任何数据；可重复执行，跑两次结果一致。
// 云端模式不跑这个脚本（浏览器读不到库），M1 阶段它只在本地终端执行——
// 产品里的「运行采集合规检查」按钮只是提示入口，真实执行在这里。
//
// 用法：
//   npm run check:leads3-compliance
//
// 退出码：0 = 全部通过；1 = 有违规（方便接到别的检查里）。

import type { AssetData } from "../src/data/assets.ts";
import {
  checkExternalSourcesCompliance,
  complianceRuleLabels,
} from "../src/lib/external-sources-compliance.ts";
import { getPromptDatabase } from "../src/lib/server/prompt-database.ts";

const database = getPromptDatabase();
const assets = database.listAssets() as AssetData[];
const report = checkExternalSourcesCompliance(assets);
database.close();

console.log(`扫描外部来源资产：${report.checkedCount} 条`);

if (report.violations.length === 0) {
  console.log("✅ 全部通过：没有资产违反 SOP 四硬约束。");
  process.exitCode = 0;
} else {
  console.log(`❌ 发现 ${report.violations.length} 处违规：`);
  for (const violation of report.violations) {
    console.log(
      `  - [${complianceRuleLabels[violation.rule]}] ${violation.title}` +
        `（${violation.assetId}）：${violation.detail}`,
    );
  }
  process.exitCode = 1;
}
