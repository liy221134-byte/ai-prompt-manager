# 合并与线上验证计划（2026-09-28）

针对 codeX 仓库（AI 开发资产管理系统）当前待合并的 feature 分支，整理 PR 描述与上线后验证步骤。
本文件为**规划文档**；2026-09-29 已完成本地合并（**尚未推送**），执行记录与门禁结果见第七节。

---

## 一、分支总览

| 分支 | 状态 | 处理建议 |
| --- | --- | --- |
| `feat/v2.21.0-node-document-link` | 已合入 main（`--merged`） | 陈旧，可删 |
| `feat/v2.22.0-tech-context-filter` | 已合入 main | 陈旧，可删 |
| `feat/v2.23.0-local-mcp-setup` | 已合入 main | 陈旧，可删 |
| `feat/v2.24.0-project-scale-filter` | 已合入 main | 陈旧，可删 |
| `feat/v2.25.0-carrier` | 已合入 main（指向 `946ced8`） | 陈旧，可删 |
| `feat/leads-3` | ✅ **已合并**（2026-09-29，零冲突） | 本地已合入 main；未推送；未开 PR（个人项目，已拍板不开） |
| `feat/leads-4` | ✅ **已合并**（2026-09-29） | 同上；唯一冲突取 practice 定稿版，见第三节 |
| `feat/leads-4-practice` | ✅ **已合并**（2026-09-29，快进） | 同上；核心交付 |

> 5 个 `--merged` 分支只是历史残留，删除前确认团队无人在上面继续工作即可（`git branch -d <名>`）。删除不影响 main。

---

## 二、推荐合并顺序

```
main ──(FF)──> feat/leads-4-practice   // 已在 main HEAD 之上，快进，零冲突
   │
   ├─(merge)─> feat/leads-4            // 仅 1 处冲突（见第三节），其余干净
   │
   └─(merge)─> feat/leads-3            // 文档 + README 单行修正，main 未动该文件，干净
```

**理由**：
- `feat/leads-4-practice` 的基底就是当前 `main`（HEAD `d3a9731`），合并是快进，先把真正改代码的部分落定。
- `feat/leads-4` 与 `feat/leads-4-practice` 都新建了 `docs/leads-4-cloud-practice-design.md`，先合 practice（拿到"已确认/已实现"版），再合 leads-4 时只在这一个文件上冲突，保留 practice 版即可（leads-4 版是已被取代的草案）。
- `feat/leads-3` 与另两个分支改的文件互不重叠，最后合，零冲突。

---

## 三、合并冲突与解决（唯一一处）

**文件**：`docs/leads-4-cloud-practice-design.md`
- `feat/leads-4` 版：状态为“草案（待确认设计门）”，含原始 T9 计划（新建 `/api/practice/*` 路由）。
- `feat/leads-4-practice` 版：状态为“设计门已确认、T8–T12 已实施”，含**偏离说明**（实际复用浏览器 client 直读直写，不走独立 API 路由）。

**解决**：保留 `feat/leads-4-practice` 的版本（内容更完整、反映真实实现与设计门结论）。`leads-4` 的草案已作废。
2026-09-29 实际执行时用的是 `--ours`，**不是**上面这条命令：

```bash
git checkout --ours docs/leads-4-cloud-practice-design.md   # 取 main 侧 = practice 定稿版
git add docs/leads-4-cloud-practice-design.md
git commit   # 完成 merge
```

**原因是方向**：本文件的合并顺序是先合 practice（快进），所以执行到合 leads-4 时，main 侧
**已经含 practice 定稿版**；此时 `--ours` = main = 要保留的 practice 版，`--theirs` = leads-4 = 作废草案。
上面那句 `--theirs` 只在「先合 leads-4、后合 practice」的顺序下才成立。**取完必须核对内容**
（应为「设计门已确认…T8–T12 已实施」与「与原草案的偏离」两处），不能只看命令成功。

---

## 四、各分支 PR 描述（可直接复制）

### PR 1 · `feat/leads-4-practice` —— 练习题库模块（M0）

**标题**：`feat(leads-4): 云端练习题库模块——表+RLS+种子题 / 练习页 / 复用账号与导航`

**正文**：
```
## 概述
线索 4 云端半边：在 AI 开发资产管理系统内新增 /practice 练习题库模块，
复用现有 Supabase Auth 账号体系与现有 Vercel 域名，不新建用户表、不新建域名。

## 改动
- 新增 Supabase 迁移：public.practice_questions（题目，全局可读、仅迁移写入）
  + public.practice_attempts（答题记录，按 user_id 隔离），含 RLS 与 6 道种子题。
- 新增练习首页 src/app/practice/page.tsx（服务端 getClaims() 登录门，未登录 redirect /login）
  与做题页 src/app/practice/[id]/page.tsx。
- 新增客户端组件 practice-home.tsx / practice-question.tsx：
  浏览器 client 直读题目、直写答题，全部靠 RLS 隔离（复用现有云模式，非独立 API 路由）。
- 在 prompt-library.tsx 的「更多」菜单加“练习题库”入口（仅云端模式出现）。
- 设计门确认记录 + 验收清单（docs/acceptance/practice-m0.md）。

## 偏离（相对原始设计草案）
原 T9 计划新建 /api/practice/* 路由；实际改为复用现有云模式约定
（src/app/api/* 现有路由均为本地模式专用，云模式数据走 Supabase client），
与 PromptLibrary 已有模式一致，更安全。

## 验证
- 本机：tsc --noEmit 0 error；eslint 0 error。
- 待线上（见本仓库 merge-verify-plan）：先跑迁移建表+种子，再手动验登录可见 127 题、
  答题写入本人记录、换账号看不到他人记录。

## 关联
设计稿 docs/leads-4-cloud-practice-design.md；验收 docs/acceptance/practice-m0.md。
```

### PR 2 · `feat/leads-4` —— 线索 4 设计文档

**标题**：`docs(leads-4): 线索 4 设计稿 + 云端题库设计草案（设计门已确认）`

**正文**：
```
## 概述
线索 4（内网基础能力 / AI 练习系统）的整体设计稿，以及云端半边（题库模块）的设计草案。
核心结论：题库半边落在 codeX 内部 /practice 模块，复用现有账号体系与域名；
实操半边为独立仓库 E:\intranet-drill。两半 M0 各自独立交付。

## 改动
- docs/leads-4-design-and-tasks.md（线索 4 主设计 + 任务清单）
- docs/leads-4-cloud-practice-design.md（云端题库设计；实现后以 practice 分支版本为准，
  合并时保留该分支版本）

## 关联
PR 1（feat/leads-4-practice）实现本设计中的云端半边。
```

### PR 3 · `feat/leads-3` —— 线索 3 M0 设计 + 计数订正

**标题**：`docs(leads-3): 线索 3 M0 设计 + 任务清单；订正 S7 计数矛盾`

**正文**：
```
## 概述
线索 3（生态采集进资产库）M0 的设计与任务清单，并完成 S7 来源计数的订正：
19 个来源 / 已采 3 技能（4 条资产）/ 剩余 16 个待处置，定稿处置表。

## 改动
- docs/leads-3-design-and-tasks.md（M0 设计 + T1–T4 任务清单，设计门已确认）
- seed-packs/external-sources/README.md（订正 S7 行计数口径）

## 关联
后续 T2（台账补四字段）、T3/T4 逐次点头后实施。
```

---

## 五、线上验证步骤（核心：练习题库模块）

> 前提：本机 agent 无法连 Supabase，迁移与手验需你在有写权限的环境执行。

### Step 0 · 前置确认
- [ ] 已确认目标 Supabase 项目（与现网 AI 开发资产管理系统同一项目）。
- [ ] 拥有该项目的 SQL 执行权限（Dashboard SQL Editor）或本地已 `supabase link` 并登录。
- [ ] Vercel 部署：建议先发 PR 拿 Preview 部署验证，再合并到 main 触发生产部署。PR 预览也能验（云模式 + 同一 Supabase）。

### Step 1 · 执行迁移（二选一）
**方式 A — Supabase CLI（推荐，可复现）**
```bash
supabase link --project-ref <你的 project-ref>
supabase db push          # 把 migrations/20260928220000_add_practice.sql 推到远端
```
**方式 B — Dashboard SQL Editor**
1. 打开 Supabase 项目 → SQL Editor → New query。
2. 粘贴 `supabase/migrations/20260928220000_add_practice.sql` 全文。
3. Run。

**核对**：
```sql
select count(*) from public.practice_questions;   -- 期望 6
select count(*) from public.practice_attempts;    -- 期望 0
```

### Step 2 · 部署 / 访问
- PR 预览 URL 或生产域名，路径 `/practice`。
- 未登录访问 `/practice` 应跳 `/login`（已实现 `redirect("/login")`）。

### Step 3 · 手动验收清单
- [ ] 用现有账号登录 → 「更多 → 练习题库」进入 `/practice`，看到按分类分组的 127 题。
- [ ] 进入单题，选答案提交 → 页面显示正误 + 解析。
- [ ] 提交后查库：`select * from public.practice_attempts where user_id = '<本人 uuid>';` 应有 1 行，`is_correct` 正确。
- [ ] **隔离验证（关键）**：换第二个账号登录，确认看不到第一个账号的答题记录。
      严谨做法：以 service_role 查 `select count(*) from public.practice_attempts where user_id <> '<账号1 uuid>';`
      对账号2 而言 RLS 应使其读不到他人行；UI 上也只展示本人记录。
- [ ] 域名一致：路径挂在现有 Vercel 域名下，无新域名/证书。

### Step 4 · 回归
- [ ] 现有 prompt-library 页面（含「更多」菜单）功能正常，仅多了“练习题库”入口。
- [ ] 其余现有功能（本地模式/云端模式切换、登录登出）未受影响。

---

## 六、注意事项

1. **不擅自 push / merge**：以上合并由你或 Codex 复验后执行；本文件不触发任何 git 写操作。
2. **RLS 是硬约束**：`practice_attempts` 按 `user_id = auth.uid()` 隔离，上线前务必用两个账号验证隔离，防止成绩串号。
3. **陈旧分支清理**：5 个 `--merged` 分支可 `git branch -d` 删除（不影响 main）。
4. **intranet-drill 不在本批 PR 内**：它是独立仓库（`E:\intranet-drill`），其 T7 真验收卡在 Docker + WSL2，需你本地装 Docker 后手验，与 codeX 合并无关。
5. **leads-3 后续**：T2（台账补四字段）是纯文档活，可随时做；T3/T4 需逐次点头。

---

## 七、执行记录（2026-09-29，本地）

- **备份**：`git tag backup/pre-merge-20260929-main`（指向合并前 main `7c3e913`，可一键还原）。
- **合并**：① `feat/leads-4-practice` 快进 → main 到 `76f6b4f`；② `feat/leads-4` 合并提交
  `002abb8`（唯一冲突取 practice 定稿版，见第三节）；③ `feat/leads-3` 合并提交 `f80f5e9`（零冲突）。
  合并前三个分支都已与 main 对齐（落后 0），不存在「main 新增被显示成删除」的问题。
- **顺手修掉**：`scripts/sync-method-assets.ts` 的 `prefer-const`（`content` 收成 `readTextOrNull()`；
  `created` 本脚本恒为 0 改 const）——它是 main 上既有的 lint error，不修则 `npm run check` 卡死。
  提交 `76f6b4f`。
- **门禁（合并后的 main，在主工作树跑）**：lint 0 error（3 个既存 unused warning）、测试 549/549、
  `next build` 通过且 `/practice`、`/practice/[id]` 路由已产出。
  - 坑：**链接工作树跑不了 build**（junction 复用 node_modules，Turbopack 报
    `Symlink [project]/node_modules is invalid`），生产构建必须在主工作树 `E:\codeX项目` 跑。
- **已推送并与线上对齐（2026-09-29）**：产品负责人指示「合并后迁移部署把服务起起来」后，
  在主工作树跑完推送前门禁（`npm run check`：类型检查 0 error、测试 549/549、lint 0 error／3 个
  既存 warning、生产构建产出 `/practice` 与 `/practice/[id]`），再 `git push origin main`
  （`7c3e913..0365229`，17 个提交）。推送同时触发两条线上链路：Vercel 生产部署、
  Supabase GitHub 集成自动应用 `20260928220000_add_practice.sql`。
- **线上复验结果**：迁移已落地（`practice_questions` 127 行、`practice_attempts` 0 行）；匿名密钥
  读两张表均为 0 行（RLS 生效）；线上 `/practice` 307 跳 `/login`、`/login` 200。本机以云模式
  起服务后三项一致。生产库写入记录在 [数据库迁移](docs/operations/database-migrations.md)「事实记录」，
  验收口径在 [练习题库 M0 验收](docs/acceptance/practice-m0.md) 第四节。
- **仍未做**：① 两账号界面手验（需产品负责人登录态，agent 不代登录）；② 5 个陈旧 `--merged`
  分支删除（需点头）；③ v2.25.0 的 T6 跨仓库改动（需点头 + token）；④ 练习题库是否打版本号标签
  （待产品负责人拍板）。
