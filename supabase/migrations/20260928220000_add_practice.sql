-- 线索 4 云端半边：练习题库（practice）。
-- 与现有资产库同一套账号体系（Supabase Auth）+ 按用户隔离约定（auth.uid() + RLS）。
-- practice_questions：系统题库，全局可读、仅系统/迁移写入（不向终端用户开放写接口）。
-- practice_attempts：答题记录，仅本人可见（按 user_id 隔离）。

create table if not exists public.practice_questions (
  id text primary key,
  asset_id text,
  category text not null,
  title text not null,
  body_md text not null,
  options jsonb not null,
  answer text not null,
  explanation_md text not null,
  difficulty text not null default 'medium',
  created_at timestamptz not null default now()
);

alter table public.practice_questions enable row level security;

drop policy if exists "Authenticated can read practice questions" on public.practice_questions;
create policy "Authenticated can read practice questions"
on public.practice_questions
for select
to authenticated
using (true);

-- 题目由系统/迁移写入：不建 insert/update/delete 策略，终端用户无写权限。

create index if not exists practice_questions_category_idx
on public.practice_questions (category, created_at);

create table if not exists public.practice_attempts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null references public.practice_questions(id) on delete cascade,
  selected text not null,
  is_correct boolean not null,
  created_at timestamptz not null default now()
);

alter table public.practice_attempts enable row level security;

drop policy if exists "Users can read own attempts" on public.practice_attempts;
create policy "Users can read own attempts"
on public.practice_attempts
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own attempts" on public.practice_attempts;
create policy "Users can insert own attempts"
on public.practice_attempts
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create index if not exists practice_attempts_user_idx
on public.practice_attempts (user_id, created_at desc);

-- 首批种子题目：从资产库规则/方法映射（事前验尸、红队、需求三格式、设计计划、界面文案、单一真相源）。
-- 题目正文为自造测试数据，无 PII；答案以选项原文存储，便于直连比对。

insert into public.practice_questions
  (id, asset_id, category, title, body_md, options, answer, explanation_md, difficulty)
values
  (
    'pq-premortem-01',
    'RULE-PREMORTEM-001',
    '需求与规划',
    '事前验尸（pre-mortem）的核心动作是什么？',
    '事前验尸是项目启动前的一种逆向推演方法。',
    '["假定项目已经失败，倒推导致失败的原因", "庆祝项目成功", "先写自动化测试", "画系统架构图"]'::jsonb,
    '假定项目已经失败，倒推导致失败的原因',
    '事前验尸要求团队**先假设项目已经失败**，再集体倒推“哪些事会导致这个结局”，从而提前识别风险。它不关注成功路径，而是专门挖失败模式。',
    'easy'
  ),
  (
    'pq-redteam-01',
    'RULE-REDTEAM-001',
    '需求与规划',
    '红队评审应优先攻击哪一类假设？',
    '红队评审用于检验方案里“假了方案就死”的承重假设。',
    '["假了方案就死的承重假设", "已经验证过的事实", "用户界面的颜色", "文档的排版"]'::jsonb,
    '假了方案就死的承重假设',
    '红队只打**承重假设**——也就是“一旦不成立，方案就崩”的那些前提。打稻草人（明显不成立或无关紧要的点）没有价值，识别失败模式后要给出可一周内做完的最小实验去验证。',
    'medium'
  ),
  (
    'pq-reqformat-01',
    'MTH-REQ-FORMAT-001',
    '需求表达',
    '用户故事（User Story）的标准句式是？',
    '需求改写成三种格式之一：用户故事强调角色、功能与价值。',
    '["作为一个<角色>，我想要<功能>，以便<价值>", "先写技术方案再写需求", "直接开始写代码", "画一张流程图"]'::jsonb,
    '作为一个<角色>，我想要<功能>，以便<价值>',
    '用户故事的 3C 结构：**角色（Card 卡片）— 对话（Conversation）— 验收（Confirmation）**。标准句式把“谁、要什么、为什么”一次说清，便于点一遍判通过或失败。',
    'easy'
  ),
  (
    'pq-designplan-01',
    'RULE-DESIGN-TEMPLATE-LOOK-001',
    '界面设计',
    '防“模板味”的第一步应该做什么？',
    '设计计划阶段要先定视觉方向，再对照简报自查。',
    '["把“换成别的同类产品也成立”的部分找出来并改掉", "直接套用现成模板", "堆砌行业黑话", "照搬竞品配色"]'::jsonb,
    '把“换成别的同类产品也成立”的部分找出来并改掉',
    '模板味的根因是“这套设计放在任何同类产品都成立”。所以第一步是**自查哪些部分换个别的产品也成立**，把它们替换成只属于本产品的具体决策，界面才有辨识度。',
    'medium'
  ),
  (
    'pq-designcopy-01',
    'RULE-DESIGN-COPY-001',
    '界面设计',
    '界面文案应该尽量避免什么？',
    '界面文案是用户直接读到的语言，属于设计计划里的“复制”环节。',
    '["堆砌行业黑话、不用人话", "用短句说清一件事", "给出明确的操作指引", "和界面状态一致"]'::jsonb,
    '堆砌行业黑话、不用人话',
    '界面文案要**用人话、用短句、和状态一致**。黑话和空话会让用户读不懂操作，反而增加支持成本。',
    'easy'
  ),
  (
    'pq-singlesource-01',
    null,
    '工程规范',
    '同一份事实在资产库里应该怎么放？',
    '这是资产库的基础口径约定。',
    '["只写一处，其余引用", "每个文档各写一份", "写到聊天记录里", "口头同步即可"]'::jsonb,
    '只写一处，其余引用',
    '**单一真相源**：同一份事实只写一处，其余地方引用它。这样改一处就能全局生效，避免“三份载体各说各话”导致的口径漂移。',
    'easy'
  );
