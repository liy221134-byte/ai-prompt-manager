-- v0.8.0：为提示词 AI 合并与垃圾箱增加生命周期字段、恢复快照和 RPC。
-- 本次只做云端数据库结构变更，不删除任何现有用户数据。

alter table public.prompts
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_reason text,
  add column if not exists merged_into_prompt_id text,
  add column if not exists merge_version_id text;

create table if not exists public.prompt_versions (
  user_id uuid not null references auth.users(id) on delete cascade,
  version_id text not null,
  prompt_id text not null,
  title text not null,
  category text not null,
  tags text[] not null default '{}',
  content text not null,
  use_case text not null,
  created_at timestamptz not null,
  version_reason text not null,
  source_prompt_ids text[] not null default '{}',
  restored_at timestamptz,
  expires_at timestamptz not null,
  primary key (user_id, version_id)
);

create index if not exists prompts_user_deleted_idx
on public.prompts (user_id, deleted_at);

create index if not exists prompt_versions_user_prompt_idx
on public.prompt_versions (user_id, prompt_id, created_at desc);

create index if not exists prompt_versions_user_expires_idx
on public.prompt_versions (user_id, expires_at);

alter table public.prompt_versions enable row level security;

drop policy if exists "Users can read own prompt versions" on public.prompt_versions;
create policy "Users can read own prompt versions"
on public.prompt_versions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own prompt versions" on public.prompt_versions;
create policy "Users can insert own prompt versions"
on public.prompt_versions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own prompt versions" on public.prompt_versions;
create policy "Users can update own prompt versions"
on public.prompt_versions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own prompt versions" on public.prompt_versions;
create policy "Users can delete own prompt versions"
on public.prompt_versions
for delete
to authenticated
using (auth.uid() = user_id);

-- 原子提交一次合并：快照目标旧内容、更新目标、归档其他来源。
create or replace function public.commit_prompt_merge(
  p_prompt_id text,
  p_title text,
  p_category text,
  p_tags text[],
  p_content text,
  p_use_case text,
  p_source_prompt_ids text[],
  p_version_id text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_target public.prompts%rowtype;
  v_source_count integer := 0;
  v_source_id text;
  v_updated_at timestamptz := now();
  v_expires_at timestamptz := now() + interval '30 days';
  v_updated_count integer;
  v_archived_count integer;
begin
  if v_user_id is null then
    raise exception '未登录。';
  end if;

  if p_source_prompt_ids is null then
    raise exception '合并来源数量无效。';
  end if;

  if cardinality(p_source_prompt_ids) < 2
    or cardinality(p_source_prompt_ids) > 5
    or not p_prompt_id = any(p_source_prompt_ids)
  then
    raise exception '合并来源数量无效。';
  end if;

  select *
  into v_target
  from public.prompts
  where user_id = v_user_id
    and id = p_prompt_id
    and deleted_at is null
  for update;

  if not found then
    raise exception '目标提示词不存在。';
  end if;

  -- 锁定所有来源行，避免计数后、归档前发生并发状态变化。
  for v_source_id in
    select id
    from public.prompts
    where user_id = v_user_id
      and id = any(p_source_prompt_ids)
      and deleted_at is null
    for update
  loop
    v_source_count := v_source_count + 1;
  end loop;

  if v_source_count <> cardinality(p_source_prompt_ids) then
    raise exception '部分来源提示词不存在。';
  end if;

  insert into public.prompt_versions (
    user_id,
    version_id,
    prompt_id,
    title,
    category,
    tags,
    content,
    use_case,
    created_at,
    version_reason,
    source_prompt_ids,
    restored_at,
    expires_at
  ) values (
    v_user_id,
    p_version_id,
    v_target.id,
    v_target.title,
    v_target.category,
    v_target.tags,
    v_target.content,
    v_target.use_case,
    v_updated_at,
    'merge_before',
    p_source_prompt_ids,
    null,
    v_expires_at
  );

  update public.prompts
  set
    title = p_title,
    category = p_category,
    tags = p_tags,
    content = p_content,
    use_case = p_use_case,
    updated_at = v_updated_at
  where user_id = v_user_id
    and id = p_prompt_id
    and deleted_at is null;

  get diagnostics v_updated_count = row_count;

  if v_updated_count <> 1 then
    raise exception '目标提示词更新失败。';
  end if;

  update public.prompts
  set
    deleted_at = v_updated_at,
    deleted_reason = 'merge',
    merged_into_prompt_id = p_prompt_id,
    merge_version_id = p_version_id
  where user_id = v_user_id
    and id = any(p_source_prompt_ids)
    and id <> p_prompt_id
    and deleted_at is null;

  get diagnostics v_archived_count = row_count;

  if v_archived_count <> cardinality(p_source_prompt_ids) - 1 then
    raise exception '合并来源归档失败。';
  end if;
end;
$$;

-- 恢复合并前快照：目标必须仍活跃，且只恢复仍被本次合并归档的来源。
create or replace function public.restore_prompt_merge(
  p_version_id text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_version public.prompt_versions%rowtype;
  v_target public.prompts%rowtype;
begin
  if v_user_id is null then
    raise exception '未登录。';
  end if;

  select *
  into v_version
  from public.prompt_versions
  where user_id = v_user_id
    and version_id = p_version_id
    and restored_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception '恢复记录不存在或已过期。';
  end if;

  -- 消费快照前，目标提示词必须存在且仍处于活跃状态。
  select *
  into v_target
  from public.prompts
  where user_id = v_user_id
    and id = v_version.prompt_id
    and deleted_at is null
  for update;

  if not found then
    raise exception '目标提示词不存在。';
  end if;

  update public.prompts
  set
    title = v_version.title,
    category = v_version.category,
    tags = v_version.tags,
    content = v_version.content,
    use_case = v_version.use_case,
    updated_at = now()
  where user_id = v_user_id
    and id = v_version.prompt_id
    and deleted_at is null;

  -- 只恢复仍被本次合并归档的来源，避免覆盖已被手动恢复或再次删除的记录。
  update public.prompts
  set
    deleted_at = null,
    deleted_reason = null,
    merged_into_prompt_id = null,
    merge_version_id = null
  where user_id = v_user_id
    and id = any(v_version.source_prompt_ids)
    and id <> v_version.prompt_id
    and deleted_reason = 'merge'
    and merged_into_prompt_id = v_version.prompt_id
    and merge_version_id = v_version.version_id;

  update public.prompt_versions
  set restored_at = now()
  where user_id = v_user_id
    and version_id = p_version_id
    and restored_at is null
    and expires_at > now();
end;
$$;

-- 仅供 service-role 每日清理使用：删除过期快照和过期垃圾箱记录。
create or replace function public.purge_expired_prompt_versions()
returns void
language sql
security invoker
set search_path = public
as $$
  delete from public.prompt_versions
  where expires_at <= now();

  delete from public.prompts
  where deleted_at is not null
    and deleted_at <= now() - interval '30 days';
$$;

-- 清空当前用户的垃圾箱与全部合并恢复记录，整个函数在单一事务中执行。
create or replace function public.empty_prompt_trash()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception '未登录。';
  end if;

  delete from public.prompt_versions
  where user_id = v_user_id;

  delete from public.prompts
  where user_id = v_user_id
    and deleted_at is not null;
end;
$$;

revoke execute on function public.purge_expired_prompt_versions() from public;
grant execute on function public.purge_expired_prompt_versions() to service_role;
