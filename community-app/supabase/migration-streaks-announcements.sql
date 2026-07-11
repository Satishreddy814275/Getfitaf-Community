-- Trainer announcements + activity streaks migration
--
-- Run this once in the SQL Editor of the getfitaf-portal Supabase
-- project. Safe to re-run (uses if not exists / or replace / drop if exists).
--
-- This exact file also lives at
-- learn-portal/supabase-migration-community-streaks-announcements.sql
-- for consistency with the other mirrored migrations.

-- ============================================================
-- TRAINER ANNOUNCEMENTS
-- ============================================================
alter table public.posts add column if not exists is_announcement boolean not null default false;

-- Replace posts_insert so only admins can set is_announcement = true.
-- (Ordinary members can still post normally; this just locks the flag.)
drop policy if exists "posts_insert" on public.posts;

create policy "posts_insert" on public.posts for insert to authenticated
  with check (
    auth.uid() = author_id
    and (
      exists (select 1 from public.profiles where id = auth.uid() and approved = true)
      or public.is_admin()
    )
    and (is_announcement = false or public.is_admin())
  );

-- ============================================================
-- ACTIVITY STREAKS
-- ============================================================
-- One row per user per calendar day they posted or commented.
-- Powers the "current streak" badge; also a foundation for a
-- future community-engagement leaderboard.
create table if not exists public.activity_log (
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_date date not null default current_date,
  primary key (user_id, activity_date)
);

alter table public.activity_log enable row level security;

drop policy if exists "activity_log_select" on public.activity_log;
create policy "activity_log_select" on public.activity_log for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "activity_log_insert" on public.activity_log;
create policy "activity_log_insert" on public.activity_log for insert to authenticated
  with check (auth.uid() = user_id);

-- Auto-log activity whenever someone posts or comments.
-- security definer so it can write to activity_log regardless of
-- who's logged in (still scoped to NEW.author_id, not spoofable
-- since author_id is already constrained by the posts/comments
-- insert policies to auth.uid()).
create or replace function public.log_community_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activity_log (user_id, activity_date)
  values (new.author_id, current_date)
  on conflict (user_id, activity_date) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_log_activity_posts on public.posts;
create trigger trg_log_activity_posts
  after insert on public.posts
  for each row execute function public.log_community_activity();

drop trigger if exists trg_log_activity_comments on public.comments;
create trigger trg_log_activity_comments
  after insert on public.comments
  for each row execute function public.log_community_activity();

-- Returns the caller's current consecutive-day streak. A day is
-- "active" if they posted or commented. Today doesn't break the
-- streak until midnight passes with no activity logged (grace: if
-- there's no activity yet today, we start counting from yesterday
-- instead of zeroing out immediately).
create or replace function public.get_user_streak(uid uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  streak int := 0;
  check_date date := current_date;
  has_today boolean;
begin
  select exists(
    select 1 from public.activity_log where user_id = uid and activity_date = current_date
  ) into has_today;

  if not has_today then
    check_date := current_date - 1;
  end if;

  loop
    exit when not exists(
      select 1 from public.activity_log where user_id = uid and activity_date = check_date
    );
    streak := streak + 1;
    check_date := check_date - 1;
  end loop;

  return streak;
end;
$$;
