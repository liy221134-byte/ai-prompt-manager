-- v0.8.0 补充：为合并、垃圾箱和恢复快照相关的表、字段和函数补上中文说明。
-- 只添加注释，不修改任何数据结构，可以重复执行。

comment on table public.prompts is '用户的提示词卡片，包含标题、分类、标签、正文、适用场景和生命周期字段。';
comment on column public.prompts.deleted_at is '软删除时间。为空表示提示词正常，非空表示在垃圾箱中。';
comment on column public.prompts.deleted_reason is '删除原因：manual（手动删除）或 merge（AI 合并归档）。';
comment on column public.prompts.merged_into_prompt_id is '被合并到的目标提示词标识，只有合并归档的来源填写。';
comment on column public.prompts.merge_version_id is '本次合并的恢复快照标识。';

comment on table public.prompt_versions is 'AI 合并或优化前的恢复快照，默认保留 30 天。';
comment on column public.prompt_versions.version_reason is '快照原因：merge_before、optimize_before 或 restore_before。';
comment on column public.prompt_versions.restored_at is '恢复时间。非空表示该快照已经使用过，不会被重复消费。';
comment on column public.prompt_versions.expires_at is '快照过期时间，过期后由每日清理任务删除。';

comment on table public.health_checks is '定时任务心跳表，只由服务端写入，不对外开放。';

comment on function public.commit_prompt_merge(text, text, text, text[], text, text, text[], text) is 'AI 合并的原子提交：写恢复快照、更新目标提示词、把来源移入垃圾箱。';
comment on function public.restore_prompt_merge(text) is '恢复一次 AI 合并前的状态，并把该快照标记为已恢复。';
comment on function public.empty_prompt_trash() is '清空当前用户的垃圾箱和恢复记录，在同一个事务中完成。';
comment on function public.purge_expired_prompt_versions() is '清理过期的垃圾箱记录和恢复快照，仅允许 service_role 执行。';