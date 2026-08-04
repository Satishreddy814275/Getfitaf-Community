-- Instagram comment-to-DM automation.
--
-- Flow: someone comments a keyword on a tracked post -> we publicly reply
-- to the comment (social proof, per Meta's recommended pattern) -> we
-- privately message them asking them to follow + reply back to confirm
-- (there's no API to actually verify a follow, so this is self-reported
-- by design, see the conversation this shipped from) -> once they reply
-- with the confirm word, we send the file.
--
-- Restricted to Satish only in the app layer (see /admin/instagram page),
-- not here in RLS - is_admin() covers all coach-admins, and this table
-- is deliberately visible to a narrower set. RLS still uses is_admin()
-- as the floor; the tighter per-email check happens in the page/actions.

create table if not exists instagram_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Matched case-insensitively against comment text. A comment only
  -- triggers a campaign if it contains this keyword - see the "looks
  -- like a bot" problem this was built to avoid.
  keyword text not null,
  -- Specific IG post/reel this campaign watches. Null would mean "any
  -- post" but the UI always sets this - keeping it non-null-by-convention
  -- rather than schema-enforced in case a "watch all posts" campaign
  -- ever becomes a real request.
  media_id text,
  public_reply_text text not null default 'Thanks for the comment! Check your DMs 💌',
  dm_prompt_text text not null,
  -- What the user has to reply with in DM to unlock the file. Kept
  -- editable per-campaign rather than hardcoded to "yes" in case a
  -- future campaign wants something more specific.
  confirm_trigger text not null default 'yes',
  file_message_text text not null,
  file_url text not null,
  active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per (campaign, commenter) - tracks where each person is in the
-- funnel so we never double-DM someone who already commented, and so the
-- admin view can show funnel drop-off per campaign.
create table if not exists instagram_interactions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references instagram_campaigns(id) on delete set null,
  ig_user_id text not null,
  ig_username text,
  comment_id text,
  state text not null default 'commented'
    check (state in ('commented', 'dm_sent', 'confirmed', 'file_sent')),
  last_event_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (campaign_id, ig_user_id)
);

-- Raw event log, keyed on a dedupe id we construct in the webhook route
-- (Meta doesn't send one canonical event id the way Stripe/Razorpay do -
-- see route.ts for how this is derived). Service-role only; this is
-- purely for debugging and idempotency, not for the admin UI to query
-- directly.
create table if not exists instagram_webhook_events (
  event_id text primary key,
  raw_payload jsonb not null,
  received_at timestamptz not null default now()
);

alter table instagram_campaigns enable row level security;
alter table instagram_interactions enable row level security;
alter table instagram_webhook_events enable row level security;

create policy "admins manage instagram campaigns" on instagram_campaigns
  for all using (public.is_admin()) with check (public.is_admin());

create policy "admins read instagram interactions" on instagram_interactions
  for select using (public.is_admin());

-- No policy on instagram_webhook_events for regular clients - the
-- webhook route uses the service-role client (bypasses RLS entirely),
-- and there's no product reason for even admins to query it through
-- the normal client yet.

create index if not exists instagram_interactions_campaign_state_idx
  on instagram_interactions (campaign_id, state);
