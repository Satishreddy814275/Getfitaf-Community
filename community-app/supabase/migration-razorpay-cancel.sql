-- Tracks whether a member has requested cancellation, distinct from
-- `status` - Razorpay's cancel_at_cycle_end option means the actual
-- subscription.cancelled webhook (which deletes the row, see
-- handleRevoked in api/razorpay-webhook) doesn't fire until the
-- current billing cycle actually ends, matching the stated policy of
-- "you won't be billed again, but you have access until the cycle
-- finishes." Without this flag, the profile page couldn't tell a
-- still-active membership apart from one that's already been
-- cancelled and is just waiting out its final cycle.
alter table public.space_memberships
  add column if not exists cancel_at_period_end boolean not null default false;
