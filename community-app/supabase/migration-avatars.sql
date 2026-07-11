-- ============================================================
-- GetFit AF Community — Profile Avatars Migration
-- Run in Supabase SQL Editor
-- ============================================================
--
-- BEFORE running this: create a new storage bucket named "avatars" in
-- the Supabase dashboard (Storage → New bucket), marked Public — same
-- way "post-media" was created. This migration only adds the RLS
-- policies on top of it; it can't create the bucket itself.
--
-- No changes are needed to the "profiles" table's own RLS — the
-- existing "profiles_update" policy (id = auth.uid() OR is_admin())
-- already allows someone to update their own full_name/avatar_url, and
-- already allows admins to update anyone's.
--
-- Each user's photo lives at a fixed path ({user_id}/avatar) and is
-- uploaded with upsert:true, so replacing a photo overwrites the old
-- file in place instead of leaving old versions to accumulate in
-- storage over time.

create policy "avatar_upload" on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "avatar_update" on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Any logged-in community member can view any avatar — same as any
-- other social app (Slack, Discord, etc. treat profile photos as
-- visible to the group, not private).
create policy "avatar_select" on storage.objects for select
  using (bucket_id = 'avatars' and auth.role() = 'authenticated');

-- A user can remove their own photo, and an admin can remove anyone's
-- (used by the admin "Reset photo" action).
create policy "avatar_delete" on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or public.is_admin()
    )
  );

-- Hard server-side cap — avatars never render larger than ~64px in this
-- app, so there's no reason to accept a huge raw photo. Enforced by
-- Supabase itself at upload time (not just the file picker's "accept"
-- hint on the frontend, which is easy to bypass). 2MB is generous for a
-- headshot-style crop while keeping any one upload from eating a large
-- chunk of the shared 1GB free-tier storage budget.
update storage.buckets
set file_size_limit = 2097152, -- 2MB, in bytes
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'avatars';
