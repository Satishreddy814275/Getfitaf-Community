-- Adds a per-member kg/lbs preference. All weight values logged in
-- workout_logged_sets stay canonical kg regardless of this setting -
-- this only controls what unit the app displays/accepts input in.
-- Defaults to 'kg' so nothing changes for existing members unless they
-- explicitly switch it in their profile.
alter table public.profiles
  add column if not exists weight_unit text not null default 'kg' check (weight_unit in ('kg', 'lbs'));
