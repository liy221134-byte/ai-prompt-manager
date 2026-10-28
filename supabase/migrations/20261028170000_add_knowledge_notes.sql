-- ────────────────────────────────────────────────────────
-- v4 M3：知识点讲义
--
-- 背景：到 M2.5 为止，系统能准确说「今天做哪几道题」，但答不了「这个知识点
--       到底在讲什么」——主题包里只有题目和知识点名字，没有一个字的讲解。
--       380 小时配 118 道题，一天 3 道 40 天刷完，剩下 160 天空着。
--       缺的是内容，不是功能。
--
-- 1) knowledge_points 加两列：
--      summary  一句话定义，卡片和练习题旁显示
--      note_md  讲义正文（要素 / 例题 / 怎么考三段，markdown）
--
--    不新建 materials 表：一个知识点一份讲义，一对一。
--    拆表只换来多一次 join 和一个可以「有讲义但没挂知识点」的悬空状态。
--
-- 2) 两列都可空。存量 29 个知识点没有讲义，导入器允许 note 缺省，
--    讲义是渐进补的，不该逼人一次写完全部知识点才能导入。
--
-- 纯新增列，不改现有列、不删数据 ⇒ /practice 与既有矩阵页不受影响。
-- ────────────────────────────────────────────────────────

alter table public.knowledge_points
  add column if not exists summary text,
  add column if not exists note_md text;

-- 讲义的检索路径是「按知识点取」，主键 (topic_id, id) 已覆盖，不另建索引。

comment on column public.knowledge_points.summary is
  '一句话定义。要求能独立成立（不依赖上下文），不超过 60 字。';
comment on column public.knowledge_points.note_md is
  '讲义正文，markdown。固定含「### 要素」「### 例题」「### 怎么考」三段。';

-- 表级权限沿用既有迁移里显式 grant 的口径（依赖 Supabase 平台的隐式授权
-- 在 PGlite / 本地库会直接 permission denied）。新列自动继承表级权限，
-- 这里补 write 权限的列级确认只为可读性，已由表级覆盖，故无需重复 grant。
