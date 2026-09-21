-- 2.0.0：项目、统一资产和不可变资产版本。
-- 只新增结构和迁移数据，不删除现有提示词与恢复快照。

create table if not exists public.projects (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  description text not null default '',
  status text not null default 'active',
  stage text not null default 'development',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  archived_at timestamptz,
  primary key (user_id, id)
);

create table if not exists public.assets (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  project_id text not null,
  asset_type text not null,
  title text not null,
  summary text not null default '',
  content text not null default '',
  metadata_json jsonb not null default '{}'::jsonb,
  source_type text not null default 'manual',
  source_asset_id text,
  import_batch_id text,
  original_filename text,
  current_version_id text not null,
  status text not null default 'active',
  archived_at timestamptz,
  deleted_at timestamptz,
  deleted_reason text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (user_id, id),
  constraint assets_project_fk
    foreign key (user_id, project_id)
    references public.projects(user_id, id)
);

create table if not exists public.asset_versions (
  user_id uuid not null references auth.users(id) on delete cascade,
  version_id text not null,
  asset_id text not null,
  asset_type text not null,
  version_number integer not null check (version_number > 0),
  title text not null,
  summary text not null default '',
  content text not null default '',
  metadata_json jsonb not null default '{}'::jsonb,
  change_reason text not null,
  version_reason text not null,
  source_asset_ids text[] not null default '{}',
  restored_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null,
  primary key (user_id, version_id),
  constraint asset_versions_asset_fk
    foreign key (user_id, asset_id)
    references public.assets(user_id, id)
    on delete cascade
);

create index if not exists assets_user_project_updated_idx
on public.assets (user_id, project_id, updated_at desc);

create index if not exists assets_user_project_type_idx
on public.assets (user_id, project_id, asset_type, updated_at desc);

create index if not exists assets_user_deleted_idx
on public.assets (user_id, deleted_at);

create unique index if not exists asset_versions_user_asset_number_idx
on public.asset_versions (user_id, asset_id, version_number);

create index if not exists asset_versions_user_asset_created_idx
on public.asset_versions (user_id, asset_id, created_at desc);

alter table public.projects enable row level security;
alter table public.assets enable row level security;
alter table public.asset_versions enable row level security;

drop policy if exists "Users can read own projects" on public.projects;
create policy "Users can read own projects"
on public.projects
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own projects" on public.projects;
create policy "Users can insert own projects"
on public.projects
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own projects" on public.projects;
create policy "Users can update own projects"
on public.projects
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own projects" on public.projects;
create policy "Users can delete own projects"
on public.projects
for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own assets" on public.assets;
create policy "Users can read own assets"
on public.assets
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own assets" on public.assets;
create policy "Users can insert own assets"
on public.assets
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own assets" on public.assets;
create policy "Users can update own assets"
on public.assets
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own assets" on public.assets;
create policy "Users can delete own assets"
on public.assets
for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own asset versions" on public.asset_versions;
create policy "Users can read own asset versions"
on public.asset_versions
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own asset versions" on public.asset_versions;
create policy "Users can insert own asset versions"
on public.asset_versions
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own asset versions" on public.asset_versions;
create policy "Users can update own asset versions"
on public.asset_versions
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own asset versions" on public.asset_versions;
create policy "Users can delete own asset versions"
on public.asset_versions
for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.projects from anon;
revoke all on public.assets from anon;
revoke all on public.asset_versions from anon;

grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.assets to authenticated;
grant select, insert, update, delete on public.asset_versions to authenticated;

create or replace function public.save_asset(
  p_asset_id text,
  p_project_id text,
  p_asset_type text,
  p_title text,
  p_summary text,
  p_content text,
  p_metadata jsonb,
  p_source_type text,
  p_source_asset_id text,
  p_import_batch_id text,
  p_original_filename text,
  p_status text,
  p_archived_at timestamptz,
  p_deleted_at timestamptz,
  p_deleted_reason text,
  p_version_id text,
  p_change_reason text,
  p_version_reason text,
  p_source_asset_ids text[],
  p_restored_at timestamptz,
  p_expires_at timestamptz,
  p_asset_created_at timestamptz,
  p_asset_updated_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_version_number integer;
begin
  if v_user_id is null then
    raise exception '未登录。';
  end if;

  if p_asset_id is null or btrim(p_asset_id) = ''
    or p_version_id is null or btrim(p_version_id) = ''
  then
    raise exception '资产标识和版本标识不能为空。';
  end if;

  if not exists (
    select 1
    from public.projects
    where user_id = v_user_id and id = p_project_id
  ) then
    raise exception '项目不存在。';
  end if;

  select coalesce(max(version_number), 0) + 1
  into v_version_number
  from public.asset_versions
  where user_id = v_user_id and asset_id = p_asset_id;

  insert into public.assets (
    user_id,
    id,
    project_id,
    asset_type,
    title,
    summary,
    content,
    metadata_json,
    source_type,
    source_asset_id,
    import_batch_id,
    original_filename,
    current_version_id,
    status,
    archived_at,
    deleted_at,
    deleted_reason,
    created_at,
    updated_at
  ) values (
    v_user_id,
    p_asset_id,
    p_project_id,
    p_asset_type,
    p_title,
    p_summary,
    p_content,
    coalesce(p_metadata, '{}'::jsonb),
    p_source_type,
    p_source_asset_id,
    p_import_batch_id,
    p_original_filename,
    p_version_id,
    p_status,
    p_archived_at,
    p_deleted_at,
    p_deleted_reason,
    p_asset_created_at,
    p_asset_updated_at
  )
  on conflict (user_id, id) do update
  set
    project_id = excluded.project_id,
    asset_type = excluded.asset_type,
    title = excluded.title,
    summary = excluded.summary,
    content = excluded.content,
    metadata_json = excluded.metadata_json,
    source_type = excluded.source_type,
    source_asset_id = excluded.source_asset_id,
    import_batch_id = excluded.import_batch_id,
    original_filename = excluded.original_filename,
    current_version_id = excluded.current_version_id,
    status = excluded.status,
    archived_at = excluded.archived_at,
    deleted_at = excluded.deleted_at,
    deleted_reason = excluded.deleted_reason,
    updated_at = excluded.updated_at;

  insert into public.asset_versions (
    user_id,
    version_id,
    asset_id,
    asset_type,
    version_number,
    title,
    summary,
    content,
    metadata_json,
    change_reason,
    version_reason,
    source_asset_ids,
    restored_at,
    expires_at,
    created_at
  ) values (
    v_user_id,
    p_version_id,
    p_asset_id,
    p_asset_type,
    v_version_number,
    p_title,
    p_summary,
    p_content,
    coalesce(p_metadata, '{}'::jsonb),
    p_change_reason,
    p_version_reason,
    coalesce(p_source_asset_ids, '{}'),
    p_restored_at,
    p_expires_at,
    p_asset_updated_at
  );
end;
$$;

revoke execute on function public.save_asset(
  text, text, text, text, text, text, jsonb, text, text, text, text,
  text, timestamptz, timestamptz, text, text, text, text, text[],
  timestamptz, timestamptz, timestamptz, timestamptz
) from public;

grant execute on function public.save_asset(
  text, text, text, text, text, text, jsonb, text, text, text, text,
  text, timestamptz, timestamptz, text, text, text, text, text[],
  timestamptz, timestamptz, timestamptz, timestamptz
) to authenticated;

insert into public.projects (
  user_id,
  id,
  name,
  description,
  status,
  stage,
  created_at,
  updated_at,
  archived_at
)
select distinct
  user_id,
  'default-project',
  '默认项目',
  '现有提示词迁移后的默认归属项目。',
  'active',
  'development',
  now(),
  now(),
  null
from public.prompts
on conflict (user_id, id) do nothing;

insert into public.assets (
  user_id,
  id,
  project_id,
  asset_type,
  title,
  summary,
  content,
  metadata_json,
  source_type,
  source_asset_id,
  import_batch_id,
  original_filename,
  current_version_id,
  status,
  archived_at,
  deleted_at,
  deleted_reason,
  created_at,
  updated_at
)
select
  user_id,
  id,
  'default-project',
  'prompt',
  title,
  use_case,
  content,
  jsonb_build_object(
    'category', category,
    'tags', tags,
    'useCase', use_case,
    'mergedIntoAssetId', merged_into_prompt_id,
    'mergeVersionId', merge_version_id
  ),
  'system',
  null,
  null,
  null,
  'current-' || id,
  'active',
  null,
  deleted_at,
  deleted_reason,
  created_at,
  updated_at
from public.prompts
on conflict (user_id, id) do update
set
  project_id = excluded.project_id,
  title = excluded.title,
  summary = excluded.summary,
  content = excluded.content,
  metadata_json = excluded.metadata_json,
  current_version_id = excluded.current_version_id,
  deleted_at = excluded.deleted_at,
  deleted_reason = excluded.deleted_reason,
  updated_at = excluded.updated_at;

insert into public.asset_versions (
  user_id,
  version_id,
  asset_id,
  asset_type,
  version_number,
  title,
  summary,
  content,
  metadata_json,
  change_reason,
  version_reason,
  source_asset_ids,
  restored_at,
  expires_at,
  created_at
)
select
  user_id,
  'current-' || id,
  id,
  'prompt',
  1,
  title,
  use_case,
  content,
  jsonb_build_object(
    'category', category,
    'tags', tags,
    'useCase', use_case,
    'mergedIntoAssetId', merged_into_prompt_id,
    'mergeVersionId', merge_version_id
  ),
  '迁移旧提示词当前内容',
  'migration',
  '{}',
  null,
  null,
  updated_at
from public.prompts
on conflict (user_id, version_id) do nothing;

insert into public.asset_versions (
  user_id,
  version_id,
  asset_id,
  asset_type,
  version_number,
  title,
  summary,
  content,
  metadata_json,
  change_reason,
  version_reason,
  source_asset_ids,
  restored_at,
  expires_at,
  created_at
)
select
  user_id,
  version_id,
  prompt_id,
  'prompt',
  (
    row_number() over (
      partition by user_id, prompt_id
      order by created_at asc, version_id asc
    ) + 1
  )::integer,
  title,
  use_case,
  content,
  jsonb_build_object(
    'category', category,
    'tags', tags,
    'useCase', use_case,
    'mergedIntoAssetId', null,
    'mergeVersionId', null
  ),
  version_reason,
  version_reason,
  array(
    select jsonb_array_elements_text(source_prompt_ids_json::jsonb)
  ),
  restored_at,
  expires_at,
  created_at
from public.prompt_versions
on conflict (user_id, version_id) do nothing;
