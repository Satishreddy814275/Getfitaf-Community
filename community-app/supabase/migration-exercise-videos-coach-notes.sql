-- ============================================================
-- Coach notes on exercise videos
-- Run in Supabase SQL Editor
-- ============================================================
--
-- A short (few-line) coaching note attached to the same row as an
-- exercise's video - form cues, common mistakes, anything Satish or a
-- coach wants a member to see. Shown to members as a collapsible
-- section on that exercise's card in the workout logging view,
-- collapsed by default so it doesn't crowd the card for exercises that
-- don't have one. Nullable - most exercises won't have a note, and a
-- missing note should just mean the section doesn't render at all.

begin;

alter table public.exercise_videos add column if not exists coach_notes text;

commit;
