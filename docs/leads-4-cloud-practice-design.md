# 线索 4 云端半边：题库模块 设计 + 任务清单（设计门）

日期：2026-09-28 晚。输入：`docs/leads-4-design-and-tasks.md` 第十一节（共享账号与域名，已核实落点 = 本仓库 codeX）。
状态：**设计门已确认（2026-09-28 晚），T8–T12 已实施，待合并到 main 并跑迁移后在线上验证**。

## 实施说明（与原草案的偏离）

- **数据访问不走独立 API 路由**：原 T9 计划新建 `/api/practice/*` 路由。实际改为**复用现有云模式约定**——页面是服务端组件用 `getSupabaseServerClient().auth.getClaims()` 做登录门，客户端组件用 `getSupabaseBrowserClient()` 直读 `practice_questions`、直写 `practice_attempts`，全部靠 Supabase RLS（`auth.uid()`）做行级隔离。原因：本仓库 `src/app/api/*` 现有路由都是**本地模式专用**（云模式直接拒绝），云模式的数据读写经 Supabase client 而非 API 路由，这是 `PromptLibrary`/`CloudPromptLibrary` 已经踩实的真实模式，照着做更一致、更安全。
- **导航入口**：在 `src/components/prompt-library.tsx` 的「更多」菜单（公共视图）加了"练习题库"入口，复用现有菜单样式，仅云端模式（`dataMode === "supabase"`）出现。

## 这份文档回答什么

1. 题库模块落在 codeX 的哪里、复用哪些现有能力。
2. 数据模型与鉴权怎么设计（沿用现有 per-user RLS）。
3. 任务顺序与每个任务改哪些文件。
4. 设计门要拍板的几个点。

不写实现步骤和成段代码——那些属于实施过程。

## 一、定位与复用清单（不重复造轮子）

题库半边 = **codeX（AI 开发资产管理系统）内的 `/practice` 功能模块**，复用现有：

| 复用项 | 现有实现 | 怎么复用 |
| --- | --- | --- |
| 账号体系 | `src/lib/supabase/{server,browser}.ts` + `getClaims()` + `password-auth-gate.tsx` | 模块页面用 `getSupabaseServerClient().auth.getClaims()` 判登录，未登录 `redirect('/login')`；沿用现有登录/会话，**不新建用户表** |
| 域名 | Vercel（`vercel.json`）现有域名 | 挂在 `/practice` 路由下，**无需新域名/证书** |
| 行级隔离 | `supabase/migrations/*` 全部 `user_id = auth.uid()` + `security invoker` | 成绩/答题记录按 `user_id` 隔离，照搬现有模式 |
| UI | Tailwind v4 + `lucide-react` + 现有 card/drawer 组件 | 题库页面沿用现有视觉与组件，不另起炉灶 |
| 内容渲染 | `react-markdown` + `remark-gfm`（已依赖） | 题目正文（markdown）直接渲染 |
| 导航 | 现有导航/菜单组件（实现时定位具体入口，如 `toolbar-more-menu.tsx`） | 加一个"练习"入口，复用现有菜单样式 |

关键：**题库内容与资产库打通**——题目可引用 `seed-packs/engineering-foundations/assets/` 里的规则/方法（如"事前验尸""红队""需求三格式"）作为知识点，做到"复用现有功能"。

## 二、数据模型（Supabase 迁移）

沿用现有"按用户隔离"约定（`security invoker` 函数 + `auth.uid()` 校验 + RLS）：

- `practice_questions`（系统题库，**全局可读**、仅系统写入）
  - `id text pk`、`asset_id text`（关联到资产库某条规则/方法，可空）、`category text`、`title text`、`body_md text`（markdown）、`options jsonb`、`answer text`、`explanation_md text`、`difficulty text`、`created_at timestamptz`
  - RLS：`authenticated` 可 `select`；`insert/update/delete` 仅通过迁移种子或管理通道（M0 不暴露写接口）。
- `practice_attempts`（答题记录，**仅本人可见**）
  - `id text pk`、`user_id uuid`、`question_id text`、`selected text`、`is_correct bool`、`created_at timestamptz`
  - RLS：`using (user_id = auth.uid())`；函数 `security invoker` 开头 `if auth.uid() is null raise '未登录'`（照搬 `set_asset_trash_state` 的写法）。

## 三、路由与接口

| 路由 | 文件（新增） | 说明 |
| --- | --- | --- |
| 练习首页 | `src/app/practice/page.tsx` | 服务端组件，`getClaims()` 判登录；列出题库分类与入口 |
| 做题页 | `src/app/practice/[id]/page.tsx` | 单题作答，提交调 API |
| 题库列表接口 | `src/app/api/practice/questions/route.ts` | `GET` 返回题目（不含答案）；靠 RLS 保护 |
| 答题记录接口 | `src/app/api/practice/attempts/route.ts` | `POST` 提交答案（写 `practice_attempts`）、`GET` 查本人记录 |

API 鉴权沿用现有模式——服务端用 `getSupabaseServerClient()` 读 cookie，靠 Supabase RLS（`auth.uid()`）做行级隔离；现有路由均如此，无需新增中间件。

## 四、任务顺序（T8 起，动文件前需设计门确认）

| 任务 | 改哪些文件 | 产出 | 前置 |
| --- | --- | --- | --- |
| T8 | `supabase/migrations/<ts>_add_practice.sql` | 建表 + RLS + 种子题目（首批从资产库规则映射若干题） | 设计门确认 |
| T9 | `src/app/api/practice/questions/route.ts`、`attempts/route.ts` | 题库与答题接口 | T8 |
| T10 | `src/app/practice/page.tsx`、`[id]/page.tsx` + 导航入口 | 练习页面 + 复用 auth gate | T9 |
| T11 | 种子题目补充（从资产库规则批量映射） | 题库内容填充 | T8 |
| T12 | `docs/acceptance/<ver>-practice.md` | 验收：登录可访问、题目可见、答题记录仅本人可见、域名一致 | T10 |

## 五、设计门要拍板

| # | 问题 | 我的建议 |
| --- | --- | --- |
| 1 | 题库内容来源：从资产库规则自动生成，还是手工录入？ | 首批手工录入 + 后续从 `assets/` 规则映射（复用现有功能） |
| 2 | 题目全局可见、成绩仅本人可见？ | 是，照搬现有 per-user RLS |
| 3 | 路由用 `/practice`？ | 是，挂在现有 Vercel 域名下 |
| 4 | 是否做"实操题从题库拉取并回传结果"联动？ | M0 不做，题库与实操先解耦（见 leads-4 第十节） |

## 六、与实操半边（intranet-drill）的边界

- 题库半边（云端、共享账号、域名一致）= 本仓库 codeX 内 `/practice` 模块。
- 实操半边（本机、模拟内网、不连公网）= `E:\intranet-drill` 独立仓库。
- 两半 M0 各自独立交付；后续联动（如实操题回传成绩）单独立项，不在 M0。

## 版本

- `0.1.0`（2026-09-28 晚）：首版设计草案，待设计门确认。
