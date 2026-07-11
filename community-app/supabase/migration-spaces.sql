-- ============================================================
-- GetFit AF Community — Premium / Low-ticket spaces
-- Run in Supabase SQL Editor
-- ============================================================
--
-- Splits the single shared feed into separate "spaces" so premium
-- clients and the new low-ticket (₹500/mo) members don't see each
-- other's posts, while still living in the same app/database.
--
-- IMPORTANT — how premium access works after this migration:
-- Premium access is NOT moved onto the new space_memberships table.
-- It stays keyed off `profiles.approved`, exactly as it is today —
-- the existing pre-approved-clients list, the handle_new_user()
-- signup trigger, and the "Revoke" button in admin.html are
-- completely untouched by this file and keep working exactly as
-- before, for both current clients and anyone who signs up after
-- this runs. space_memberships only controls the new low_ticket
-- space (and, optionally later, granting a premium client dual
-- access to low_ticket too).
--
-- Wrapped in a transaction so this applies all-or-nothing — no
-- window where some policies are updated and others aren't while
-- real traffic is hitting the site.

begin;

-- 1. Space membership — who's been granted the low-ticket space (and,
-- optionally, extra spaces beyond someone's normal 'approved' access).
create table if not exists public.space_memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  space text not null check (space in ('premium', 'low_ticket')),
  created_at timestamptz not null default now(),
  unique (profile_id, space)
);

alter table public.space_memberships enable row level security;

drop policy if exists "space_memberships_select_own" on public.space_memberships;
create policy "space_memberships_select_own" on public.space_memberships for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

-- Only admins can grant/revoke — this is the manual-assignment step
-- Satish does himself from /admin/members after confirming payment.
drop policy if exists "space_memberships_admin_write" on public.space_memberships;
create policy "space_memberships_admin_write" on public.space_memberships for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 2. Which space a post belongs to. Comments/likes don't get their own
-- space column — their visibility is derived from the post they're
-- attached to via a join, so there's one source of truth per post
-- rather than needing to keep multiple columns in sync.
alter table public.posts
  add column if not exists space text not null default 'premium' check (space in ('premium', 'low_ticket'));

-- 3. Single helper function used by every policy below, so the same
-- "premium via approved, everything else via space_memberships" rule
-- is defined exactly once instead of copy-pasted into 8 policies
-- (and risking one of them drifting out of sync with the others).
create or replace function public.has_space_access(check_space text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.is_admin()
    or (
      check_space = 'premium'
      and exists (
        select 1 from public.profiles where id = auth.uid() and approved = true
      )
    )
    or exists (
      select 1 from public.space_memberships m
      where m.profile_id = auth.uid() and m.space = check_space
    )
$$;

-- 4. Posts.
drop policy if exists "posts_select" on public.posts;
create policy "posts_select" on public.posts for select to authenticated
  using (public.has_space_access(posts.space));

drop policy if exists "posts_insert" on public.posts;
create policy "posts_insert" on public.posts for insert to authenticated
  with check (auth.uid() = author_id and public.has_space_access(posts.space));

-- posts_update / posts_delete are untouched — ownership (or admin)
-- already gates those and doesn't need a space check on top.

-- 5. Comments — scoped via the parent post's space.
drop policy if exists "comments_select" on public.comments;
create policy "comments_select" on public.comments for select to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = comments.post_id and public.has_space_access(p.space)
    )
  );

drop policy if exists "comments_insert" on public.comments;
create policy "comments_insert" on public.comments for insert to authenticated
  with check (
    auth.uid() = author_id
    and exists (
      select 1 from public.posts p
      where p.id = comments.post_id and public.has_space_access(p.space)
    )
  );

-- 6. Likes — same pattern as comments.
drop policy if exists "likes_select" on public.likes;
create policy "likes_select" on public.likes for select to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = likes.post_id and public.has_space_access(p.space)
    )
  );

drop policy if exists "likes_insert" on public.likes;
create policy "likes_insert" on public.likes for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.posts p
      where p.id = likes.post_id and public.has_space_access(p.space)
    )
  );

-- 7. Comment likes — was previously open to any authenticated user at
-- all (see migration-notifications.sql). Tightened here to match, via
-- the comment's post's space.
drop policy if exists "comment_likes_select" on comment_likes;
create policy "comment_likes_select" on comment_likes for select to authenticated
  using (
    exists (
      select 1 from public.comments c
      join public.posts p on p.id = c.post_id
      where c.id = comment_likes.comment_id and public.has_space_access(p.space)
    )
  );

drop policy if exists "comment_likes_insert" on comment_likes;
create policy "comment_likes_insert" on comment_likes for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.comments c
      join public.posts p on p.id = c.post_id
      where c.id = comment_likes.comment_id and public.has_space_access(p.space)
    )
  );

commit;
