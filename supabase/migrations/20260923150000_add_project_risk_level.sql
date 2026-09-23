-- 2.8.0：项目质量等级（个人工具 / 低风险生产 / 涉及用户数据 / 高敏感项目）。
-- 决定这个项目该有哪些工程文档、该关注哪些规则方向、发布前要做哪些检查。
-- 可重复执行；老项目按「个人工具」回填，读端缺字段时也按这个默认值处理。

alter table public.projects
  add column if not exists risk_level text not null default 'personal';

alter table public.projects
  drop constraint if exists projects_risk_level_check;

alter table public.projects
  add constraint projects_risk_level_check
  check (risk_level in ('personal', 'low_risk', 'user_data', 'high_sensitive'));
