-- 给学习模块加「是否进能力诊断」开关。
--
-- 背景（2026-10-29）：学习目标从中项升为高项后新增两个模块——论文、高项新增考点。
-- 它们只有 L5 实操题，在 L1—L4 没有可判分题。诊断组卷是逐格遍历的，
-- 照常遍历会给它们各产出四个「这层没题」的空格子，
-- 报告上就写成「你在论文模块 L1 就卡住了」——那是题库的形状，不是他的水平。
--
-- 为什么用显式列，而不是拿「该模块有没有 L1—L4 的题」自动推断：
-- 「某格只有实操题要记成缺口」是既有行为（tests/diagnostic.test.mjs 有专门用例保护），
-- 自动推断会把这套格级语义一起推翻。显式标记让两件事互不干扰。
--
-- 默认 true：存量六个模块行为不变；新模块在主题包里写 in_diagnostic: false 即可。

alter table public.learning_modules
  add column if not exists in_diagnostic boolean not null default true;

comment on column public.learning_modules.in_diagnostic is
  '是否参与能力诊断组卷。false 表示该模块没有 L1—L4 的可判分题，整块不抽题也不记「这层没题」';
