-- ============================================================
-- GetFit AF Community — Notifications, threaded replies, comment likes
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Threaded comments: one level of nesting (reply to a top-level
-- comment). The app enforces "no replies to replies" — this column
-- doesn't restrict depth at the DB level, it just allows it.
alter table comments
  add column if not exists parent_comment_id uuid references comments(id) on delete cascade;

create index if not exists idx_comments_parent on comments(parent_comment_id);

-- 2. Comment likes — separate table from the existing post `likes`
-- table (kept distinct rather than a nullable-either-or column, so
-- each stays a clean, single-purpose foreign key).
create table if not exists comment_likes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references comments(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);

create index if not exists idx_comment_likes_comment on comment_likes(comment_id);

alter table comment_likes enable row level security;

create policy "comment_likes_select" on comment_likes for select
  using (auth.role() = 'authenticated');

create policy "comment_likes_insert" on comment_likes for insert
  with check (auth.uid() = user_id);

create policy "comment_likes_delete" on comment_likes for delete
  using (auth.uid() = user_id);

-- 3. Notifications
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles(id) on delete cascade,
  actor_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('post_like', 'post_comment', 'comment_reply', 'comment_like')),
  post_id uuid not null references posts(id) on delete cascade,
  comment_id uuid references comments(id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Powers "get my unread, most recent first" — the one query this
-- table exists to serve, so it gets its own index.
create index if not exists idx_notifications_recipient
  on notifications(recipient_id, read, created_at desc);

alter table notifications enable row level security;

create policy "notifications_select" on notifications for select
  using (auth.uid() = recipient_id);

-- Insert is gated on being the actor, not the recipient — you're
-- recording "I did this," and the recipient is whoever the app
-- determines owns the post/comment being acted on. You can't forge
-- being a different actor than yourself, which is all this needs to
-- prevent.
create policy "notifications_insert" on notifications for insert
  with check (auth.uid() = actor_id);

create policy "notifications_update" on notifications for update
  using (auth.uid() = recipient_id);
