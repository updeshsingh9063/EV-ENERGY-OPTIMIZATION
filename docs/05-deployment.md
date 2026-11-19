# Deployment

## 1. Supabase (already provisioned)
1. From `backend/`, run `npm run db:migrate` (idempotent).
2. Run `npm run db:test`; it should report 28/28 RLS checks passing.
3. Dashboard → **Authentication → URL Configuration**:
   - **Site URL:** `https://<your-vercel-domain>`
   - **Redirect URLs:** `https://<your-vercel-domain>/auth/callback` and `http://localhost:3000/auth/callback`
4. Dashboard → **Authentication → Emails**: configure custom SMTP before inviting real users (the built-in sender is rate-limited).
5. **Rotate the secret key and the database password**. They were shared in chat during development. Update `backend/.env` and the GitHub secrets afterwards.

## 2. Frontend on Vercel
1. Push the repository to GitHub, then **Import Project** in Vercel.
2. Set **Root Directory** to `frontend`. The framework preset is Next.js, detected automatically.
3. Add these **environment variables** (Production + Preview):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://wmlhfhjsvljquvwspyni.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |

   **Never** add the secret key or `DATABASE_URL` to Vercel; the frontend doesn't need them.
4. Deploy, then put the Vercel URL into Supabase's Site URL and Redirect URLs (step 1.3).

## 3. Model training / retraining
- **Local:**
  ```bash
  cd model-training
  python -m venv .venv
  .venv/Scripts/pip install -r requirements.txt
  cd src
  ../.venv/Scripts/python -m voltsplit.pipeline --publish
  ```
  On macOS/Linux, use `.venv/bin/` instead of `.venv/Scripts/`.
- **Scheduled:** `.github/workflows/retrain.yml` runs every Monday at 02:00 UTC, or on demand. Add the repository secrets `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `DATABASE_URL`.
- **Promotion gate:** a new model becomes `active` only if all of these hold:
  - the C/Python SIL equivalence check passes;
  - there are no constraint violations on the held-out cycles;
  - energy and battery stress are no worse than the active model.

  Otherwise it is stored as a `candidate`.
- **Retraining updates the app:** it also regenerates `frontend/src/lib/hess/generated/*.ts`. Commit those files so the next Vercel build ships the new controller.

## 4. Pre-release checklist
- `frontend`: `npm run typecheck && npm run lint && npm test && npm run build`
- `model-training`: `python -m pytest`
- `backend`: `npm run db:test`

## 5. Known residual risks
- `npm audit` (production): two advisories remain, both in the **PostCSS copy bundled inside Next.js 15**. It only processes the app's own CSS at build time; the attack needs attacker-controlled CSS, which never happens here. The fix requires Next.js 16, a major upgrade, which is deferred.
- All other advisories were fixed (Next.js 15.5.29, `@supabase/supabase-js` 2.119.0, `@supabase/ssr` 0.12.0).
- The secret key and the database password must be rotated, because they appeared in chat (see §1.5).
