-- ============================================================
-- GetFit AF Body Weight Tracking
-- Run in Supabase SQL Editor
-- ============================================================
--
-- One row per member per calendar day (unique on profile_id +
-- logged_date, upserted from the app) - multiple weigh-ins in one day
-- don't add anything to a trend line, so logging again the same day
-- overwrites rather than creates a second point. Canonical storage is
-- always kg regardless of the member's weight_unit preference, same
-- pattern as workout_logged_sets.weight - conversion happens only at
-- display/input in the app, never here.
--
-- RLS mirrors workout_sessions/workout_logged_sets exactly: owner can
-- read/write their own rows, admins (coaches) can read every member's
-- rows too, per Satish's explicit call that coaches should see this
-- data.

begin;

create table if not exists public.body_weight_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  weight_kg numeric not null,
  logged_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, logged_date)
);

create index if not exists body_weight_logs_profile_date_idx
  on public.body_weight_logs(profile_id, logged_date desc);

alter table public.body_weight_logs enable row level security;

drop policy if exists "body_weight_logs_own" on public.body_weight_logs;
create policy "body_weight_logs_own" on public.body_weight_logs for all to authenticated
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid());

commit;
