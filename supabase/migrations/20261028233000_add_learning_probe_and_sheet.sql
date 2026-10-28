-- v4 学习系统 M5：对话式追问 + 一页素材表
-- 1) learning_probes：一道错题的一次追问会话（回合记录 + 人确认过的结论）
-- 2) learning_sheets：一个模块的一张纸（六段，jsonb）
--
-- 为什么追问不塞进 practice_attempts.context：
--   practice_attempts 记的是「做没做对」这个事实，追问记的是「为什么错」这个解释。
--   两件事生命周期不同：作答记录答对后仍然成立，追问结论会被后来的追问推翻；
--   追问是一段多轮记录，塞进 context 等于把 jsonb 当文档库用；
--   要按知识点统计「老卡在哪些概念上」，也需要独立查询。
--
-- 为什么素材表放 jsonb 而不是六个列：
--   段落在未来可能增删（比如加一段「口诀」）。六列改起来要迁移，jsonb 只是多一个键。
--   一页纸是给自己看的复习材料，不做版本历史，所以一个模块唯一一张。

-- ── 1. 追问会话 ──────────────────────────────────────────
create table if not exists public.learning_probes (
  id              text primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  topic_id        text not null references public.learning_topics (id) on delete cascade,
  question_id     text not null references public.practice_questions (id) on delete cascade,
  -- 知识点 id（KP-0104 这种），与 practice_questions.knowledge_point 同一套取值。
  -- 不设外键：追问是历史记录，题库后来重组了知识点也不该把旧记录带走；
  -- 且选不到知识点时这里是 null，不需要为此造一条假记录。
  knowledge_point text,
  -- 完整的问答回合。留着是为了「这个结论是怎么得出的」可回看，
  -- 也是模型说错话时唯一的证据。形如 [{ role: "ai" | "me", text, at }]。
  transcript      jsonb not null default '[]'::jsonb,
  -- 人确认过的结论 { stuck, knowledgePointId, next }。
  -- AI 原始输出不单独存第二份：确认前后都在 transcript 里。
  verdict         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

-- 同一道题可以被追问多次（几个月后重做又错了，值得再问一次），所以不加唯一约束。

create index if not exists learning_probes_user_topic_idx
  on public.learning_probes (user_id, topic_id, created_at desc);

create index if not exists learning_probes_question_idx
  on public.learning_probes (question_id);

-- ── 2. 一页素材表 ────────────────────────────────────────
create table if not exists public.learning_sheets (
  id         text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  topic_id   text not null references public.learning_topics (id) on delete cascade,
  module_id  text not null,
  -- 六段 { definition, concepts, example, mistakes, checklist, selftest }
  sections   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 模块必须真属于这个主题：用复合外键而不是只引 module_id，
  -- 否则「A 主题的纸挂在 B 主题的模块上」这种脏数据数据库拦不住。
  constraint learning_sheets_module_fk
    foreign key (topic_id, module_id)
    references public.learning_modules (topic_id, id) on delete cascade,
  -- 一个模块一张纸。
  constraint learning_sheets_unique
    unique (user_id, topic_id, module_id)
);

create index if not exists learning_sheets_user_topic_idx
  on public.learning_sheets (user_id, topic_id);

-- ── 3. 行级安全 ─────────────────────────────────────────
-- 两张表都是个人数据：只看自己、只写自己、只能删自己的。
alter table public.learning_probes enable row level security;
alter table public.learning_sheets enable row level security;

drop policy if exists "Users can read own probes" on public.learning_probes;
create policy "Users can read own probes"
on public.learning_probes for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own probes" on public.learning_probes;
create policy "Users can insert own probes"
on public.learning_probes for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own probes" on public.learning_probes;
create policy "Users can update own probes"
on public.learning_probes for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own probes" on public.learning_probes;
create policy "Users can delete own probes"
on public.learning_probes for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own sheets" on public.learning_sheets;
create policy "Users can read own sheets"
on public.learning_sheets for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own sheets" on public.learning_sheets;
create policy "Users can insert own sheets"
on public.learning_sheets for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own sheets" on public.learning_sheets;
create policy "Users can update own sheets"
on public.learning_sheets for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own sheets" on public.learning_sheets;
create policy "Users can delete own sheets"
on public.learning_sheets for delete to authenticated
using ((select auth.uid()) = user_id);

-- ── 4. 表级授权 ─────────────────────────────────────────
-- 同 M0 / M2：显式写死，不依赖 Supabase 的隐式默认授权。
-- 本地库（PGlite）与线上库要能跑同一份迁移，靠的就是这两行。
grant select, insert, update, delete on public.learning_probes to authenticated;
grant select, insert, update, delete on public.learning_sheets to authenticated;
