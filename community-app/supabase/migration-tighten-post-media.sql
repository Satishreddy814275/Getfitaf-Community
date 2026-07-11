-- ============================================================
-- GetFit AF Community — Tighten post-media storage policy
-- Run in Supabase SQL Editor
-- ============================================================
--
-- The original post-media upload policy allowed any authenticated user
-- to upload into ANY path in the bucket, not just their own — even
-- though the app itself only ever uploads to {user_id}/{timestamp}.ext
-- (see PostComposer.tsx). This scopes it to match, same pattern already
-- used for the "avatars" bucket.
--
-- The SELECT (read) policy is deliberately left as-is — every file here
-- belongs to a post shared in the community feed, so it's meant to be
-- visible to every logged-in member, not just whoever uploaded it (same
-- reasoning as avatars being viewable by the whole community). Only the
-- write side needed tightening.

drop policy if exists "community_media_upload" on storage.objects;

create policy "community_media_upload" on storage.objects for insert
  with check (
    bucket_id = 'post-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
