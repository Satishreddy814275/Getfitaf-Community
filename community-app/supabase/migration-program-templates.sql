-- ============================================================
-- GetFit AF Program Templates — curated program library
-- Run in Supabase SQL Editor
-- ============================================================
--
-- Replaces the AI workout builder as the source of plans for logged-in
-- community members. The AI builder itself (workoutbuilder.getfitaf.fitness,
-- workout_intakes/workout_generations) is untouched and keeps serving
-- its actual job - the free/anonymous lead-magnet funnel - this is a
-- fully separate, community-app-owned system for members who already
-- have access.
--
-- No migration of existing data: at the time this was written, nobody
-- had an active plan through the old system, so there's nothing to
-- carry over. Both new tables get proper RLS from the start (unlike
-- workout_intakes/workout_generations, which are zero-RLS/service-role-
-- only because the external builder has no login of its own) - a real
-- community-app member owns their own enrollment the same way they own
-- their workout_sessions.
--
-- Content goes in via direct SQL (one INSERT per program, written from
-- a plain-language description) rather than an admin authoring UI -
-- deliberately deferred until there's enough program volume or enough
-- people adding content to justify building one. See project memory
-- for the day/exercise format convention used when writing these.

begin;

-- One row per program in the library. structured_plan uses the exact
-- same shape workout_generations.structured_plan already uses -
-- { "days": [ { "week": 1, "day": 1, "label": "Push", "isCardio": false,
--     "exercises": [ { "order": 1, "name": "...", "sets": "3-5", "reps": "5" } ] } ] }
-- - so every existing consumer (WorkoutDayPicker, swap-exercise, video
-- matching, the rest timer) needs zero changes; they only ever cared
-- about that shape, never about where it came from. "week" inside each
-- day entry is a leftover artifact of the old shape (always 1 here,
-- same as the AI builder's own output) - the picker still synthesizes
-- the full multi-week grid itself from duration_weeks x days, it was
-- never read from inside the JSON.
--
-- isCardio lives on each day entry inside the JSON (not a separate
-- column) - it's the explicit, human-decided tag replacing what used
-- to be guessed from free text, and it travels with the plan data
-- itself since that's what the logging UI actually reads.
create table if not exists public.program_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  level text not null default 'beginner',
  equipment_tier text not null,
  duration_weeks int not null default 2,
  structured_plan jsonb not null,
  is_published boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- One row per member per program they've picked - this is the new
-- "which plan am I logging against" anchor, replacing the role
-- workout_intakes/workout_generations played. A member could in theory
-- pick a new program later (creating a second row); getActiveWorkoutPlan
-- always resolves to the most recent one, same "latest wins" behavior
-- the old email->intake->generation lookup already had.
create table if not exists public.program_enrollments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  program_template_id uuid not null references public.program_templates(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists program_enrollments_profile_id_idx on public.program_enrollments(profile_id);

alter table public.program_templates enable row level security;
alter table public.program_enrollments enable row level security;

-- Published templates are readable by any authenticated member (this
-- is the library they pick from); drafts stay admin-only until
-- published. All writes are admin-only - this is authored content, not
-- member data.
drop policy if exists "program_templates_select" on public.program_templates;
create policy "program_templates_select" on public.program_templates for select to authenticated
  using (is_published = true or public.is_admin());

drop policy if exists "program_templates_admin_write" on public.program_templates;
create policy "program_templates_admin_write" on public.program_templates for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Same owner-scoped pattern as workout_sessions/workout_exercise_swaps
-- - a member manages only their own enrollment, admins can see
-- everything.
drop policy if exists "program_enrollments_own" on public.program_enrollments;
create policy "program_enrollments_own" on public.program_enrollments for all to authenticated
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid());

-- Repoint the logging tables from workout_generations to
-- program_enrollments. Safe to do outright (not additively) because
-- nothing was actually using the old path yet - no data, no
-- transition to manage. The AI builder's own tables are left exactly
-- as they were; this only changes what community-app logging points at.
alter table public.workout_sessions
  drop constraint if exists workout_sessions_generation_id_fkey;
alter table public.workout_sessions
  add constraint workout_sessions_generation_id_fkey
  foreign key (generation_id) references public.program_enrollments(id) on delete cascade;

alter table public.workout_exercise_swaps
  drop constraint if exists workout_exercise_swaps_generation_id_fkey;
alter table public.workout_exercise_swaps
  add constraint workout_exercise_swaps_generation_id_fkey
  foreign key (generation_id) references public.program_enrollments(id) on delete cascade;

commit;
