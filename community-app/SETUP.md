# GetFit AF Community — Phase 1 Setup

Phase 1 covers the core loop: sign up / sign in, a shared feed, posts with
photos or videos, comments, and likes. Groups, the leaderboard, and admin
moderation tools come in later phases (see the note at the bottom of
`supabase/schema.sql`).

This app shares its Supabase project with `learn.getfitaf.fitness` — same
accounts, same `profiles` table. There's no separate signup system to set
up; clients use the same email/password on both sites.

## 1. Run the migration against the existing Supabase project

1. Open the **getfitaf-portal** Supabase project (the same one
   `learn.getfitaf.fitness` uses) — not a new project.
2. Open **SQL Editor > New query**, paste in the contents of
   `supabase/schema.sql` from this folder, and run it. This adds `posts`,
   `comments`, and `likes` tables alongside the existing `profiles` table,
   with row-level security that only lets `approved` clients (or admins)
   read and post.
3. Go to **Storage > New bucket**, name it exactly `post-media`, mark it
   **Public**, and set a file size limit (20-25MB is plenty for a photo or
   short clip) restricted to `image/*` and `video/*`.
4. Confirm **Authentication > Settings > Confirm email** is already
   configured the way you want — this project already has real clients
   signing up through `learn.getfitaf.fitness`, so don't change auth
   settings without checking how signup currently works there first.
5. Go to **Project Settings > API** and copy the **Project URL** and the
   **anon public** key (same ones already embedded in `learn-portal/login.html`).

## 2. Configure the app

1. In this folder, copy `.env.local.example` to `.env.local`.
2. Paste in the Project URL and anon key from step 1.5 above.

## 3. Run it locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` — sign in with an existing client account
(the same one that works on `learn.getfitaf.fitness`) and you'll land in
the feed.

## 4. Deploy to Vercel

1. Push this folder to a GitHub repo (separate from `learn-portal`).
2. In Vercel, import the repo as a new project.
3. Under **Environment Variables**, add `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` with the same values as your `.env.local`.
4. Deploy. Point a subdomain at it via Vercel's domain settings — e.g.
   `community.getfitaf.fitness`.
5. Back in Supabase, add that new subdomain to **Authentication > URL
   Configuration > Redirect URLs** so auth flows aren't blocked there.

## What's in Phase 1

- Sign in with the same account clients already use on
  `learn.getfitaf.fitness`
- A single shared feed — any approved member can post text, a photo, or a
  video
- Comments and likes on every post
- Row-level security so members can only edit or delete their own content,
  and only approved clients can see the feed at all

## What's next (not built yet)

- **Groups/spaces** — separate feeds by topic, and eventually a distinct
  space for a public/non-client community (once that product is real),
  reusing the same shared-project approach
- **Leaderboard/challenges** — a version of the existing lesson leaderboard
  scored by community engagement instead (or combined)
- **Admin tools** — `public.is_admin()` already gates moderation in the
  RLS policies; this is mostly a UI layer on top of what already exists

Tell me when you're ready to tackle one of these and we'll build it as its
own deployable piece, same as this phase.

## About the standalone "GetFitAF Community" Supabase project

Earlier in this build we created a separate, empty Supabase project
before deciding to share `getfitaf-portal` instead. That project isn't
used by this app — it's fine to leave it idle (free tier, no cost) or
delete it later.
