-- 2.1.1：来源包原文的云端存放空间。
-- 私有桶，按用户隔离：对象路径第一段必须是当前登录用户的 id，
-- 所以两个账号之间互相读不到对方的原文。二进制只放在 Storage，不进资产正文。

insert into storage.buckets (id, name, public, file_size_limit)
values ('source-packages', 'source-packages', false, 20971520)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

-- 读：只能读自己目录下的对象
drop policy if exists "Users can read own source packages" on storage.objects;
create policy "Users can read own source packages"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'source-packages'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- 写：只能往自己目录下上传
drop policy if exists "Users can upload own source packages" on storage.objects;
create policy "Users can upload own source packages"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'source-packages'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- 改：覆盖同名对象时同样限在自己目录内
drop policy if exists "Users can update own source packages" on storage.objects;
create policy "Users can update own source packages"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'source-packages'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'source-packages'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- 删：放弃一次未确认的上传时用
drop policy if exists "Users can delete own source packages" on storage.objects;
create policy "Users can delete own source packages"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'source-packages'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
