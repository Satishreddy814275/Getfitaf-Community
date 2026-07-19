-- ============================================================
-- GetFit AF Canonical Exercise Catalog
-- Run in Supabase SQL Editor
-- ============================================================
--
-- Introduces `exercises` as the first real, ID-based row per exercise
-- (name, muscle groups worked, category tags). Deliberately additive
-- and low-risk: program content (program_templates/workout_generations
-- structured_plan JSON) keeps storing exercise names as plain text,
-- exactly as it does today - nothing about the program editors, the
-- structural diff system, or the member-facing workout logging flow
-- changes. This table is matched to those name strings by normalized
-- text (same trick exercise_videos already uses), not by rewiring
-- every existing reference to a foreign key. See project memory for
-- the fuller reasoning.
--
-- Also extends exercise_videos with:
--   - video_type: splits the single video-per-exercise concept into
--     two independently-tracked libraries, 'tutorial' (used in the
--     member workout view, unchanged default) and 'demo' (a shorter
--     form-check clip, admin-only for now - a future client-facing
--     library is a possibility, not built yet).
--   - is_placeholder: flags a video that isn't Satish's own footage
--     yet (grabbed from YouTube as a stand-in), so it can be tracked
--     and eventually swapped for his own recording. Defaults to false
--     at the column level so existing rows are never retroactively
--     flagged - only new adds default the checkbox to checked in the
--     UI, since that's the common case going forward.
--   - exercise_id: nullable link back to the new canonical exercises
--     row, backfilled by matching normalized exercise_name. Not used
--     by the member-facing video lookup (that still matches by name
--     only, untouched) - purely for admin-side metadata joins and any
--     future library page.

begin;

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  muscle_groups text[] not null default '{}',
  category_tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- One canonical row per normalized name - mirrors the same
-- normalize()+baseExerciseName() dedup the app already applies when
-- building the exercise picker's pool (see src/lib/exercisePool.ts).
create unique index if not exists exercises_normalized_name_idx
  on public.exercises (lower(regexp_replace(regexp_replace(name, '[^\w\s]', '', 'g'), '\s+', ' ', 'g')));

alter table public.exercises enable row level security;

drop policy if exists "exercises_select" on public.exercises;
create policy "exercises_select" on public.exercises for select to authenticated
  using (true);

drop policy if exists "exercises_admin_write" on public.exercises;
create policy "exercises_admin_write" on public.exercises for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.exercise_videos
  add column if not exists video_type text not null default 'tutorial',
  add column if not exists is_placeholder boolean not null default false,
  add column if not exists exercise_id uuid references public.exercises(id) on delete set null;

alter table public.exercise_videos
  drop constraint if exists exercise_videos_video_type_check;
alter table public.exercise_videos
  add constraint exercise_videos_video_type_check check (video_type in ('tutorial', 'demo'));

create index if not exists exercise_videos_video_type_idx on public.exercise_videos(video_type);
create index if not exists exercise_videos_exercise_id_idx on public.exercise_videos(exercise_id);

commit;
