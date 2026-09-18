create extension if not exists pgcrypto;

create table if not exists public.prompts (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  title text not null,
  category text not null,
  tags text[] not null default '{}',
  content text not null,
  use_case text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (user_id, id)
);

alter table public.prompts enable row level security;

drop policy if exists "Users can read own prompts" on public.prompts;
create policy "Users can read own prompts"
on public.prompts
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own prompts" on public.prompts;
create policy "Users can insert own prompts"
on public.prompts
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own prompts" on public.prompts;
create policy "Users can update own prompts"
on public.prompts
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own prompts" on public.prompts;
create policy "Users can delete own prompts"
on public.prompts
for delete
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists prompts_user_updated_idx
on public.prompts (user_id, updated_at desc);

create table if not exists public.health_checks (
  id text primary key,
  last_seen_at timestamptz not null
);

alter table public.health_checks enable row level security;
