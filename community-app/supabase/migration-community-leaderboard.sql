-- Community engagement leaderboard
--
-- Separate from public.get_leaderboard() (learn-portal's lessons
-- leaderboard) on purpose — this one measures showing up in the
-- community itself (posts + comments in the last 30 days), not
-- lesson progress. Mirrors that function's style: first-name-only
-- for privacy, admins excluded, SECURITY DEFINER so any logged-in
-- client can call it without needing direct read access to
-- everyone else's posts/comments.
--
-- Run this once in the SQL Editor of the getfitaf-portal Supabase
-- project. Safe to re-run (CREATE OR REPLACE).
--
-- This exact file also lives at
-- learn-portal/supabase-migration-community-leaderboard.sql for
-- consistency with the other mirrored migrations.

create or replace function public.get_community_leaderboard()
returns table (
  rank          bigint,
  user_id       uuid,
  first_name    text,
  post_count    bigint,
  comment_count bigint,
  score         bigint,
  streak        int
)
language sql
security definer
stable
as $$
  with counts as (
    select
      p.id as user_id,
      coalesce(nullif(trim(split_part(p.full_name, ' ', 1)), ''), 'Anonymous') as first_name,
      count(distinct po.id) filter (where po.created_at >= now() - interval '30 days') as post_count,
      count(distinct c.id) filter (where c.created_at >= now() - interval '30 days') as comment_count
    from public.profiles p
    left join public.posts po on po.author_id = p.id
    left join public.comments c on c.author_id = p.id
    where p.approved = true
      and p.is_admin = false
    group by p.id, p.full_name
  )
  select
    row_number() over (order by (post_count + comment_count) desc) as rank,
    user_id,
    first_name,
    post_count,
    comment_count,
    (post_count + comment_count) as score,
    public.get_user_streak(user_id) as streak
  from counts
  where (post_count + comment_count) > 0
  order by score desc
  limit 20;
$$;

grant execute on function public.get_community_leaderboard() to authenticated;
