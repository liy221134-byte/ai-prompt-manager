-- v4 M7：论文批改记录
--
-- 一次批改一条记录。设计正本：
--   docs/superpowers/specs/2026-10-29-v4-m7-essay-review-design-and-tasks.md
--
-- 为什么只存「批改记录流」，不建「论文」主表 + 批改子表：
--   论文正文每次都可能大改（考场上是重新写一遍），不存在稳定的「一篇论文」这个实体。
--   要立主表就得让他给论文起名、管理列表、改名、删除——那是编辑器的活，不是批改的活。
--   同一篇的多稿靠 draft_label + 时间排列串起来，够看「上次指出的问题改了没」。
--   等真的出现「我要管理我的论文库」这个需求，那时候才知道主表该有哪些列。
--
-- 为什么题目原文必须和论文一起存（prompt_text not null）：
--   判「切没切题」的唯一依据是题目里的子问题清单。记录里只留论文不留题目，
--   三个月后回看这条批改，就再也说不清当时是拿哪道题比的。

create table if not exists public.learning_essay_reviews (
  id           text primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  topic_id     text not null references public.learning_topics (id) on delete cascade,
  -- 知识点 id（KP-0701 论文）。不设外键，理由同 learning_probes：
  -- 批改是历史记录，题库重组了知识点也不该把旧记录带走。
  kp_id        text,
  -- 题目原文。必填，见上面的说明。
  prompt_text  text not null,
  -- 论文正文。必填。
  essay_text   text not null,
  -- 「第 2 稿」这种人工标签，可空。只用于列表上区分，不参与任何判断。
  draft_label  text,
  -- 去空白后的字符数。落库存一份，是为了列表上能直接比「这一稿比上一稿多了多少」，
  -- 不用把全文拉回来重算。**与考试系统的计数口径未必一致，界面上只展示不判达标。**
  word_count   integer not null default 0,
  -- 四块产出：subQuestions / hardLineSuspects / dimensions / topFix。
  -- 用 jsonb 而不是拆列：这四块里前两块是数组，拆成列就得学生表关系表。
  result       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

-- 同一个主题下的批改按时间倒序列出来，就是稿次序列
create index if not exists learning_essay_reviews_user_topic_idx
  on public.learning_essay_reviews (user_id, topic_id, created_at desc);

-- ── 行级安全 ─────────────────────────────────────────────
alter table public.learning_essay_reviews enable row level security;

drop policy if exists "Users can read own essay reviews" on public.learning_essay_reviews;
create policy "Users can read own essay reviews"
on public.learning_essay_reviews for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own essay reviews" on public.learning_essay_reviews;
create policy "Users can insert own essay reviews"
on public.learning_essay_reviews for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own essay reviews" on public.learning_essay_reviews;
create policy "Users can update own essay reviews"
on public.learning_essay_reviews for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own essay reviews" on public.learning_essay_reviews;
create policy "Users can delete own essay reviews"
on public.learning_essay_reviews for delete to authenticated
using ((select auth.uid()) = user_id);

-- ── 表级授权 ─────────────────────────────────────────────
-- 显式写死，不依赖 Supabase 的隐式默认授权（同 M0 / M2 / M5）。
-- 本地库（PGlite）与线上库要能跑同一份迁移，靠的就是这一行。
grant select, insert, update, delete on public.learning_essay_reviews to authenticated;
