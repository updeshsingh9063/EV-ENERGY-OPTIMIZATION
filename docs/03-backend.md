# Phase 4: Supabase Backend

Project: `wmlhfhjsvljquvwspyni` · Postgres 17 · migrations in [`backend/supabase/migrations/`](../backend/supabase/migrations/).

## 1. What we use from Supabase, and why

| Service | Used? | Reason |
|---|---|---|
| **Postgres** | ✅ | Vehicles, drive cycles, runs, profiles, model registry |
| **Auth** | ✅ | Email + password, email confirmation, password reset |
| **Row Level Security** | ✅ | Every table; the browser only ever holds the publishable key |
| **Storage** | ✅ (buckets ready) | `models` and `exports` (private). Written by the training pipeline in Phase 5 |
| **Realtime** | ❌ not needed | Simulations run in the browser in under 50 ms, so there is no background job to watch. We revisit this only if long-running jobs appear. |
| **Edge Functions** | ❌ not needed yet | The physics model and the distilled policy are lightweight enough to run client-side. Moving them server-side would add latency and add no security, because results belong only to the user. We add one only if a real need appears (e.g. hiding model weights). |

This follows the directive: *the simplest architecture that satisfies the requirements.*

## 2. Schema

```
auth.users ─1:1─ profiles (display_name, active_vehicle_id → vehicles, run_seq)
     │
     ├─1:n─ vehicles      (owner_id NULL ⇔ is_builtin)          config jsonb
     ├─1:n─ drive_cycles  (owner_id NULL ⇔ source ≠ 'upload')   speed_ms real[] (1 Hz, 10 to 14 400 samples)
     └─1:n─ runs          (vehicle_id, cycle_id → ON DELETE SET NULL; config snapshot; kpis/baseline jsonb)
models (kind, version, status, metrics, artifact_path): one 'active' per kind (partial unique index)
```

**Key constraints:**
- Name lengths are limited.
- `config` must contain `vehicle`, `battery` and `supercap`.
- The ownership and source rules are enforced by CHECK constraints.
- Grade data, when present, has the same length as the speed data.
- Run numbers are unique per user: `(owner_id, seq)`.

**Indexes:**
- `runs (owner_id, created_at desc)`
- `runs (cycle_id)` and `runs (vehicle_id)`
- `owner_id` on `vehicles` and `drive_cycles`

**Triggers:**

| Trigger | What it does |
|---|---|
| `handle_new_user` | Creates a profile for every new user |
| `assign_run_seq` | Numbers each user's runs #1, #2, … |
| `guard_profile_update` | Stops users editing their own run counter |
| `touch_updated_at` | Keeps `updated_at` current |

All trigger functions have a pinned `search_path`.

**Seed data** (`0002_seed.sql`) is generated from the frontend presets (`npm run db:seed:gen`), so the code and the database can't drift apart.

## 3. Roles and permissions

| Role | Can do |
|---|---|
| `anon` (signed out) | Nothing. All table privileges are revoked, and the middleware redirects to `/login`. |
| `authenticated` | **Read:** built-in vehicles and shared cycles, plus their own vehicles, uploads, runs and profile. **Create:** their own vehicles, uploads and runs. **Edit:** only their own vehicles; uploads and runs are immutable. **Delete:** their own data. **Models:** read-only. |
| Secret key (training pipeline) | Bypasses RLS. Publishes models and dataset cycles, and uploads artifacts. **Never shipped to the browser.** |

## 4. Verification
- `npm run db:test`: **30 RLS checks**, run inside a transaction that is rolled back so nothing is left behind. It covers cross-user isolation, built-in immutability, anon lockout, run numbering, counter tampering and constraint rejection. **30/30 pass.**
- Browser end-to-end test against the live project, all passing:
  - an unauthenticated visit redirects to sign-in;
  - a wrong password shows a friendly error;
  - signing in sends you back to the page you asked for;
  - simulate, upload, edit vehicle, and set the active vehicle;
  - a fresh session reloads everything from the database;
  - signing out locks the app again.
- The temporary test user was deleted afterwards, and its data was removed by cascade (verified as zero rows).

## 5. Secrets
- `frontend/.env.local` holds the URL and the **publishable** key only.
- `backend/.env` holds the secret key and the database URL; it is used by scripts and the training pipeline.
- Both files are git-ignored, and `.env.example` templates are committed instead.

## 6. Dashboard settings to confirm (Supabase → Authentication → URL Configuration)
- **Site URL:** `http://localhost:3000` now; the Vercel URL after deployment.
- **Redirect URLs:** add `http://localhost:3000/auth/callback` and `https://<vercel-domain>/auth/callback`.
- **SMTP:** the built-in email service is heavily rate-limited (a few emails per hour). Configure custom SMTP before real users sign up.

## 7. Commands (run in `backend/`)
| Command | Purpose |
|---|---|
| `npm run db:migrate` | Apply new migrations (tracked in `ops.applied_migrations`) |
| `npm run db:test` | RLS / trigger test suite (rolled back) |
| `npm run db:status` | Row counts and active model versions |
| `npm run db:check` | Connection and table listing |
| `npm run db:seed:gen` | Regenerate the seed SQL from the frontend presets |
