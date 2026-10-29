-- v4 学习系统 M2.6：周节奏（阶段与里程碑）
--
-- 给 learning_goals 加一列 phases：目标切成几段（启动期 / 基础期 / 强化期 / 冲刺期），
-- 每段带起止日和一个可选的里程碑。今日计划据此多显示一行
-- 「第 3 周 / 共 8 周 · 启动期 · 距「摸底模考」还有 4 天」。
--
-- 为什么是 jsonb 列而不是独立表：
--   一个目标最多 8 段，用途只有「读出来展示 + 一次计算」，
--   没有「按段聚合查询」的需求。建表要多一套 RLS、索引和关联查询，收益为零。
--   将来真需要按段统计时再加，那是一次带数据的迁移，成本可控。
--
-- 为什么不存「当前在第几段」：
--   由日期现算。存了就得每天维护，算出来永不落后。
--
-- 为什么不做阶段门禁（不到基础期就不让做某个模块的题）：
--   阶段日期是估算，模块工时也是估算，两个估算互相约束只会放大误差；
--   更要紧的是它会把「今天有空想多学」变成「系统不让」。
--   今日计划的语义是「建议」，不是「许可」，这条不能破。
--
-- 回滚：alter table public.learning_goals drop column phases;
--   新列默认空数组，不影响现有任何查询（今日计划在没有 phases 时整行不渲染）。

alter table public.learning_goals
  add column if not exists phases jsonb not null default '[]'::jsonb;

-- 数据库层只挡脏类型：必须是数组、最多 8 段。
--
-- 段间连续性（首尾相接、start <= end、start 有序）**不进数据库约束**：
-- 那是保存时归一化的事（src/lib/learning/phase.ts），在这里写一遍等于同一套规则
-- 维护两个地方，改一处忘一处就会「界面存得进去、数据库拒」。
-- 库里这条只兜住「根本不是数组」和「段数离谱」——这两种一旦进来，
-- 前端解析会静默退化成「没有阶段」，症状是那一行莫名消失，很难查。
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'learning_goals_phases_shape_check'
  ) then
    alter table public.learning_goals
      add constraint learning_goals_phases_shape_check
      check (
        jsonb_typeof(phases) = 'array'
        and jsonb_array_length(phases) <= 8
      );
  end if;
end $$;

-- 列级注释：让以后查库结构的人知道这段 JSON 长什么样，
-- 不用去翻前端类型定义。
comment on column public.learning_goals.phases is
  '阶段划分，元素形状：{key, name, start, end, milestone: {date, label} | null}。空数组表示没设阶段，界面不渲染这一行。';
