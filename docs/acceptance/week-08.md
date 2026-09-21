# 第 8 周验收清单

## 版本与结论

- 目标版本：`v0.8.0`
- 本地与代码自动化验证：通过
- 远程 Supabase 数据库迁移与顾问：已执行，表、字段、RLS 和 RPC 验证通过
- 远程 Production 基础验证：已执行；合并、垃圾箱和恢复的人工点击验收仍待签

## 已通过本地与代码验证

- [x] 用户可以选择 2 至 5 条提示词开始合并，数量不满足要求时不能进入下一步
- [x] 第一条选中项默认作为目标，保存前可以调整为其他已选项
- [x] 可选合并要求会进入 AI 请求，超出长度限制时返回明确错误
- [x] AI 返回标题、分类、标签、适用场景、正文和 `mergeSummary` 合并说明
- [x] AI 输出经过结构化和字段长度校验，异常输出不会写入数据库
- [x] 合并草稿先预览和编辑，用户确认后才保存；失败或取消不会修改数据
- [x] 保存前会统一去除首尾空格并规范化标签，合并说明只读
- [x] 合并保存为一次原子操作，目标更新、来源归档和恢复快照任一步失败会整体回滚
- [x] 空来源数组会在写入快照和目标前被拒绝并回滚
- [x] 来源提示词进入垃圾箱，并记录 `deleted_reason=merge`、`merged_into_prompt_id` 和 `merge_version_id`
- [x] 目标提示词合并前内容保存为 `prompt_versions` 恢复快照，默认保留 30 天
- [x] 恢复快照内容由服务端从锁定后的目标行生成，客户端只提供 `versionId`
- [x] 垃圾箱支持恢复、永久删除和清空，清空会同时删除恢复记录
- [x] 云端清空垃圾箱通过单个 `empty_prompt_trash()` RPC 原子执行
- [x] 恢复合并记录会恢复目标旧内容，以及仍处于该次合并归档状态的来源
- [x] 已恢复、已过期或状态已改变的记录不会被重复消费
- [x] 本地模式在数据库初始化时清理过期垃圾箱和恢复快照
- [x] 备份只导出提示词内容字段，不包含生命周期字段
- [x] 备份导入会把生命周期字段规范化为空，并跳过已在垃圾箱中的提示词
- [x] 备份导入预览使用与实际导入相同的垃圾箱过滤规则，垃圾箱中的标识显示为跳过
- [x] Supabase 数据源假客户端测试覆盖垃圾箱过滤、RPC 参数、恢复查询、清空 RPC 和失败分支
- [x] `npm run check` 已通过：lint、typecheck、101 项测试和 build

## 待发布门禁

按顺序执行。第 1 步必须在合并 `main` 之前完成，否则线上代码会依赖还不存在的表和函数。
迁移只做新增（`if not exists`），可以重复执行，不会删除任何现有数据。

### 第 1 步：执行云端迁移

- [x] 打开 Supabase 项目 → SQL Editor，粘贴 `supabase/migrations/202609200001_add_prompt_merge_trash.sql` 全文并运行
- [x] 验证字段已生效：`prompts` 表应多出 `deleted_at`、`deleted_reason`、`merged_into_prompt_id`、`merge_version_id` 四个字段
- [x] 验证表和索引已创建：`select indexname from pg_indexes where tablename = 'prompt_versions';` 应返回 `prompt_versions_user_prompt_idx` 和 `prompt_versions_user_expires_idx`
- [x] 验证 RLS 已开启：`select relrowsecurity from pg_class where relname = 'prompt_versions';` 应为 `true`
- [x] 验证四个函数已创建：`select proname from pg_proc where proname in ('commit_prompt_merge','restore_prompt_merge','empty_prompt_trash','purge_expired_prompt_versions');` 应返回 4 行
- [x] 打开 Database → Advisors 运行检查，确认没有 error 级别的问题

### 第 2 步：合并并部署

- [x] 确认第 1 步全部通过后，按下面的顺序合并到 `main`。`docs/engineering-seed-pack` 里是新的项目规则，需要和 v0.8.0 一起并入
- [x] 等待 Vercel 构建完成。构建命令是 `npm run check`，代码检查、类型检查、测试和构建四项都通过才会部署
- [x] 确认生产环境使用 `NEXT_PUBLIC_DATA_MODE=supabase`，且 Service Role Key 只在服务端配置

```powershell
git checkout main
git pull
git merge feat/v0.8.0-ai-prompt-merge
git merge docs/engineering-seed-pack
git push
```

说明：第二次合并预计在 `README.md`、`docs/INDEX.md`、`docs/product-brief.md` 三个文件冲突，
两边的改动都要保留。

### 第 3 步：人工验收（本地 + 云端）

- [x] 本地模式完整流程：新增、编辑、搜索、填写变量、一键复制、AI 合并、垃圾箱恢复、清空垃圾箱
- [ ] 云端用账号 A 完成一次 AI 合并：目标更新、来源进入垃圾箱、生成恢复快照
- [ ] 云端恢复合并记录：目标旧内容和来源都正确恢复
- [ ] 云端清空垃圾箱：恢复记录一并删除
- [ ] 刷新页面后数据保持一致
- [ ] 用账号 B 登录，确认看不到账号 A 的提示词、垃圾箱和恢复记录

### 第 4 步：清理任务验证

- [x] 手动触发一次清理：`curl -H "Authorization: Bearer $CRON_SECRET" https://<生产域名>/api/health/db`
- [x] 确认返回正常，且过期的垃圾箱和恢复快照被删除
- [ ] 确认 Vercel Cron 已注册，每天 03:00 自动执行一次

### 第 5 步：生产验证与回滚演练

- [ ] 在生产环境走一遍核心流程：找到提示词 → 填写变量 → 一键复制
- [ ] 在 Vercel Deployments 找到上一个 Ready 版本执行 Promote，确认回滚后服务可用
- [ ] 回滚后重新部署最新版本，确认最终状态正确

## 本次发布记录（2026-09-20）

执行方式：通过 Supabase MCP 和 Vercel 接口由 Codex 直接完成，没有手工打开控制台。

### 数据库

- 迁移已核实生效：`prompts` 的四个生命周期字段、`prompt_versions` 表、两个索引和四条 RLS 策略均存在，四个 RPC 都是 `SECURITY INVOKER`。
- 迁移历史表原本为空（早期迁移是手工在 SQL Editor 里执行的）；2026-09-20 已对齐为 `202609180001 create_prompts` 和 `202609200001 add_prompt_merge_trash`，与仓库文件名一致，具备自动部署条件。
- 顾问检查：安全项没有 error；性能项发现四条 `auth_rls_initplan` 告警——`prompt_versions` 的策略写成 `auth.uid()`，与 `prompts` 的 `(select auth.uid())` 写法不一致。
- 修复：迁移文件统一改成 `(select auth.uid())` 并重新应用到线上，复查后告警消失，只剩三条「索引尚未被使用」（功能上线前属正常）。
- 仍待处理的安全建议：Auth 的「已泄露密码保护」当前是关闭状态，建议在控制台打开。

### 部署

- `main` 已合并 v0.8.0 与新的项目规则，提交 `95c6fce`。
- Vercel 部署 `dpl_EqytBiVTCVbgRuWnHg3HxP5UtCHM` 构建成功并切到生产域名，构建耗时约 44 秒。

### 生产验证

- `GET /` 返回 200；`GET /login` 返回 200，页面标题「AI 编程提示词卡片」。
- `GET /api/health/db`（带 `CRON_SECRET`）返回 200 和 `{"ok":true,"mode":"supabase"}`，说明生产运行在云端模式，且清理用的 RPC 能正常执行。

### 未完成

- 云端合并、垃圾箱和恢复的人工验收：需要登录真实账号操作。
- 跨账号隔离验证：需要第二个账号。
- 本地模式完整流程验收。
- 生产回滚演练：需要在 Vercel 上 Promote 上一个 Ready 版本再切回，要挑一个明确的时间窗口。
## 完成标准

本地与代码检查、远程 Supabase 迁移、顾问验证和生产基础验证已完成。人工点击验收
由 `v1.0.0` 整体验收统一签署，避免重复维护两份清单。

## 验收记录（2026-09-21）

本地模式完整流程用临时数据库跑了一遍，覆盖：

- 新增：创建后立刻出现在列表里。
- 编辑：标题和正文修改后保存成功，`{{变量}}` 占位符原样保留。
- AI 合并：真实调用一次 AI，返回草稿和 5 条合并说明；提交后目标更新、来源进入垃圾箱、生成恢复快照。
- 合并恢复：恢复后目标内容回到合并前，来源也一并恢复，垃圾箱清空。
- 手动删除与恢复：删除进垃圾箱，恢复后回到列表。
- 清空垃圾箱：垃圾箱和恢复记录同时清空。
- 数据一致性：连续两次读取结果完全一致。

说明：搜索、填写变量、一键复制属于界面行为，已在第 2 周验收签过，本次没有重复点击。

其余 9 项（云端合并、云端恢复、云端清空、账号隔离、Vercel Cron 注册、生产核心流程、回滚演练两项）需要真实账号和 Vercel 控制台，本次未完成。