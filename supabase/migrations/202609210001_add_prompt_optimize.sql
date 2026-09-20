-- v0.9.0：AI 提示词优化的原子提交与回退。
-- 复用 v0.8.0 已建的 prompt_versions 快照表，只新增两个函数，不改表结构。

-- 提交优化结果：写优化前快照，再更新提示词。客户端只提供 versionId，
-- 快照内容由服务端从锁定后的当前行生成。
create or replace function public.commit_prompt_optimize(
  p_prompt_id text,
  p_title text,
  p_category text,
  p_tags text[],
  p_content text,
  p_use_case text,
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
  v_updated_at timestamptz := now();
  v_expires_at timestamptz := now() + interval '30 days';
  v_updated_count integer;
begin
  if v_user_id is null then
    raise exception '未登录。';
  end if;

  if p_version_id is null or btrim(p_version_id) = '' then
    raise exception '缺少版本标识。';
  end if;

  select *
  into v_target
  from public.prompts
  where user_id = v_user_id
    and id = p_prompt_id
    and deleted_at is null
  for update;

  if not found then
    raise exception '提示词不存在。';
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
    'optimize_before',
    array[]::text[],
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
    raise exception '提示词更新失败。';
  end if;
end;
$$;

-- 回到优化前：只回退这条提示词最近一次未被消费的优化前快照。
-- 回退前会先把当前内容存成 restore_before 快照，回退本身也可以再退回来。
create or replace function public.restore_prompt_optimize(
  p_prompt_id text,
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
  v_restored_at timestamptz := now();
  v_expires_at timestamptz := now() + interval '30 days';
  v_updated_count integer;
begin
  if v_user_id is null then
    raise exception '未登录。';
  end if;

  if p_version_id is null or btrim(p_version_id) = '' then
    raise exception '缺少版本标识。';
  end if;

  select *
  into v_target
  from public.prompts
  where user_id = v_user_id
    and id = p_prompt_id
    and deleted_at is null
  for update;

  if not found then
    raise exception '提示词不存在。';
  end if;

  select *
  into v_version
  from public.prompt_versions
  where user_id = v_user_id
    and prompt_id = p_prompt_id
    and version_reason = 'optimize_before'
    and restored_at is null
    and expires_at > v_restored_at
  order by created_at desc
  limit 1
  for update;

  if not found then
    raise exception '没有可以回退的优化记录。';
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
    v_restored_at,
    'restore_before',
    array[]::text[],
    null,
    v_expires_at
  );

  update public.prompts
  set
    title = v_version.title,
    category = v_version.category,
    tags = v_version.tags,
    content = v_version.content,
    use_case = v_version.use_case,
    updated_at = v_restored_at
  where user_id = v_user_id
    and id = p_prompt_id
    and deleted_at is null;

  get diagnostics v_updated_count = row_count;

  if v_updated_count <> 1 then
    raise exception '提示词恢复失败。';
  end if;

  update public.prompt_versions
  set restored_at = v_restored_at
  where user_id = v_user_id
    and version_id = v_version.version_id
    and restored_at is null;
end;
$$;

comment on function public.commit_prompt_optimize(text, text, text, text[], text, text, text)
is 'AI 优化的原子提交：先写优化前快照，再更新提示词。';

comment on function public.restore_prompt_optimize(text, text)
is '回到最近一次优化前，并把当前内容存成 restore_before 快照。';
