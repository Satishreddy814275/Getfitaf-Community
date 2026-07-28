-- Adds Razorpay support alongside the existing Stripe columns on
-- space_memberships, plus Razorpay's own idempotency + unmatched-
-- payment safety-net tables — same pattern as processed_stripe_events
-- / unmatched_stripe_payments. Applied live via the Supabase MCP on
-- 2026-07-28; kept here for git history consistency with the rest of
-- the migration-*.sql files in this folder.

alter table public.space_memberships
  add column if not exists razorpay_customer_id text,
  add column if not exists razorpay_subscription_id text;

create table if not exists public.processed_razorpay_events (
  event_id text primary key,
  created_at timestamptz not null default now()
);
alter table public.processed_razorpay_events enable row level security;

create table if not exists public.unmatched_razorpay_payments (
  id uuid primary key default gen_random_uuid(),
  razorpay_customer_id text,
  razorpay_customer_email text,
  event_type text not null,
  raw_payload jsonb,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.unmatched_razorpay_payments enable row level security;
