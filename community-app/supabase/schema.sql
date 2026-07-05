-- GetFit AF Community Platform — Phase 1 schema
--
-- IMPORTANT: This runs against the SAME Supabase project as
-- learn.getfitaf.fitness ("getfitaf-portal"), not a standalone
-- project. auth.users, public.profiles, and public.is_admin()
-- already exist there — do not recreate them.
--
-- This exact file also lives at
-- learn-portal/supabase-migration-community.sql for consistency
-- with that project's other numbered migrations. Run it once,
-- in the SQL Editor of the getfitaf-portal project.

-- POSTS — text, photo, or video
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text,
  media_url text,
  media_type text check (media_type in ('image', 'video')),
  created_at timestamptz not null default now()
);

alter table public.posts enable row level security;

create policy "posts_select" on public.posts for select to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and approved = true)
    or public.is_admin()
  );

create policy "posts_insert" on public.posts for insert to authenticated
  with check (
    auth.uid() = author_id
    and (
      exists (select 1 from public.profiles where id = auth.uid() and approved = true)
      or public.is_admin()
    )
  );

create policy "posts_update" on public.posts for update to authenticated
  using (auth.uid() = author_id);

create policy "posts_delete" on public.posts for delete to authenticated
  using (auth.uid() = author_id or public.is_admin());

-- COMMENTS
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.comments enable row level security;

create policy "comments_select" on public.comments for select to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and approved = true)
    or public.is_admin()
  );

create policy "comments_insert" on public.comments for insert to authenticated
  with check (
    auth.uid() = author_id
    and (
      exists (select 1 from public.profiles where id = auth.uid() and approved = true)
      or public.is_admin()
    )
  );

create policy "comments_delete" on public.comments for delete to authenticated
  using (auth.uid() = author_id or public.is_admin());

-- LIKES
create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

alter table public.likes enable row level security;

create policy "likes_select" on public.likes for select to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and approved = true)
    or public.is_admin()
  );

create policy "likes_insert" on public.likes for insert to authenticated
  with check (
    auth.uid() = user_id
    and (
      exists (select 1 from public.profiles where id = auth.uid() and approved = true)
      or public.is_admin()
    )
  );

create policy "likes_delete" on public.likes for delete to authenticated
  using (auth.uid() = user_id);

-- ============================================================
-- STORAGE — create a bucket named "post-media" in the dashboard
-- first (Storage > New bucket > Public, 20-25MB file size limit,
-- restrict to image/* and video/*), then run these policies.
-- ============================================================
create policy "community_media_upload" on storage.objects for insert
  with check (bucket_id = 'post-media' and auth.role() = 'authenticated');

create policy "community_media_select" on storage.objects for select
  using (bucket_id = 'post-media' and auth.role() = 'authenticated');

create policy "community_media_delete" on storage.objects for delete
  using (
    bucket_id = 'post-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- NOTE ON FUTURE PHASES:
--   Public/non-client community -> add a "space_id" or
--     "membership_tier" concept once that product is real.
--     Reuse the same `approved`-style gating pattern used above
--     and in the lessons policy, just with a different flag.
--   Leaderboard -> a version of get_leaderboard() scoped to
--     community engagement (posts/likes) rather than lessons,
--     or a combined score.
--   Admin moderation -> public.is_admin() already gates delete
--     access above; build a UI on top of it.
-- ============================================================
