create table if not exists public.rule_assets (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  title text not null,
  source_type text not null,
  content text not null,
  category text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (user_id, id)
);

alter table public.rule_assets enable row level security;

drop policy if exists "Users can read own rule assets" on public.rule_assets;
create policy "Users can read own rule assets"
on public.rule_assets
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own rule assets" on public.rule_assets;
create policy "Users can insert own rule assets"
on public.rule_assets
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own rule assets" on public.rule_assets;
create policy "Users can update own rule assets"
on public.rule_assets
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own rule assets" on public.rule_assets;
create policy "Users can delete own rule assets"
on public.rule_assets
for delete
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists rule_assets_user_updated_idx
on public.rule_assets (user_id, updated_at desc);

create table if not exists public.rules (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  asset_id text not null,
  type text not null,
  priority text not null,
  statement text not null,
  rationale text not null,
  source_excerpt text not null,
  status text not null,
  primary key (user_id, id),
  foreign key (user_id, asset_id)
    references public.rule_assets(user_id, id)
    on delete cascade
);

alter table public.rules enable row level security;

drop policy if exists "Users can read own rules" on public.rules;
create policy "Users can read own rules"
on public.rules
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own rules" on public.rules;
create policy "Users can insert own rules"
on public.rules
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own rules" on public.rules;
create policy "Users can update own rules"
on public.rules
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own rules" on public.rules;
create policy "Users can delete own rules"
on public.rules
for delete
to authenticated
using ((select auth.uid()) = user_id);
