# Cloud Sync (Supabase) Setup

MyStats is **local-first** by default. Cloud Sync is optional and lets you sync your data across devices when you sign in.

## 1) Create the table + RLS policies

Run the SQL in `supabase/migrations/20260124210000_mystats_items.sql` inside your Supabase project:

- Supabase Dashboard → SQL Editor → paste/run
- or `psql` against your Supabase Postgres (recommended for local dev)

## 2) Configure redirect URLs (Auth)

Make sure your Supabase Auth settings allow redirects to:

- `http://localhost:5178` (local dev)
- `https://mystats-eta.vercel.app` (demo)
- your production domain

If you use OAuth (Google/GitHub), also enable the providers in Supabase:
- Supabase Dashboard → Authentication → Providers → enable Google / GitHub

If you only want Google, you can keep GitHub disabled and (optionally) set:
- `VITE_CLOUD_OAUTH_PROVIDERS=google`

## 3) Configure env vars (Vercel + local)

Create `.env` from `.env.example` and fill:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

For Vercel:

- Project Settings → Environment Variables → add the same `VITE_*` vars
  - Note: `localhost` / `127.0.0.1` URLs will **not** work on Vercel. Use a hosted Supabase project URL.
- Or via CLI:
  - `MYSTATS_SUPABASE_URL=... MYSTATS_SUPABASE_ANON_KEY=... ./scripts/vercel-set-cloud-sync-env.sh production`

## 4) Use in the app

Settings → **Cloud Sync (Beta)**:

1. Sign in with Google / GitHub **or** Email + Password
2. Enable Cloud Sync → Sync now

Notes:
- API keys are **not synced** (BYOK stays local).
- Without Cloud Sync, data remains per device/browser.
