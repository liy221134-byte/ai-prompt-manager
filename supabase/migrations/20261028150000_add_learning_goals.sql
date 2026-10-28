-- v4 学习系统 M2：多学习目标
-- 1) learning_topics 加 kind（目标类型）与 level_definition（阶梯定义）
-- 2) 新建 learning_goals：用户对某个主题的启用与个人参数
-- 3) 部分唯一索引：每人同时只有一个主攻目标
--
-- 为什么分成两张表而不是把字段堆在 learning_topics 上：
--   learning_topics 是「内容」——一份主题包一行，所有登录用户看的是同一份；
--   learning_goals 是「我的安排」——同一个中项主题，我每周投入 13 小时、明年 5 月考，
--   换个人可能是每周 3 小时、后年考。混在一张表里，第二个人一改就把第一个人的改了。
--   这与现有 learning_diagnostics 的处理一致：内容公共只读，个人数据按 user_id 隔离。
--
-- 为什么 level_definition 进主题而不是进代码：
--   五层的「结构」通用，「名字与判据」因目标性质而异。考试型是「认得/说得出/算得出/
--   判得准/迁得动」，技能型是「看得懂/改得动/写得出/调得通/能设计」，用同一套判据
--   去量 Python 会量错——能背出装饰器定义不等于会写。所以阶梯定义随主题走，
--   系统只约束「必须五层、判据必须可观察」。

-- ── 1. 主题补字段 ────────────────────────────────────────
-- 存量主题（中项 v1.1）回填为考试型，阶梯定义由导入器按内置模板补齐。
alter table public.learning_topics
  add column if not exists kind             text  not null default 'exam',
  add column if not exists level_definition jsonb not null default '[]'::jsonb;

-- 四类目标性质。加类型不是为了分类好看，是为了决定阶梯怎么搭、进度怎么判：
-- 考试型看分数，技能型看能不能写出东西，体系型看覆盖是否互相支撑，行为型看是否稳定复用。
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'learning_topics_kind_check'
  ) then
    alter table public.learning_topics
      add constraint learning_topics_kind_check
      check (kind in ('exam', 'skill', 'system', 'behavior'));
  end if;
end $$;

-- ── 2. 学习目标表 ────────────────────────────────────────
-- 一行 = 一个人启用了一个主题。没启用过的主题不出现在列表里。
create table if not exists public.learning_goals (
  id          text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  topic_id    text not null references public.learning_topics (id) on delete cascade,
  -- 主攻：同时只有一个。今日计划只服务主攻，其余显示「排队中」——
  -- 七个目标各给一份今日待办，等于没有计划。
  is_focus    boolean not null default false,
  status      text not null default 'active',
  -- 每周可投入小时。这是个人安排，不是主题属性，所以放这里不放 topics。
  weekly_hours numeric,
  -- 目标日期与说明可覆盖主题上的官方日期：主题的 deadline 是考试日，
  -- 这里记的是「我打算哪次考」。两者不一致时以这里为准。
  target_date date,
  target_note text,
  started_at  date not null default current_date,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, topic_id),
  constraint learning_goals_status_check
    check (status in ('active', 'paused', 'done')),
  constraint learning_goals_weekly_hours_check
    check (weekly_hours is null or weekly_hours > 0)
);

-- 同一个人的主攻只能有一个。用部分唯一索引在数据库层兜住：
-- 界面上忘了互斥，这里也会直接拒绝，不会出现「两个目标都说是主攻」的脏数据。
create unique index if not exists learning_goals_one_focus_per_user
  on public.learning_goals (user_id)
  where is_focus;

create index if not exists learning_goals_user_status_idx
  on public.learning_goals (user_id, status);

create index if not exists learning_goals_topic_idx
  on public.learning_goals (topic_id);

-- ── 3. 行级安全 ─────────────────────────────────────────
alter table public.learning_goals enable row level security;

drop policy if exists "Users can read own goals" on public.learning_goals;
create policy "Users can read own goals"
on public.learning_goals for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own goals" on public.learning_goals;
create policy "Users can insert own goals"
on public.learning_goals for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own goals" on public.learning_goals;
create policy "Users can update own goals"
on public.learning_goals for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own goals" on public.learning_goals;
create policy "Users can delete own goals"
on public.learning_goals for delete to authenticated
using ((select auth.uid()) = user_id);

-- ── 4. 表级授权 ─────────────────────────────────────────
-- 同 M0：显式写死，不依赖 Supabase 的隐式默认授权。
grant select, insert, update, delete on public.learning_goals to authenticated;
