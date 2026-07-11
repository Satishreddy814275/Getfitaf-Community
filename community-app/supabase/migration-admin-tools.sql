-- Admin/moderation tools migration
--
-- posts_delete and comments_delete policies already allow
-- public.is_admin() (see schema.sql) — no change needed there.
-- This just extends storage delete rights so an admin deleting a
-- post can also remove its uploaded photo/video from the
-- "post-media" bucket, not just the post owner.
--
-- Run this once in the SQL Editor of the getfitaf-portal Supabase
-- project. Safe to re-run (drops and recreates the policy).

drop policy if exists "community_media_delete_admin" on storage.objects;

create policy "community_media_delete_admin" on storage.objects for delete
  using (bucket_id = 'post-media' and public.is_admin());
