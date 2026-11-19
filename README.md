# VoltSplit: Project 96

ML-based reduction of energy consumption in a battery + supercapacitor hybrid energy storage (HESS) electric vehicle.

## Repository layout

| Folder | What lives here | Deploys to |
|---|---|---|
| [`frontend/`](frontend/) | Next.js (React + TypeScript) web app: dashboard, simulations, model and controller views | Vercel |
| [`backend/`](backend/) | Supabase project: SQL migrations (schema, RLS), Edge Functions (`simulate`, `export`), storage policies | Supabase |
| [`model-training/`](model-training/) | Python ML pipeline: data prep (NASA PCoE, FASTSim drive cycles), demand forecaster, loss surrogates, MPC, policy distillation, C/JS export, evaluation | Runs offline; publishes models to Supabase |
| [`docs/`](docs/) | Research, design system and architecture documents | n/a |

## Status
- Phase 1, Research & discovery: ✅ [docs/01-research-and-discovery.md](docs/01-research-and-discovery.md)
- Phase 2/3, Design system + overview dashboard: ✅ approved, [docs/02-design-system.md](docs/02-design-system.md)
- Phase 3b, Remaining frontend pages: ✅ approved
- Phase 4, Supabase backend + auth: ✅ [docs/03-backend.md](docs/03-backend.md)
- Phase 5, ML pipeline (forecaster, GP surrogates, MPC, distilled policy, C export): ✅ [docs/04-ml-pipeline.md](docs/04-ml-pipeline.md)
- Phase 6, Integration (trained models in app, Supabase registry/storage, dataset cycles): ✅
- Phase 7, Testing, accessibility, security, deployment prep: ✅ [docs/05-deployment.md](docs/05-deployment.md)

## Landing page
Signed-out visitors to `/` see the editorial landing page (`frontend/src/components/landing/`); signed-in users get their dashboard. Chapter III runs the trained controller live in the browser on the held-out WLTC 3b cycle. Photographs are freely licensed from Wikimedia Commons and credited in the page colophon (`credits.ts`).

## Quality gates
| Area | Command | Result |
|---|---|---|
| Frontend types / lint | `npm run typecheck && npm run lint` (frontend) | clean |
| Frontend unit + ML parity | `npm test` (frontend) | 8/8 |
| Python pipeline | `python -m pytest` (model-training) | 11/11 |
| Database security (RLS) | `npm run db:test` (backend) | 30/30 |
| C controller SIL | pipeline | max deviation 4e-6 kW over 2 402 steps |
| Accessibility (axe, WCAG AA) | 11 pages × light/dark | 0 serious/critical |



## Run locally
```bash
cd frontend
cp .env.example .env.local   # Supabase URL + publishable key
npm install
npm run dev                  # http://localhost:3000, sign up / sign in
```
