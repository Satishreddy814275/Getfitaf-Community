-- Append-only log of every Razorpay subscription created WITH the
-- beta discount offer attached. Deliberately separate from
-- space_memberships (which gets a row hard-deleted on cancellation —
-- see handleRevoked in api/razorpay-webhook — so it can't be used to
-- count "how many people have ever gotten the beta rate" once there's
-- any churn). Read (count) and written by src/lib/razorpay.ts's
-- isBetaDiscountAvailable() / recordBetaDiscountRedemption(), both
-- called from beta/razorpay-actions.ts via the service-role client —
-- RLS is on with no policies, same pattern as unmatched_razorpay_payments.
create table if not exists public.beta_discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  razorpay_subscription_id text not null,
  method text not null,
  created_at timestamptz not null default now()
);
alter table public.beta_discount_redemptions enable row level security;
