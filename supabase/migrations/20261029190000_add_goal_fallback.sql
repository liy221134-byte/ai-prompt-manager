-- 保底考试：当前目标没达成时的下一个出口。
--
-- 场景：2027-05 只有一次高项机会（一年一次），而中项 5 月与下半年各一次。
-- 所以策略是 5 月押高项，未过则转下半年中项。这件事得有个地方记着，
-- 否则 5 月考完到 8 月报名之间没人提醒「还有一次机会」，很容易整年空过。
--
-- 为什么不写进主题包的 exam_facts.milestones：
--   主题＝内容（公共只读），目标＝个人安排。「我打算拿中项保底」是个人策略，
--   另一个用户可能只考中项、根本没有保底。写进主题包就变成了公共事实。
--
-- 为什么不建第二个目标、用 status='queued' 标记：
--   这张表上有两条约束挡着，而且都是对的：
--     ① UNIQUE(user_id, topic_id)——同一主题只能有一个目标；
--     ② status 的 CHECK 只允许 active / paused / done。
--   更根本的是：保底不是第二个目标。它没有自己的知识点、进度和今日计划，
--   只是当前目标的一个出口。真到要转的时候，是改这个目标的考试日期，
--   不是新建一条。
--
-- 形状：{ exam, date, registration, note }
--   exam          考试名称（必填，没有它整条视为无效）
--   date          考试日 YYYY-MM-DD 或 null（官方年度计划未发布时留 null）
--   registration  报名窗口说明，如「2027-08 中旬」，或 null
--   note          一句说明：什么条件下切过去
alter table learning_goals
  add column if not exists fallback jsonb;

alter table learning_goals
  drop constraint if exists learning_goals_fallback_shape_check;

-- 只允许 null 或对象。写成一维数组（比如误把 milestones 的结构抄过来）
-- 在解析层会静默变成 null，界面上什么都不显示——那种失败没法排查，所以在库里拦。
alter table learning_goals
  add constraint learning_goals_fallback_shape_check
  check (fallback is null or jsonb_typeof(fallback) = 'object');

comment on column learning_goals.fallback is
  '保底考试出口：{ exam, date, registration, note }。没有保底则为 null。';
