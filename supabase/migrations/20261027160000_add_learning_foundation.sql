-- v4 学习系统 M0：数据地基
-- 1) practice_questions 补学习相关字段（含能力层级 level）
-- 2) practice_attempts 补耗时与上下文
-- 3) 新建四张表：learning_topics / learning_modules / knowledge_points / learning_diagnostics
-- 4) 索引与行级安全
--
-- 纯新增，不改任何现有列、不删任何数据 ⇒ 存量 119 题与现有 /practice 功能不受影响。
-- 命名说明：模块表叫 modules 不叫 stages。S1—S6 是内容分区，不是能力阶梯，
--           这个判断见 docs/learning/v4-plan.md 第一节；层级 L1—L5 是产品常量，不建表。
--
-- 本版只建结构，不写任何业务逻辑（诊断、自适应出题都在 M2/M3）。

-- ── 1. 题目表补字段 ──────────────────────────────────────
-- 全部可空（source 除外），存量数据不需要回填，也不会让现有查询失败。
alter table public.practice_questions
  add column if not exists knowledge_point text,
  add column if not exists source          text not null default 'manual',
  add column if not exists source_url      text,
  add column if not exists topic_id        text,
  add column if not exists module_id       text,
  add column if not exists level           smallint;

-- 能力层级只允许 1—5。用约束而不是建表：层级一旦可增删，诊断矩阵和历史数据全部失效。
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'practice_questions_level_check'
  ) then
    alter table public.practice_questions
      add constraint practice_questions_level_check
      check (level is null or level between 1 and 5);
  end if;
end $$;

-- ── 2. 答题记录补字段 ────────────────────────────────────
alter table public.practice_attempts
  add column if not exists duration_ms integer,
  add column if not exists context     jsonb;

-- ── 3. 四张表 ────────────────────────────────────────────

-- 主题：一份主题包 = 一行。raw 保留 AI 产出的完整原文，便于回溯与重导入。
create table if not exists public.learning_topics (
  id             text primary key,
  name           text not null,
  goal           text,
  deadline       date,
  total_hours    numeric,
  start_date     date,
  exam_facts     jsonb not null default '{}'::jsonb,
  schema_version numeric not null default 1,
  raw            jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 内容模块：6 行/主题。主键用 (topic_id, id)，因为 S1 这种短 id 换个主题就会撞。
-- weight / expected_gap / planned_hours 三个数值字段本版只存不校验，等 M0.5 校准后才作为出题依据。
create table if not exists public.learning_modules (
  topic_id       text not null references public.learning_topics (id) on delete cascade,
  id             text not null,
  order_index    integer not null,
  name           text not null,
  scope_chapters integer[] not null default '{}',
  weight         numeric,
  expected_gap   smallint,
  planned_hours  numeric,
  entry_criteria text,
  exit_criteria  text,
  common_mistakes jsonb not null default '[]'::jsonb,
  min_project    text,
  note           text,
  primary key (topic_id, id),
  constraint learning_modules_gap_check
    check (expected_gap is null or expected_gap between 1 and 5)
);

-- 知识点：挂模块，parent_id 支持层级（用于错题向上归因，可不填）。
create table if not exists public.knowledge_points (
  topic_id   text not null references public.learning_topics (id) on delete cascade,
  id         text not null,
  module_id  text not null,
  parent_id  text,
  name       text not null,
  ref        text,
  order_index integer,
  primary key (topic_id, id),
  foreign key (topic_id, module_id) references public.learning_modules (topic_id, id) on delete cascade,
  foreign key (topic_id, parent_id) references public.knowledge_points (topic_id, id) on delete set null
);

-- 诊断记录：本人可见。result 存原始答题结果，matrix 存算好的「模块 × 层级」矩阵。
create table if not exists public.learning_diagnostics (
  id         text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  topic_id   text not null references public.learning_topics (id) on delete cascade,
  kind       text not null,
  taken_at   timestamptz not null default now(),
  result     jsonb not null default '{}'::jsonb,
  matrix     jsonb,
  notes      text,
  created_at timestamptz not null default now(),
  constraint learning_diagnostics_kind_check
    check (kind in ('baseline', 'module_gate', 'retest'))
);

-- ── 4. 索引 ─────────────────────────────────────────────
create index if not exists practice_questions_topic_module_level_idx
  on public.practice_questions (topic_id, module_id, level);

create index if not exists practice_questions_knowledge_point_idx
  on public.practice_questions (knowledge_point);

create index if not exists learning_modules_topic_order_idx
  on public.learning_modules (topic_id, order_index);

create index if not exists knowledge_points_topic_module_idx
  on public.knowledge_points (topic_id, module_id);

create index if not exists learning_diagnostics_user_idx
  on public.learning_diagnostics (user_id, topic_id, taken_at desc);

-- ── 5. 行级安全 ─────────────────────────────────────────
-- 主题 / 模块 / 知识点是题库同级的公共内容：登录用户可读，写入只走迁移与导入脚本。
alter table public.learning_topics      enable row level security;
alter table public.learning_modules     enable row level security;
alter table public.knowledge_points     enable row level security;
alter table public.learning_diagnostics enable row level security;

drop policy if exists "Authenticated can read learning topics" on public.learning_topics;
create policy "Authenticated can read learning topics"
on public.learning_topics for select to authenticated using (true);

drop policy if exists "Authenticated can read learning modules" on public.learning_modules;
create policy "Authenticated can read learning modules"
on public.learning_modules for select to authenticated using (true);

drop policy if exists "Authenticated can read knowledge points" on public.knowledge_points;
create policy "Authenticated can read knowledge points"
on public.knowledge_points for select to authenticated using (true);

-- 诊断结果是个人数据：只看自己、只写自己。
drop policy if exists "Users can read own diagnostics" on public.learning_diagnostics;
create policy "Users can read own diagnostics"
on public.learning_diagnostics for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own diagnostics" on public.learning_diagnostics;
create policy "Users can insert own diagnostics"
on public.learning_diagnostics for insert to authenticated
with check ((select auth.uid()) = user_id);

-- ── 6. 表级授权 ─────────────────────────────────────────
-- Supabase 默认为 public 模式的表授予 authenticated 基础权限，但这属于平台行为，
-- 不是数据库默认行为——本地库、PGlite 或换一个环境跑就没有。
-- 这里显式写死，让「本地能跑通」和「线上能跑通」是同一件事，不依赖隐式默认。
grant usage on schema public to authenticated;
grant select on public.learning_topics, public.learning_modules, public.knowledge_points
  to authenticated;
grant select, insert on public.learning_diagnostics to authenticated;
