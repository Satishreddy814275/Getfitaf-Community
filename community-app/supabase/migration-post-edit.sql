-- ============================================================
-- GetFit AF Community — Post editing
-- Run in Supabase SQL Editor (already applied directly via the
-- Supabase MCP - kept here for the repo's migration history, matching
-- the pattern of the other migration-*.sql files)
-- ============================================================
--
-- Adds a single nullable timestamp so the app can show an "(edited)"
-- indicator once a post's content has been changed after posting.
-- Null means "never edited" - set to now() by editPost() in
-- feed/actions.ts whenever a post's content is saved.
--
-- No RLS change needed: the existing posts_update policy (see
-- migration-pinned-posts.sql) already allows a post's own author, or
-- an admin, to update any column on the row - the same policy the
-- admin pin toggle already uses. Editing content is just a new caller
-- of that same permission, not a new permission.

alter table public.posts
  add column if not exists edited_at timestamptz;
