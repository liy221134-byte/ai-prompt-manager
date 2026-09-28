# 验收：线索 4 云端半边 · 练习题库（M0）

日期：2026-09-28 晚。分支：`feat/leads-4-practice`。关联设计：`docs/leads-4-cloud-practice-design.md`。

## 一、验收项

| # | 验收点 | 预期 | 现状 |
| --- | --- | --- | --- |
| 1 | 复用账号体系 | `/practice` 走现有 Supabase Auth；无独立用户表、无独立登录 | ✅ 服务端 `getClaims()` 判登录，未登录 `redirect('/login')` |
| 2 | 域名一致 | 挂在现有 Vercel 域名下的 `/practice` 路由，不新建域名/证书 | ✅ 新增 `src/app/practice/page.tsx`、`[id]/page.tsx` |
| 3 | 题目全局可见 | 任意登录用户可读 `practice_questions` | ✅ RLS `Authenticated can read practice questions`（`using (true)`） |
| 4 | 成绩仅本人可见 | 用户只能读/写自己的 `practice_attempts` | ✅ RLS `using ((select auth.uid()) = user_id)` + `with check` |
| 5 | 复用现有功能 | 题目正文用 `MarkdownContent`（react-markdown）、入口复用 `ToolbarMoreMenu` | ✅ 客户端组件复用现有组件 |
| 6 | 不破坏编译 | typecheck / eslint 通过 | ✅ 见第三节 |

## 二、设计门拍板的 4 点（均已落地）

1. **题目来源**：首批 6 题手工录入，正文从资产库规则映射（事前验尸 `RULE-PREMORTEM-001`、红队 `RULE-REDTEAM-001`、需求三格式 `MTH-REQ-FORMAT-001`、设计计划 `RULE-DESIGN-TEMPLATE-LOOK-001`、界面文案 `RULE-DESIGN-COPY-001`、单一真相源）。
2. **题目全局可见、成绩仅本人可见**：照搬现有 per-user RLS，见上表 3/4。
3. **路由 `/practice`**：已落地。
4. **实操联动**：M0 不做（题库与实操先解耦），见 `docs/leads-4-design-and-tasks.md` 第十节。

## 三、已自动验证（本机）

- `tsc --noEmit`：**0 error**。
- `eslint`（新增/改动 5 个文件）：**0 error**。
- 说明：本机为链接工作树，依赖通过 junction 复用主工作树 `E:\codeX项目\node_modules`，用项目要求的 Node 24 运行。

## 四、待线上验证（需先跑迁移，本机无法代跑）

1. **应用迁移**：在 Supabase 项目执行 `supabase/migrations/20260928220000_add_practice.sql`（或 `supabase db push`），建表 + RLS + 种子 6 题。
2. **手动验**：
   - 登录后从「更多 → 练习题库」进入 `/practice`，能看到按分类分组的 6 题；
   - 进入单题，选答案提交，页面显示正误 + 解析，且 `practice_attempts` 写入本人记录；
   - 换一个账号登录，确认看不到前一个账号的答题记录（验证 RLS 隔离）。

## 五、偏离记录（与原始设计草案）

- **数据访问未走独立 API 路由**：原 T9 计划新建 `/api/practice/*`。实际改为复用本仓库现有云模式——客户端用 `getSupabaseBrowserClient()` 直读直写、靠 RLS 隔离。原因：`src/app/api/*` 现有路由都是本地模式专用（云模式直接拒绝），云模式数据读写经 Supabase client 而非自有路由，这是 `PromptLibrary` 已踩实的真实模式。详见设计稿「实施说明」。

## 六、范围外（M0 不做）

- 实操题从题库拉取并回传结果（与 `E:\intranet-drill` 的联动），单独立项。
- 题目从 `assets/` 规则批量自动映射，后续扩充。
