# 数据库迁移

## 当前状态

- 迁移文件保存在 `supabase/migrations/`，优先使用 `supabase migration new` 生成的
  时间戳文件名，例如 `20260921054052_add_project_asset_foundation.sql`。
- `supabase/config.toml` 已加入仓库，`project_id` 指向远程项目，供命令行和 GitHub
  集成使用。
- 当前仓库的迁移顺序如下：

```text
202609180001  create_prompts
202609200001  add_prompt_merge_trash
202609200002  document_prompt_lifecycle
202609210001  add_prompt_optimize
20260921054052 add_project_asset_foundation
20260921120000 add_asset_prompt_storage
20260922040501 add_source_package_storage
20260923150000 add_project_risk_level
20260928220000 add_practice
20260929000000 add_practice_type
```

`add_project_asset_foundation` 属于 2.0.0，`add_asset_prompt_storage` 属于 2.1.0，
后者只新增统一资产上的原子操作函数（进垃圾箱、合并提交、恢复合并、优化提交、回到优化前、
清空垃圾箱），不改表结构，也不删除 2.0.0 的旧函数，保证回滚到旧代码时仍然可用。

`add_practice` 属于线索 4 云端半边（练习题库），只新增两张表，不动现有表；
`add_practice_type` 是题库的交互优化，给 `practice_questions` 加一个 `type` 列（题型），
同样只增不改。

十条迁移已全部应用到线上，迁移历史与仓库一致，没有待应用的迁移。

## 三种执行方式

| 方式 | 谁执行 | 说明 |
| --- | --- | --- |
| Supabase CLI + 数据库密码（当前可用） | Codex 直接执行 | `migration list --db-url` 看历史、`db push --db-url` 应用、`db lint --db-url` 检查函数。连接串里的密码必须 URL 编码；不需要个人访问令牌 |
| Supabase MCP（2026-09-24 起可用） | Codex 执行，写生产库前要先得到同意 | 会话里连上 MCP 就不需要密码，能直接查结构、读日志、应用迁移。2026-09-24 重新授权后连上（29 个工具），写权限保留，约束见下面「生产库写入约定」 |
| GitHub 集成自动部署（已开启并验证） | Supabase 自动执行 | 推送到 `main` 自动应用新迁移。2026-09-20 用一条真实迁移验证过：推送后无需任何人工操作，Supabase 自动执行并写入历史表 |

## 新增一条迁移的步骤

1. 使用 `supabase migration new <描述>` 新建迁移文件，不要手工编造时间戳。
2. 使用可重复执行的写法：`create table if not exists`、`add column if not exists`、
   `create or replace function`、`drop policy if exists` 之后再 `create policy`。
3. 先在真实 Postgres 上把整条迁移链跑一遍：确认能执行、能重复执行、回填结果对得上，
   并真的调用一次新增的函数。只检查迁移文件文本会漏掉类型和字段名这类错误。
   这一步已经固化成 `tests/supabase-migration-postgres.test.mjs`（用 `@electric-sql/pglite`
   起一个真实 Postgres，随 `npm test` 一起跑），改完迁移直接跑测试即可。
4. 应用到远程（用 `db push --db-url`），确认迁移历史表里出现对应版本。
5. 跑 `db lint --db-url` 和安全项检查（行级安全、函数权限、`search_path`、外键索引），
   确认没有新增问题。
6. 同步更新 `docs/database-schema.md`。
7. 提交并推送。

## 生产库写入约定

MCP、数据库密码和 GitHub 自动部署都能改生产库，所以约束不在工具，在流程：
**改之前先在对话里拿到同意，改完留一条记录**。

- 同意要具体到这一次改动：改哪个对象（表／字段／函数／数据）、为什么改、影响范围、
  怎么回滚。含糊一句「你看着办」不算同意。
- 动手前先做一次只读核对（现状、影响行数）；能先在本地库或副本上跑通的，先在副本上跑。
- 一次改动记一条，写在本文件的「事实记录」里，字段是：日期、改了什么（对象 + SQL 摘要）、
  为什么、谁同意、怎么回滚、验完的结果。
- 改动要进代码的，照旧走迁移流程（新增迁移文件 + 提交），记录里写明对应的迁移版本号。
- 一次性数据修正（没有迁移文件的那种）同样要记录，并说明为什么没写成迁移。

## 注意事项

- 已经发布过的迁移文件不要再改内容。需要调整时新增一条迁移，保持历史可追溯。
- 远程历史表是 `supabase_migrations.schema_migrations`，版本号必须与文件名的时间戳
  前缀一致，否则自动部署会重复执行旧迁移。
- 生产部署只应用迁移，以及 `config.toml` 里声明的 Edge Functions 和 Storage
  buckets；Auth、API 等配置不会被覆盖。
- 迁移历史原本为空（早期迁移是手工在 SQL Editor 执行的），已于 2026-09-20 对齐。
- GitHub 自动部署已在 2026-09-20 开启，并用 `202609200002_document_prompt_lifecycle.sql` 验证通过：推送后 Supabase 自动执行迁移并记录历史，全程没有人工操作。

## 事实记录

- 2026-09-29（第三次写入）：**应用 `20260929000000_add_practice_type.sql`**（随 `main` 推送由
  Supabase GitHub 集成自动执行）。对应提交 `5121e8e`（迁移文件本身在 `73692f8`）。
  改了什么：`public.practice_questions` 新增 `type text not null default '单选'`（现有 127 题
  按默认值全部归为「单选」）+ 索引 `practice_questions_type_idx(type, category)` +
  **新增 8 道样例题**（多选 3 / 判断 3 / 实操 2，`on conflict (id) do nothing`）。
  **不改动任何现有题目、不改 `practice_attempts`、不动 RLS。**
  为什么要写：题库交互优化需要「习题类型」这一筛选维度，且要有各档样例题撑起来。
  谁同意：产品负责人 2026-09-29 在对话里指示「合并推送部署」，即本次改动。
  怎么回滚：`delete from public.practice_questions where id in ('pq-eng-multi-01','pq-web-multi-01',
  'pq-aicoding-multi-01','pq-git-judge-01','pq-sec-judge-01','pq-db-judge-01',
  'pq-term-practice-01','pq-fe-practice-01');` 然后
  `drop index if exists public.practice_questions_type_idx;`
  `alter table public.practice_questions drop column if exists type;`
  验完的结果（只读核对）：`practice_questions` 共 **135** 行，题型分布 **单选 127 / 多选 3 /
  判断 3 / 实操 2**；8 道样例题按 id 逐一命中、题型正确。
- 2026-09-29：**应用 `20260928220000_add_practice.sql`**（随 `main` 推送由 Supabase GitHub 集成自动执行，
  非人工在控制台执行）。对应提交 `0365229`（迁移文件本身在 `705ac99`、缺陷修复在 `6095615`）。
  改了什么：新增 `public.practice_questions`（题库，全局可读、终端用户无写权限）与
  `public.practice_attempts`（答题记录，按 `auth.uid() = user_id` 隔离）两张表 + RLS 策略
  + 索引 + 127 条种子题。**没有改动任何现有表、字段或数据。**
  为什么要写：线索 4 云端半边（练习题库 M0）的建表与种子，验收清单见
  `docs/acceptance/practice-m0.md`。
  谁同意：产品负责人 2026-09-29 在对话里指示「合并后迁移部署把服务起起来」，即本次改动；
  迁移内容是纯新增，不触碰既有资产库数据。
  怎么回滚：`drop table if exists public.practice_attempts;`
  `drop table if exists public.practice_questions;`（只丢练习记录与题库，现有资产库不受影响）。
  验完的结果（只读核对，service role 直连 REST）：`practice_questions` 127 行、
  `practice_attempts` 0 行；匿名密钥两张表都读到 0 行（策略为 `to authenticated`，RLS 生效）。
  本次只核对数据库这一半：Supabase 的 GitHub 集成与 Vercel 是两条独立链路，
  **同一次推送里前者成功、后者自 2026-09-28 起持续失败**，所以前端 `/practice` 还没上线。
- 2026-09-25（第二次写入）：**v2.20.0 部署后的线上复验**。产品负责人签字并同意自动部署，
  部署完成后做了最小复验，只读核对 + 一次挑资产。
  改了什么：新建复验项目 `复验-可归档-2026-09-25`
  (`project-48c7fb00-8e0f-4e70-8f5c-f54636665e04`)，从公共资产库挑两条规则
  （`rule-mth-req-001`、`rule-mth-reference-001`），然后把这个项目改为「已归档」。
  为什么要写：修好的那条链路（挑规则进项目）只在本地副本上验过，需要在生产上确认一次。
  核对结果：
  1. 复验项目里规则 2 条、各带「公共库」角标——以前这里是 0 条，修复生效。
  2. **公共资产库一条没多**（提示词 19、规则 29 活跃、参考文档 14、模板 17、规则包 2），
     说明新版不再复制副本，方案 2 落地正确。
  3. 项目的引用记录里 `referencedAssetIds` 正确记了两个资产标识，状态 `active`。
  回滚方式：项目用界面的「重新激活」；不需要动资产状态（这次没有新建公共库资产）。
- 2026-09-25：**线上写库自测的残留按产品负责人决定归档**（不删除，归档后资产和历史记录都保留）。
  自测在测试项目「自测-可删-2026-09-25」(`project-2689918e-1a6e-4ae5-9e24-b3041ab624e6`)
  上做了「从公共资产库挑资产、导入文档、批量挂文档、装推荐、提升为公共资产」五件事，
  经产品负责人同意。自测本身还用**只读**方式核对过一次云端库数据。
  改了什么：
  1. 测试项目：`projects.status` 改 `archived`（走产品的「项目设置 → 归档项目」，会记归档时间）。
  2. 公共资产库多出来的 11 条：`rule-pack-public-library`（挑资产时现攒的包）、
     7 条规则副本、4 个模板副本、1 份「自测-导入文档」副本，
     `assets.status` 改 `archived` + 写 `archived_at`。走的是带 service role 的 REST 接口，
     所以这一步**没有**产生资产版本记录（这 11 条本来就是测试副产物）。
  3. 一条真实的版本记录：测试项目里那份文档被「提升为公共资产」时，
     在测试项目那条上加了「同源」关系；该资产随测试项目一起归档，没有单独改。
  核对：公共资产库回到自测前的口径——提示词 19、规则 29（活跃）、参考文档 14、模板 17、规则包 2，
  合计 81 条；归档的 11 条仍在库里，状态改回活跃即可恢复。
  回滚方式：把上述 11 条的 `status` 改回 `active`、`archived_at` 置空；
  测试项目用产品界面的「重新激活」。
  （这次是数据状态变更，不是结构迁移，所以迁移历史条数没变。）
- 2026-09-24（第四次写入）：**新增一条模板资产到云端**（需求 F4，产品负责人确认
  「把 Spec 模板落进公共模板层」）。
  内容：`实现规格（Spec）`（`template-ec8963af-…`），进默认项目（公共资产库），
  产物文件名 `implementation-spec.md`，正文取自仓库 `templates/engineering/implementation-spec.md`。
  做法：写之前先用产品自己的 `isAssetData` 校验过这一条，再按 `assets` + `asset_versions`
  两张表写入（service role；`save_asset` RPC 依赖 `auth.uid()`，脚本里没有登录会话）。
  核对：云端模板从 9 条变 10 条，资产总数 79 → 80，读回的字段和本地一致。
  回滚方式：删掉这一条资产和它对应的版本行（`asset-…` 与 `current-…` 两条）。
- 2026-09-24（第三次写入）：**归位模板类资产**（需求 F3，产品负责人确认）。
  5 条资产的 `documentType` 是「模板」（技术档案模板 ×3、验收证据链 ×2，分布在默认项目、
  科创平台2.0、CICD自动部署工具、AI提示词资产管理系统），它们本该是「模板」类型，
  却挂在文档类型下——这就是「文档和模板两个页签看着像在维护同一批内容」的根源。
  改动：`asset_type: document → template`，`metadata_json` 去掉 `documentType`、
  补 `outputFileName`（`<标题>.md`）和 `note`；对应的 `asset_versions` 同步改。
  本机库与云端库各做一次。核对：两边「文档里 documentType=模板」都是 0 条，模板资产都是 9 条。
  回滚方式：把 `asset_type` 改回 `document`，元数据去掉 outputFileName／note、
  补回 `documentType: 模板`；本机可用 `scripts/migrate-document-templates.mjs --dry-run`
  先看会动哪几条。
- 2026-09-24（第二次写入）：**修正**线上一条字段不合法的资产，经产品负责人确认。
  资产 `rule-sample-001`（项目「CICD自动化部署工具」）是当天测试示例规则包时写进去的，
  `stage` 和 `priority` 取了产品不认识的取值，这一行读不出来，当时还会把整个资产列表拖挂。
  改动：`assets.metadata_json` 与对应 `asset_versions.metadata_json` 两处，
  `stage: build → implement`、`priority: p1 → should`，其余字段一个没动。
  核对：改动前全库 1 条不合法规则、1 条不合法版本；改动后各 0 条（79 条资产逐一过校验）。
  回滚方式：把那两个值改回 `build` / `p1`（不建议——改回去这一行又读不出来）。
  配套代码改动：读云端资产时跳过读不出来的行并留告警，所以以后即使再出现类似数据，
  也不会拖挂整个列表。
- 2026-09-24：Supabase MCP 通道恢复。原 OAuth 令牌已过期且刷新失败，改用桌面版自带的
  Codex CLI 重新授权（PATH 里的 npm 版 0.156.1 在动态注册这一步被 Supabase 拒绝，走它
  拿不到授权链接）。恢复后只读核对：线上迁移历史 8 条，与 `supabase/migrations/` 的
  8 个文件版本号和名称完全一致，没有多出或缺失。这次只查询，没有改结构和数据。
- 2026-09-23：`add_project_risk_level` 随 2.8.0 推送到 `main`，由 GitHub 集成自动应用到线上；
  用只读接口核对线上 `projects` 已存在 `risk_level`（老项目值为 `personal`）。
  同一天顺带核对：早先的 `add_source_package_storage` 也已生效（私有桶 `source-packages`
  存在，file_size_limit 20 MB，public=false）。
- 2026-09-22：`add_project_asset_foundation` 与 `add_asset_prompt_storage` 应用到线上，
  迁移历史现有 6 条。应用前在真实 Postgres 17 上完整执行过一遍，发现并修好了 2.0.0
  迁移里的两处错误：
  1. 回填版本记录时引用了云端不存在的 `source_prompt_ids_json`——那是本地 SQLite 的列名，
     云端 `prompt_versions` 用的是 `source_prompt_ids text[]`。
  2. 回填默认项目时 `select distinct` 列表里的裸 `null` 被推断成 `text`，写入
     `timestamptz` 列直接报类型错误。

  这两处原先被一条内容检查测试锁住（断言迁移文件里必须出现 `source_prompt_ids_json`），
  已一并修正。应用后核对结果：老表 9 条提示词全部回填为 9 个资产和 14 条版本，标题、
  正文、垃圾箱状态逐条一致；`db lint` 无结果；旧提示词表两行未改，旧函数全部保留。

- 2026-09-30（**本机库，不是生产库**）：**批量把 29 条外部来源规则从 `active` 降回 `pending`**。
  对象：`.data/prompts.sqlite` 的 `assets`（`asset_type='rule'`），每条另写一条 `asset_versions`。
  改了什么：只改 `status`（active → pending）和 `updated_at`，外加一条版本记录；
  **不碰标题、正文、元数据，不删任何行。** 名单由 `src/lib/external-sources-compliance.ts`
  的 `planAutoActiveDowngrade` 判定：外部来源规则 + 状态为 active + 没有人工确认记录。
  为什么：打包器曾经把种子包里的每个成员都写成 active（源文件标的 candidate 从来没生效），
  绕过了 SOP 第 4 条「未经人工确认不许升 active」。打包口径已在 v2.29.0 修掉，这批是存量。
  谁同意：产品负责人 2026-09-30 在对话里指示「按你的建议来」，即批量降回待确认。
  怎么回滚：① 整库回退——写库前已备份到
  `.data/backups/prompts-pre-v2.29.0-downgrade-2026-09-30T12-44-38.sqlite`；
  ② 单条回退——每条改动都带版本记录（`change_reason` 含「批量降回待确认」），
  在资产详情里恢复到上一版即可。
  验完的结果（只读核对）：合规检查从 **32 处违规降到 3 处**（剩下 3 处是三份文档缺
  「来源位置」，与本次无关）；29 条版本记录全部写入；脚本再跑一次名单为 0（幂等）。
  为什么没写成迁移：本机库不走迁移文件体系；改动用
  `scripts/downgrade-external-source-status.ts` 执行，走应用同一条写入路径，可重复执行。

- 2026-09-30（**本机库，不是生产库**）：**删除一条误建的模板资产**。
  对象：`assets` 里一行——`template-89d6ec58-d483-4756-bc79-994db2f64e21`，
  标题 `engineering-foundations.pack.json`，类型 `template`——外加它那 1 条 `asset_versions`。
  改了什么：删掉这两行，并把 `app_meta.library_version` 从 528 提到 529
  （和产品自己的彻底删除路径一致：`deletePromptAsset` + `bumpVersion`）。
  **没碰任何别的行。**
  为什么：做「导入规则包」界面验证时，上传文件的选择器没限定作用域，命中了页面里常驻的
  「导入模板」输入框——那个流程选中文件就立刻建资产（不走确认），于是把 13KB 的规则包
  JSON 当成模板导了进去。属操作事故，不是产品缺陷。
  谁同意：产品负责人 2026-09-30 在对话里选了「甲：先备份再硬删」。
  怎么回滚：删前已备份到
  `.data/backups/prompts-pre-cleanup-2026-09-30T12-59-41.sqlite`，可整库回退；
  那条资产本身没有内容价值（模板正文就是规则包 JSON），不必单独恢复。
  验完的结果（只读核对）：资产总数 318 → **317**（回到事故前）；该 id 的版本记录 0 条；
  `library_version` 528 → 529。
  为什么没写成迁移：本机库不走迁移体系；这是一次性清理，只删自己刚误建的那一行。

- 2026-09-30（**生产库 + 本机库**）：**把两条新沉淀的规则同步进产品的公共资产库，并让云端与本机库数据一致**。
  对象：云端 Supabase 与本机库 `.data/prompts.sqlite` 的 `assets` / `projects`。
  改了什么：本机库先新增 2 条规则资产——`RULE-EXT-QUERY-001`（梯子前的外部查询）、
  `RULE-SCHEMA-CHECK-001`（AI 产出与外部输入先过 schema 校验），来自工程方法种子包 0.14.0，
  走 `scripts/import-local-content.ts`（只新增不覆盖，走应用同一条写入路径）。
  再用 `npm run sync` 双向对齐：推云端 2 条（两条新规则）、拉本机 20 条（云端更全的自测与
  文档资产）、新建 2 个项目。**全程只增不删，不覆盖任何已有内容。**
  为什么：把开发体系里刚沉淀的两条规则回流到产品公共资产；顺带把 09-24 以来漂移的两端数据对齐。
  谁同意：产品负责人 2026-09-30 在对话里指示「最后云端和本机库数据一致一下就可以了」。
  怎么回滚：本机库只新增，删掉新增的 2 条规则与拉回的 20 条即可（或整库回退到 `.data/backups/`
  里的历史备份）；云端同理只增不删。`npm run sync` 本身只增不删，可重复执行、幂等。
  验完的结果（只读核对，同步后再跑一次 `--dry-run`）：本机 371 / 云端 371、项目各 6，
  「推到云端 0、拉到本机 0、两边一样 370」；仅剩 1 条 2026-09-24 的存量「公共资产库挑入」
  （两端时间戳相同、内容不同）列待裁决，与本次改动无关。
  为什么没写成迁移：本次是数据同步、无 schema 变更；走 `npm run sync`（service role 直连）执行。

- 2026-09-30（**本机库，不是生产库**）：**把上一条里那 1 条待裁决按云端为准解开**。
  对象：`.data/prompts.sqlite` 的 `assets` 一行——标题「公共资产库挑入」，两端 `updated_at`
  相同（2026-09-24T05:56:19.981Z）但正文不同，sync 判为待裁决。
  改了什么：给 `scripts/sync-cloud.mjs` 加了 `--prefer-cloud` 开关；跑
  `npm run sync -- --prefer-cloud`，把这条的云端版并入「拉到本机」，走普通拉取同一条写入路径
  （`updateAsset` + 一条版本记录，`changeReason` 为「从云端同步（云端更新）」）。**只改这一行。**
  为什么：用户 2026-09-30 指示「以云端为准」。
  谁同意：同上（同一条对话指示）。
  怎么回滚：这条拉取留了版本记录，在资产详情里恢复到上一版即可回到本机原内容；
  `--prefer-cloud` 是可选开关、默认关闭，不影响他人。
  验完的结果（只读核对，再跑 `npm run sync --dry-run`）：两端各 371 条、项目各 6，
  **待裁决 0、两边一样 371**（完全一致）。
  为什么没写成迁移：数据同步、无 schema 变更；开关在 `scripts/sync-cloud.mjs`，本机库不走迁移体系。
