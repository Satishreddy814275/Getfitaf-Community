-- Lesson-completion community prompt migration
--
-- Run this once in the SQL Editor of the getfitaf-portal Supabase
-- project. Safe to re-run (uses if not exists).
--
-- This exact file also lives at
-- learn-portal/supabase-migration-community-lesson-prompt.sql
-- for consistency with the other mirrored migrations.

-- Tracks which lesson (if any) a post was shared about, so we can
-- tell whether a client has already posted about a given lesson and
-- avoid re-prompting them for it.
alter table public.posts add column if not exists lesson_id uuid references public.lessons(id) on delete set null;
