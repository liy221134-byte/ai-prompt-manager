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

1. **题目来源**：合计 **127 题**，分三批录入。第一批 19 题（6 题工程方法映射资产库规则：事前验尸 `RULE-PREMORTEM-001`、红队 `RULE-REDTEAM-001`、需求三格式 `MTH-REQ-FORMAT-001`、设计计划 `RULE-DESIGN-TEMPLATE-LOOK-001`、界面文案 `RULE-DESIGN-COPY-001`、单一真相源；+ 13 题通用 aicoding 常识：代码常识/git/AI 编码/Agent/验证）。第二批 55 题对齐**豆包 aicoding 学习大纲**（技术素养/LLM 认知/方法论/工程化），按“细分知识点 2–3 道类似题”成组。第三批 53 题补齐豆包大纲未覆盖的学习点（JSON/数据类型、前端三件套、库框架SDK、部署与域名、RAG 与向量、Agent 与工具调用、模型与成本、Prompt 进阶、AI 安全伦理、缓存性能、AI 评测、系统化调试、产品与 AI 协作）。仅首批 6 题 `asset_id` 绑定资产规则，其余 121 题均为通用常识（`asset_id` 为 null）。
2. **题目全局可见、成绩仅本人可见**：照搬现有 per-user RLS，见上表 3/4。
3. **路由 `/practice`**：已落地。
4. **实操联动**：M0 不做（题库与实操先解耦），见 `docs/leads-4-design-and-tasks.md` 第十节。

## 三、已自动验证（本机）

- `tsc --noEmit`：**0 error**。
- `eslint`（新增/改动 5 个文件）：**0 error**。
- 说明：本机为链接工作树，依赖通过 junction 复用主工作树 `E:\codeX项目\node_modules`，用项目要求的 Node 24 运行。

## 四、线上验证

### 已验（2026-09-29，随 `main` 推送后由 Supabase GitHub 集成自动应用迁移）

| 项 | 实测 | 判定 |
| --- | --- | --- |
| 迁移已应用 | `practice_questions` 127 行（种子题全到齐）、`practice_attempts` 0 行 | ✅ |
| RLS 生效 | 用匿名密钥直读两张表，各返回 0 行（策略只授 `to authenticated`） | ✅ |
| 路由已部署 | 线上 `/practice` 返回 307 跳 `/login`，`/login` 返回 200 | ✅ |
| 本机同版本可跑 | `npm run dev` 起在 `localhost:3000`，`/`、`/practice` 均 307 跳 `/login`，运行时日志无错误 | ✅ |

生产库写入记录见 [数据库迁移](../operations/database-migrations.md) 的「事实记录」。

### 待产品负责人手验（需要登录态，agent 不代为登录）

1. 登录后从「更多 → 练习题库」进入 `/practice`，能看到按分类分组的 127 题；
2. 进入单题，选答案提交，页面显示正误 + 解析，且 `practice_attempts` 写入本人记录；
3. 换第二个账号登录，确认看不到前一个账号的答题记录（RLS 隔离的关键一项）。

## 五、偏离记录（与原始设计草案）

- **数据访问未走独立 API 路由**：原 T9 计划新建 `/api/practice/*`。实际改为复用本仓库现有云模式——客户端用 `getSupabaseBrowserClient()` 直读直写、靠 RLS 隔离。原因：`src/app/api/*` 现有路由都是本地模式专用（云模式直接拒绝），云模式数据读写经 Supabase client 而非自有路由，这是 `PromptLibrary` 已踩实的真实模式。详见设计稿「实施说明」。

## 六、范围外（M0 不做）

- 实操题从题库拉取并回传结果（与 `E:\intranet-drill` 的联动），单独立项。
- 题目从 `assets/` 规则批量自动映射，后续扩充。

## 七、练习模式增强（本次新增）

题库从“逐题点开”升级为内联练习流，配合成组题目实现“反复练到学会”：

- **入口（`practice-home.tsx`）**：分类浏览列表 + `全部随机练习` / `错题重练` / 每类`练习本类` / 单题直接开练。
- **练习流（`practice-quiz.tsx`）**：顺序答题，提交后写 `practice_attempts`（按 user_id 隔离）；答错显示解析并自动入“本轮错题本”，答错可`重做本题`重答、答对自动移出错题本；`同类随机再抽（2）`从同分类补 2 道随机题；结束给出本轮正确/错误统计 + 仍需巩固清单 + `重练错题`。
- `src/app/practice/[id]/page.tsx`（单题页）保留，仍可用于直接链接复核。

## 八、待线上验证补充（练习模式）

- 跑完迁移后，登录进入 `/practice`：点`全部随机练习`能顺序作答；故意答错 1 题，确认进入错题本、可`重做本题`、`同类随机再抽`；结束能看到统计与`重练错题`；另开账号或清记录后点`错题重练`，确认无错题时给出友好提示。
