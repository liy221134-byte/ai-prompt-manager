-- 2.1.0：提示词的读写切到统一资产。
-- 这里只新增统一资产上的原子操作函数，不改表结构，也不删除旧提示词表的数据。
-- 旧的 prompt 版函数保留不删，保证回滚到 2.0.0 代码时仍然可用。

-- 取下一个资产版本号，供下面几个函数共用。
create or replace function public.next_asset_version_number(
  p_user_id uuid,
  p_asset_id text
)
returns integer
language sql
security invoker
set search_path = public
as $$
  select coalesce(max(version_number), 0) + 1
  from public.asset_versions
  where user_id = p_user_id and asset_id = p_asset_id;
$$;

revoke execute on function public.next_asset_version_number(uuid, text)
  from public;
grant execute on function public.next_asset_version_number(uuid, text)
  to authenticated;

-- 进入或离开垃圾箱：和本地一致，恢复和删除时都清掉合并关系字段。
create or replace function public.set_asset_trash_state(
  p_asset_id text,
  p_deleted boolean,
  p_reason text default 'manual'
)
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

  if p_deleted then
    update public.assets
    set
      deleted_at = now(),
      deleted_reason = coalesce(p_reason, 'manual'),
      metadata_json = jsonb_set(
        jsonb_set(metadata_json, '{mergedIntoAssetId}', 'null'::jsonb, true),
        '{mergeVersionId}',
        'null'::jsonb,
        true
      ),
      updated_at = now()
    where user_id = v_user_id
      and id = p_asset_id
      and deleted_at is null;
  else
    update public.assets
    set
      deleted_at = null,
      deleted_reason = null,
      metadata_json = jsonb_set(
        jsonb_set(metadata_json, '{mergedIntoAssetId}', 'null'::jsonb, true),
        '{mergeVersionId}',
        'null'::jsonb,
        true
      ),
      updated_at = now()
    where user_id = v_user_id
      and id = p_asset_id
      and deleted_at is not null;
  end if;
end;
$$;

revoke execute on function public.set_asset_trash_state(text, boolean, text)
  from public;
grant execute on function public.set_asset_trash_state(text, boolean, text)
  to authenticated;

-- 合并提交：先写合并前快照，再写合并结果和它的内容版本，最后把来源标成合并归档。
create or replace function public.commit_asset_merge(
  p_asset_id text,
  p_title text,
  p_summary text,
  p_content text,
  p_metadata jsonb,
  p_source_asset_ids text[],
  p_asset_updated_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_asset public.assets%rowtype;
  v_snapshot_number integer;
  v_source_id text;
begin
  if v_user_id is null then
    raise exception '未登录。';
  end if;

  if p_source_asset_ids is null or array_length(p_source_asset_ids, 1) is null then
    raise exception '合并来源不能为空。';
  end if;

  select *
  into v_asset
  from public.assets
  where user_id = v_user_id
    and id = p_asset_id
    and deleted_at is null
  for update;

  if not found then
    raise exception '目标提示词不存在或已删除。';
  end if;

  if exists (
    select 1
    from unnest(p_source_asset_ids) as source_id
    where not exists (
      select 1
      from public.assets
      where user_id = v_user_id
        and id = source_id
        and deleted_at is null
    )
  ) then
    raise exception '合并来源不存在或已删除。';
  end if;

  v_snapshot_number := public.next_asset_version_number(v_user_id, p_asset_id);

  insert into public.asset_versions (
    user_id, version_id, asset_id, asset_type, version_number,
    title, summary, content, metadata_json, change_reason, version_reason,
    source_asset_ids, restored_at, expires_at, created_at
  ) values (
    v_user_id,
    'version-' || gen_random_uuid()::text,
    p_asset_id,
    v_asset.asset_type,
    v_snapshot_number,
    v_asset.title,
    v_asset.summary,
    v_asset.content,
    v_asset.metadata_json,
    '合并前快照',
    'merge_before',
    p_source_asset_ids,
    null,
    now() + interval '30 days',
    now()
  );

  insert into public.asset_versions (
    user_id, version_id, asset_id, asset_type, version_number,
    title, summary, content, metadata_json, change_reason, version_reason,
    source_asset_ids, restored_at, expires_at, created_at
  ) values (
    v_user_id,
    'version-' || gen_random_uuid()::text,
    p_asset_id,
    v_asset.asset_type,
    v_snapshot_number + 1,
    p_title,
    p_summary,
    p_content,
    coalesce(p_metadata, '{}'::jsonb),
    '合并结果',
    'save',
    '{}',
    null,
    null,
    now()
  );

  update public.assets
  set
    title = p_title,
    summary = p_summary,
    content = p_content,
    metadata_json = coalesce(p_metadata, '{}'::jsonb),
    current_version_id = (
      select version_id
      from public.asset_versions
      where user_id = v_user_id
        and asset_id = p_asset_id
        and version_number = v_snapshot_number + 1
    ),
    updated_at = p_asset_updated_at
  where user_id = v_user_id and id = p_asset_id;

  foreach v_source_id in array p_source_asset_ids loop
    if v_source_id = p_asset_id then
      continue;
    end if;

    update public.assets
    set
      deleted_at = p_asset_updated_at,
      deleted_reason = 'merge',
      metadata_json = jsonb_set(
        jsonb_set(metadata_json, '{mergedIntoAssetId}', to_jsonb(p_asset_id), true),
        '{mergeVersionId}',
        to_jsonb(
          (
            select version_id
            from public.asset_versions
            where user_id = v_user_id
              and asset_id = p_asset_id
              and version_number = v_snapshot_number
          )
        ),
        true
      ),
      updated_at = p_asset_updated_at
    where user_id = v_user_id
      and id = v_source_id
      and deleted_at is null;

    if not found then
      raise exception '合并来源归档失败。';
    end if;
  end loop;
end;
$$;

revoke execute on function public.commit_asset_merge(
  text, text, text, text, jsonb, text[], timestamptz
) from public;
grant execute on function public.commit_asset_merge(
  text, text, text, text, jsonb, text[], timestamptz
) to authenticated;

-- 恢复合并记录：目标恢复成合并前内容，来源回到活跃列表，快照标记为已消费。
create or replace function public.restore_asset_merge(p_version_id text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_version public.asset_versions%rowtype;
  v_target public.assets%rowtype;
  v_source_id text;
  v_next_number integer;
begin
  if v_user_id is null then
    raise exception '未登录。';
  end if;

  select *
  into v_version
  from public.asset_versions
  where user_id = v_user_id
    and version_id = p_version_id
    and version_reason = 'merge_before'
    and restored_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception '没有可以恢复的合并记录。';
  end if;

  select *
  into v_target
  from public.assets
  where user_id = v_user_id
    and id = v_version.asset_id
    and deleted_at is null
  for update;

  if not found then
    raise exception '目标提示词不存在或已删除。';
  end if;

  v_next_number := public.next_asset_version_number(v_user_id, v_version.asset_id);

  insert into public.asset_versions (
    user_id, version_id, asset_id, asset_type, version_number,
    title, summary, content, metadata_json, change_reason, version_reason,
    source_asset_ids, restored_at, expires_at, created_at
  ) values (
    v_user_id,
    'version-' || gen_random_uuid()::text,
    v_version.asset_id,
    v_version.asset_type,
    v_next_number,
    v_version.title,
    v_version.summary,
    v_version.content,
    v_version.metadata_json,
    '恢复合并前内容',
    'restore',
    '{}',
    null,
    null,
    now()
  );

  update public.assets
  set
    title = v_version.title,
    summary = v_version.summary,
    content = v_version.content,
    metadata_json = v_version.metadata_json,
    current_version_id = (
      select version_id
      from public.asset_versions
      where user_id = v_user_id
        and asset_id = v_version.asset_id
        and version_number = v_next_number
    ),
    updated_at = now()
  where user_id = v_user_id and id = v_version.asset_id;

  foreach v_source_id in array v_version.source_asset_ids loop
    if v_source_id = v_version.asset_id then
      continue;
    end if;

    update public.assets
    set
      deleted_at = null,
      deleted_reason = null,
      metadata_json = jsonb_set(
        jsonb_set(metadata_json, '{mergedIntoAssetId}', 'null'::jsonb, true),
        '{mergeVersionId}',
        'null'::jsonb,
        true
      ),
      updated_at = now()
    where user_id = v_user_id
      and id = v_source_id
      and deleted_at is not null
      and deleted_reason = 'merge'
      and metadata_json ->> 'mergedIntoAssetId' = v_version.asset_id
      and metadata_json ->> 'mergeVersionId' = p_version_id;
  end loop;

  update public.asset_versions
  set restored_at = now()
  where user_id = v_user_id and version_id = p_version_id;
end;
$$;

revoke execute on function public.restore_asset_merge(text) from public;
grant execute on function public.restore_asset_merge(text) to authenticated;

-- 优化提交：先写优化前快照，再写优化结果和它的内容版本。
create or replace function public.commit_asset_optimize(
  p_asset_id text,
  p_title text,
  p_summary text,
  p_content text,
  p_metadata jsonb,
  p_asset_updated_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_asset public.assets%rowtype;
  v_snapshot_number integer;
begin
  if v_user_id is null then
    raise exception '未登录。';
  end if;

  select *
  into v_asset
  from public.assets
  where user_id = v_user_id
    and id = p_asset_id
    and deleted_at is null
  for update;

  if not found then
    raise exception '提示词不存在或已删除。';
  end if;

  v_snapshot_number := public.next_asset_version_number(v_user_id, p_asset_id);

  insert into public.asset_versions (
    user_id, version_id, asset_id, asset_type, version_number,
    title, summary, content, metadata_json, change_reason, version_reason,
    source_asset_ids, restored_at, expires_at, created_at
  ) values (
    v_user_id,
    'version-' || gen_random_uuid()::text,
    p_asset_id,
    v_asset.asset_type,
    v_snapshot_number,
    v_asset.title,
    v_asset.summary,
    v_asset.content,
    v_asset.metadata_json,
    '优化前快照',
    'optimize_before',
    '{}',
    null,
    now() + interval '30 days',
    now()
  );

  insert into public.asset_versions (
    user_id, version_id, asset_id, asset_type, version_number,
    title, summary, content, metadata_json, change_reason, version_reason,
    source_asset_ids, restored_at, expires_at, created_at
  ) values (
    v_user_id,
    'version-' || gen_random_uuid()::text,
    p_asset_id,
    v_asset.asset_type,
    v_snapshot_number + 1,
    p_title,
    p_summary,
    p_content,
    coalesce(p_metadata, '{}'::jsonb),
    '优化结果',
    'save',
    '{}',
    null,
    null,
    now()
  );

  update public.assets
  set
    title = p_title,
    summary = p_summary,
    content = p_content,
    metadata_json = coalesce(p_metadata, '{}'::jsonb),
    current_version_id = (
      select version_id
      from public.asset_versions
      where user_id = v_user_id
        and asset_id = p_asset_id
        and version_number = v_snapshot_number + 1
    ),
    updated_at = p_asset_updated_at
  where user_id = v_user_id and id = p_asset_id;
end;
$$;

revoke execute on function public.commit_asset_optimize(
  text, text, text, text, jsonb, timestamptz
) from public;
grant execute on function public.commit_asset_optimize(
  text, text, text, text, jsonb, timestamptz
) to authenticated;

-- 回到优化前：保留回退前快照，恢复优化前内容，消费优化快照。
create or replace function public.restore_asset_optimize(
  p_asset_id text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_asset public.assets%rowtype;
  v_version public.asset_versions%rowtype;
  v_next_number integer;
begin
  if v_user_id is null then
    raise exception '未登录。';
  end if;

  select *
  into v_asset
  from public.assets
  where user_id = v_user_id
    and id = p_asset_id
    and deleted_at is null
  for update;

  if not found then
    raise exception '提示词不存在或已删除。';
  end if;

  select *
  into v_version
  from public.asset_versions
  where user_id = v_user_id
    and asset_id = p_asset_id
    and version_reason = 'optimize_before'
    and restored_at is null
    and expires_at > now()
  order by created_at desc
  limit 1
  for update;

  if not found then
    raise exception '没有可以回退的优化记录。';
  end if;

  v_next_number := public.next_asset_version_number(v_user_id, p_asset_id);

  insert into public.asset_versions (
    user_id, version_id, asset_id, asset_type, version_number,
    title, summary, content, metadata_json, change_reason, version_reason,
    source_asset_ids, restored_at, expires_at, created_at
  ) values (
    v_user_id,
    'version-' || gen_random_uuid()::text,
    p_asset_id,
    v_asset.asset_type,
    v_next_number,
    v_asset.title,
    v_asset.summary,
    v_asset.content,
    v_asset.metadata_json,
    '回退前快照',
    'restore_before',
    '{}',
    null,
    now() + interval '30 days',
    now()
  );

  insert into public.asset_versions (
    user_id, version_id, asset_id, asset_type, version_number,
    title, summary, content, metadata_json, change_reason, version_reason,
    source_asset_ids, restored_at, expires_at, created_at
  ) values (
    v_user_id,
    'version-' || gen_random_uuid()::text,
    p_asset_id,
    v_asset.asset_type,
    v_next_number + 1,
    v_version.title,
    v_version.summary,
    v_version.content,
    v_version.metadata_json,
    '回到优化前',
    'restore',
    '{}',
    null,
    null,
    now()
  );

  update public.assets
  set
    title = v_version.title,
    summary = v_version.summary,
    content = v_version.content,
    metadata_json = v_version.metadata_json,
    current_version_id = (
      select version_id
      from public.asset_versions
      where user_id = v_user_id
        and asset_id = p_asset_id
        and version_number = v_next_number + 1
    ),
    updated_at = now()
  where user_id = v_user_id and id = p_asset_id;

  update public.asset_versions
  set restored_at = now()
  where user_id = v_user_id and version_id = v_version.version_id;
end;
$$;

revoke execute on function public.restore_asset_optimize(text) from public;
grant execute on function public.restore_asset_optimize(text) to authenticated;

-- 清空垃圾箱：删掉回收站里的提示词资产，并清掉快照版本；
-- 内容版本保留，避免存活资产的当前版本指针悬空。
create or replace function public.empty_asset_trash()
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

  delete from public.asset_versions
  where user_id = v_user_id
    and asset_id in (
      select id from public.assets
      where user_id = v_user_id
        and asset_type = 'prompt'
        and deleted_at is not null
    );

  delete from public.asset_versions
  where user_id = v_user_id
    and version_reason in ('merge_before', 'optimize_before', 'restore_before')
    and asset_id in (
      select id from public.assets
      where user_id = v_user_id and asset_type = 'prompt'
    );

  delete from public.assets
  where user_id = v_user_id
    and asset_type = 'prompt'
    and deleted_at is not null;
end;
$$;

revoke execute on function public.empty_asset_trash() from public;
grant execute on function public.empty_asset_trash() to authenticated;
