# 第 8 周验收清单

## 版本与结论

- 目标版本：`v0.8.0`
- 本地与代码自动化验证：通过
- 远程 Supabase 数据库迁移与顾问：未执行，作为明确待发布门禁
- 远程 Production 验证：未执行

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

- [ ] 打开 Supabase 项目 → SQL Editor，粘贴 `supabase/migrations/202609200001_add_prompt_merge_trash.sql` 全文并运行
- [ ] 验证字段已生效：`prompts` 表应多出 `deleted_at`、`deleted_reason`、`merged_into_prompt_id`、`merge_version_id` 四个字段
- [ ] 验证表和索引已创建：`select indexname from pg_indexes where tablename = 'prompt_versions';` 应返回 `prompt_versions_user_prompt_idx` 和 `prompt_versions_user_expires_idx`
- [ ] 验证 RLS 已开启：`select relrowsecurity from pg_class where relname = 'prompt_versions';` 应为 `true`
- [ ] 验证四个函数已创建：`select proname from pg_proc where proname in ('commit_prompt_merge','restore_prompt_merge','empty_prompt_trash','purge_expired_prompt_versions');` 应返回 4 行
- [ ] 打开 Database → Advisors 运行检查，确认没有 error 级别的问题

### 第 2 步：合并并部署

- [ ] 确认第 1 步全部通过后，按下面的顺序合并到 `main`。`docs/engineering-seed-pack` 里是新的项目规则，需要和 v0.8.0 一起并入
- [ ] 等待 Vercel 构建完成。构建命令是 `npm run check`，代码检查、类型检查、测试和构建四项都通过才会部署
- [ ] 确认生产环境使用 `NEXT_PUBLIC_DATA_MODE=supabase`，且 Service Role Key 只在服务端配置

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

- [ ] 本地模式完整流程：新增、编辑、搜索、填写变量、一键复制、AI 合并、垃圾箱恢复、清空垃圾箱
- [ ] 云端用账号 A 完成一次 AI 合并：目标更新、来源进入垃圾箱、生成恢复快照
- [ ] 云端恢复合并记录：目标旧内容和来源都正确恢复
- [ ] 云端清空垃圾箱：恢复记录一并删除
- [ ] 刷新页面后数据保持一致
- [ ] 用账号 B 登录，确认看不到账号 A 的提示词、垃圾箱和恢复记录

### 第 4 步：清理任务验证

- [ ] 手动触发一次清理：`curl -H "Authorization: Bearer $CRON_SECRET" https://<生产域名>/api/health/db`
- [ ] 确认返回正常，且过期的垃圾箱和恢复快照被删除
- [ ] 确认 Vercel Cron 已注册，每天 03:00 自动执行一次

### 第 5 步：生产验证与回滚演练

- [ ] 在生产环境走一遍核心流程：找到提示词 → 填写变量 → 一键复制
- [ ] 在 Vercel Deployments 找到上一个 Ready 版本执行 Promote，确认回滚后服务可用
- [ ] 回滚后重新部署最新版本，确认最终状态正确

## 完成标准

本地和代码检查已经通过。只有远程 Supabase 迁移、顾问验证和生产验证完成后，
`v0.8.0` 才能进入正式发布。
