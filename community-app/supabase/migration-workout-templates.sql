-- ============================================================
-- Workout Templates — reusable library of standalone days
-- Run in Supabase SQL Editor
-- ============================================================
--
-- A separate, purpose-built shelf of reusable day-level content
-- ("Upper Body 1", "Lower Body 1", "Upper Body At Home") that any
-- program can pull a copy from when building a new day - pairs with
-- the within-program copy/repeat/duplicate machinery (copyProgramDay/
-- duplicateProgramWeek) already shipped, but this one crosses program
-- boundaries. Deliberately its own table rather than a specially-
-- flagged program: nothing in here is ever meant to be assigned to a
-- member, so it shouldn't share a table (and therefore a risk surface)
-- with program_templates, which members read directly via RLS.
--
-- exercises uses the exact same WorkoutExercise[] shape a program
-- day's exercises already use, so the existing admin block editor
-- (collapseExercisesToBlocks/expandBlocksToExercises) works against a
-- template unchanged, just without a week/day/program wrapped around
-- it.
--
-- Both directions of moving content between a template and a program
-- day are one-time copies, never a live link - editing a template
-- later never reaches into a program that already used it, and
-- editing a program day never rewrites the template it came from. See
-- addProgramDayFromTemplate / saveProgramDayAsTemplate in
-- admin/actions.ts.

begin;

create table if not exists public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text,
  exercises jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workout_templates enable row level security;

-- Admin-only end to end, both read and write - this is an authoring
-- tool, members never see or query it directly (unlike
-- program_templates, which members read once published).
drop policy if exists "workout_templates_admin_all" on public.workout_templates;
create policy "workout_templates_admin_all" on public.workout_templates for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

commit;
