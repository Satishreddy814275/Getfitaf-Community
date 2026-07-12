-- ============================================================
-- GetFit AF Community — Stripe-synced trial billing
-- Run in Supabase SQL Editor
-- ============================================================
--
-- Lays the groundwork for automated 7-day free trials on the
-- low-ticket (₹499/mo) space: a Stripe webhook (built separately in
-- community-app) will read/write these columns to grant access when
-- a trial starts, keep it active on successful payment, and revoke
-- it automatically on a failed payment or cancellation — no manual
-- tracking of who's mid-trial.
--
-- Wrapped in a transaction for atomicity.

begin;

-- 1. profiles needs an email column so the Stripe webhook can match
-- an incoming payment (which only carries an email address) back to
-- the right account. This doesn't change who can see it — email
-- lives on the same profiles row as full_name/avatar_url, and is
-- exposed to exactly whoever the existing profiles_select policy
-- (id = auth.uid() OR is_admin()) already allows to see that row.
alter table public.profiles
  add column if not exists email text;

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

-- Keep it in sync for every new signup going forward. This replaces
-- the existing handle_new_user() from
-- supabase-migration-coach-default-satish.sql — same trigger, same
-- approval/coach behaviour, with email added.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  matched_coach text;
  is_expected   boolean := false;
begin
  select coach into matched_coach
  from public.expected_clients
  where lower(trim(email)) = lower(trim(new.email))
  limit 1;

  is_expected := FOUND;

  insert into public.profiles (id, full_name, approved, coach, email)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    is_expected,
    coalesce(matched_coach, 'Satish'),
    new.email
  );

  return new;
end;
$$ language plpgsql security definer;

-- 2. space_memberships gets billing/trial state. Existing rows
-- (anything Satish granted manually via the admin panel before this
-- migration) default to 'active' so nothing already granted gets
-- mistaken for an expired trial by the automation being built next.
alter table public.space_memberships
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists status text not null default 'active'
    check (status in ('trialing', 'active', 'past_due', 'canceled')),
  add column if not exists trial_ends_at timestamptz,
  add column if not exists current_period_end timestamptz;

create index if not exists space_memberships_stripe_subscription_idx
  on public.space_memberships(stripe_subscription_id);

-- 3. Idempotency log — Stripe retries webhook deliveries, so every
-- event id gets recorded here before it's acted on. If the same
-- event arrives twice, the webhook checks this table first and skips
-- reprocessing it.
create table if not exists public.processed_stripe_events (
  event_id text primary key,
  created_at timestamptz not null default now()
);

-- 4. Payments that couldn't be matched to a GetFit AF account (e.g.
-- someone paid with a different email than they signed up with, or
-- paid before creating an account at all). Nothing here is lost —
-- it's logged so Satish can manually reconcile it, and he's emailed
-- immediately when a row lands here (handled in the webhook code).
create table if not exists public.unmatched_stripe_payments (
  id uuid primary key default gen_random_uuid(),
  stripe_customer_id text,
  stripe_customer_email text,
  event_type text not null,
  raw_payload jsonb,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.processed_stripe_events enable row level security;
alter table public.unmatched_stripe_payments enable row level security;

-- No policies added intentionally, same pattern as
-- migration-workout-builder.sql — these are written/read only by the
-- Stripe webhook route using the Supabase service-role key
-- server-side. Default-deny for anon/authenticated.

commit;
