-- Pinned posts migration
--
-- Lets an admin pin any post (their own or a member's) to the very
-- top of the feed, independent of the is_announcement flag — an
-- announcement still gets pushed down by newer announcements over
-- time, but a pinned post stays put until unpinned.
--
-- Run this once in the SQL Editor of the getfitaf-portal Supabase
-- project. Safe to re-run.
--
-- This exact file also lives at
-- learn-portal/supabase-migration-community-pinned-posts.sql for
-- consistency with the other mirrored migrations.

alter table public.posts add column if not exists pinned boolean not null default false;

-- Broaden posts_update so an admin can toggle "pinned" on ANY post,
-- not just their own. (Admins already have full delete rights on any
-- post/comment via posts_delete/comments_delete — this is consistent
-- with that existing trust level.)
drop policy if exists "posts_update" on public.posts;

create policy "posts_update" on public.posts for update to authenticated
  using (auth.uid() = author_id or public.is_admin());
