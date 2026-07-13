-- ============================================================
-- GetFit AF Exercise Swaps — member-initiated exercise substitutions
-- Run in Supabase SQL Editor
-- ============================================================
--
-- Lets a member swap one exercise for another inside their own active
-- plan (e.g. "no barbell at this gym today") without ever touching
-- workout_generations.structured_plan itself - that table is written
-- by the separate, login-less workout builder site and has zero RLS
-- policies of its own (see migration-workout-logging.sql), so this
-- deliberately stays a fully separate, community-app-owned table
-- overlaid at render time in /workouts instead of mutating shared,
-- external plan data.
--
-- week_number is not nullable - 0 is the sentinel for "every week"
-- (a permanent swap) so a plain unique index can enforce "only one
-- active swap per day/week/exercise" without relying on Postgres's
-- default NULL-is-distinct behavior. 1-4 means that one specific
-- week's occurrence only. A week-specific swap takes precedence over
-- an all-weeks (0) swap for the same day/exercise if a member somehow
-- has both.
--
-- Rows are keyed by original_exercise_name (the untouched template
-- name), not whatever's currently displayed - so re-swapping the same
-- slot updates this same row (via upsert) instead of accumulating
-- duplicates, and swapping back to the original name is just a normal
-- swap through the same mechanism, no separate "revert" path needed.

begin;

create table if not exists public.workout_exercise_swaps (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  generation_id uuid not null references public.workout_generations(id) on delete cascade,
  day_number int not null,
  week_number int not null default 0 check (week_number between 0 and 4),
  original_exercise_name text not null,
  new_exercise_name text not null,
  sets text not null default '',
  reps text not null default '',
  created_at timestamptz not null default now(),
  unique (generation_id, profile_id, day_number, week_number, original_exercise_name)
);

create index if not exists workout_exercise_swaps_profile_generation_idx
  on public.workout_exercise_swaps(profile_id, generation_id);

alter table public.workout_exercise_swaps enable row level security;

-- Same owner-scoped pattern as workout_sessions/workout_logged_sets -
-- a member manages only their own swaps, admins can see everything.
drop policy if exists "workout_exercise_swaps_own" on public.workout_exercise_swaps;
create policy "workout_exercise_swaps_own" on public.workout_exercise_swaps for all to authenticated
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid());

commit;
