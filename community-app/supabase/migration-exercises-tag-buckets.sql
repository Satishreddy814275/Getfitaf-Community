-- ============================================================
-- GetFit AF Exercise Tag Buckets
-- Run in Supabase SQL Editor
-- ============================================================
--
-- Splits the single flat `category_tags` field (see
-- migration-exercises-catalog.sql) into three purpose-built buckets -
-- equipment_tags and type_tags are new columns; category_tags itself
-- is renamed to other_tags as the catch-all for anything that doesn't
-- fit muscle/equipment/type. Safe to rename outright rather than add
-- a new column and migrate data: category_tags held zero real rows at
-- the time of this migration (confirmed via direct query), so nothing
-- needed backfilling.
--
-- All four buckets (muscle_groups, equipment_tags, type_tags,
-- other_tags) are edited the same way in AdminExercisesList - a
-- starter chip list per bucket (not a hard enum) plus free-text add,
-- so Satish can extend any bucket himself without a code change. See
-- project memory for the fuller design discussion.

begin;

alter table public.exercises
  add column if not exists equipment_tags text[] not null default '{}',
  add column if not exists type_tags text[] not null default '{}';

alter table public.exercises rename column category_tags to other_tags;

commit;
