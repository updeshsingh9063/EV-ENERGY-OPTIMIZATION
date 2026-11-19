# Phase 1: Research & Discovery

**Project 96:** Machine Learning-Based Approach for Reduction of Energy Consumption in Hybrid Energy Storage Electric Vehicles
**Working product name:** *VoltSplit* (placeholder, open to change)
**Status:** Draft for review · Phase 1 of 7 · 2026-11-17

---

## ✅ Decisions confirmed (2026-11-17)

- **Hosting:** frontend on **Vercel**; backend and database on **Supabase**.
- **Scope = the problem statement.** We build exactly what PS #96 specifies: its methodology, tech stack, expected outputs and its three dataset links. Extras listed in §7 are **parked** and will not be built unless requested.
- **Architecture consequence:** with no separate server, the heavy Python work (training, MPC/DP optimisation, distillation) runs as an **offline ML pipeline** in the repo (`ml/`). It publishes models and results to Supabase. The live app runs the lightweight distilled controller and simulation inside **Supabase Edge Functions** (policy exported to JS), and exports C for the ECU. See revised §10.

---

## 0. Starting point (audit of existing project)

| Item | Finding |
|---|---|
| Codebase | None. The project folder is empty; this is a greenfield build. |
| Source of truth | Problem statement #96 in `2nd Year Project Statements.docx`. |
| Implications | No legacy constraints. Every architectural choice below is open, so they are flagged as **decisions for your approval**. |

### Issues found in the problem statement itself

1. **The given MPC objective is mathematically wrong.** It minimises
   `Σ (P_req(t+k) + L_bat(P_bat) + L_sc(P_sc))`. `P_req` is the driver's demand; it is *not* a decision variable, so including it changes nothing. Worse, the objective has no term tying the battery and supercapacitor (SC) state to the future, so the optimiser would happily drain the SC to zero. A correct formulation is:

   ```
   min  Σ_k [ L_bat(P_bat,k) + L_sc(P_sc,k) + L_conv(P_bat,k, P_sc,k)
              + w_deg · D_bat(I_bat,k)            ← battery-wear penalty
              + w_Δ · (P_bat,k - P_bat,k-1)² ]    ← smooth battery current
        + w_T · (SOC_sc,H - SOC_sc,ref)²          ← keep SC ready for next event
   s.t. P_bat,k + P_sc,k = P_req,k               (power balance, incl. regen)
        SOC limits, current limits, C-rate limit, SC voltage window, thermal limit
   ```
   We will document this correction in the report; examiners tend to reward catching it.

2. **"ECU integration via CAN bus" can't be literally delivered** without a vehicle or ECU hardware. Realistic substitute: export the distilled policy to dependency-free C (e.g. `m2cgen` / Treelite), compile it, and run **software-in-the-loop (SIL)** verification proving the C controller produces the same outputs as the Python one, with timing and memory figures. This is honest and still demonstrates "ECU-ready".

3. **Simulink/FASTSim validation:** Simulink needs a MATLAB licence. FASTSim (NREL) is free (`pip install fastsim`, Python 3.8 to 3.10), but its EV model has no supercapacitor. Recommendation: use FASTSim (or our own code) for **vehicle dynamics**, speed → traction power, and write our **own HESS model** in Python (battery equivalent circuit + SC + DC/DC converter efficiency). Simulink becomes optional cross-validation if you have a licence.

4. **No real supercapacitor + CAN dataset is publicly available.** SC behaviour must come from datasheet parameters (e.g. a Maxwell 3000 F cell module) in a physics model. That is standard practice in the literature, and we'll state it as an assumption.

5. **The dataset link `github.com/PathfinderAV/driving-cycles` could not be verified** and may not exist. The NASA link has moved (see §9).

---

## 1. Project overview & vision

**Vision:** A web-based *energy-management lab* for battery + supercapacitor electric vehicles. Engineers and researchers load a vehicle and a drive cycle, run rule-based, optimal and ML controllers side-by-side, see exactly where energy and battery life are lost, and export a validated, lightweight controller ready for embedded use.

**One-line pitch:** *"From drive cycle to ECU-ready power-split controller, with proof of how much energy and battery life it saves."*

---

## 2. Problem statement & proposed solution

### The problem
- Batteries handle steady power well but degrade under high current spikes (hard acceleration, regenerative braking). Supercapacitors absorb spikes efficiently but store very little energy.
- Splitting power between the two is a **real-time control problem**: the best split *now* depends on what the driver will demand *next*.
- **Rule-based / low-pass-filter controllers** (the industry default) are cheap but ignore the future and are tuned for one driving style.
- **Optimal methods** (Dynamic Programming (DP) and MPC) are near-ideal, but DP needs the whole trip in advance and MPC is often too heavy for low-cost ECUs.
- There is no accessible tool that lets a team **compare these strategies on the same vehicle and cycle, quantify battery-life impact, and turn the best one into deployable code**.

### Proposed solution (technical core)
1. **Physics simulation:** vehicle dynamics → required power; battery equivalent-circuit model; SC model; converter losses; battery degradation proxy.
2. **Demand forecaster:** predicts `P_req` for the next H seconds (LightGBM; Gaussian Process for uncertainty; a "same as now" baseline to beat).
3. **Optimal teachers:**
   - **DP:** offline, knows the whole trip → the *theoretical best*, used as the benchmark ceiling.
   - **MPC:** uses the forecaster → a realistic real-time optimum.
4. **Policy distillation:** train a small XGBoost/LightGBM model to imitate MPC → near-MPC quality at microsecond inference cost.
5. **Evaluation:** compare against baselines on held-out cycles.
6. **Export:** C code + SIL equivalence test.
7. **Web product:** the interface around all of the above.

---

## 3. Target users & personas

| Persona | Who | Pain points | What they need from us |
|---|---|---|---|
| **Priya, EV powertrain / BMS engineer** | Works at an EV or 2/3-wheeler OEM or a Tier-1 supplier | Licensed tools (AVL, GT-SUITE, Simulink) are expensive and slow to iterate; ML workflows live in scattered notebooks; hard to justify a supercapacitor's added cost to management | Fast A/B of strategies; a battery-life $ argument; exportable controller |
| **Arjun, graduate researcher** | MTech/PhD student working on EMS papers | Rebuilds the same simulation every paper; no standard benchmark; reproducing results is painful | Reproducible runs, standard cycles, downloadable results and plots |
| **Meera, faculty / evaluator** (secondary) | Reviews projects and papers | Can't easily verify claimed savings | A shareable, read-only report with method and numbers |
| **Fleet energy analyst** (future) | E-bus or delivery-fleet operations | Wants to know if retrofitting SCs pays off on *their* routes | Upload real route logs → savings estimate |

**Primary persona for v1:** Priya + Arjun. A fleet-route feature is a later addition.

---

## 4. Domain research summary

**Established energy-management (EMS) families** (per recent reviews, e.g. a 2026 review of 181 HESS papers):

| Family | Examples | Strength | Weakness |
|---|---|---|---|
| Rule-based | Thresholds, low-pass filter, fuzzy logic | Simple, ECU-friendly | Not optimal; needs re-tuning per cycle |
| Global optimisation | DP, Pontryagin's minimum principle | True optimum | Needs future known; offline only |
| Predictive | MPC, LPV-MPC | Near-optimal, handles constraints | Compute cost; depends on forecast quality |
| Learning-based | LSTM current reference, RL (DQN/DDPG), imitation learning | Adapts; cheap inference | Hard to make safe; data-hungry; black box |

**Reported gains in the literature (for setting expectations):**
- Deep-learning velocity-prediction EMS: ~27% average reduction in battery peak power (IEEE Access 2022).
- LSTM-generated SC reference current (Sci. Reports 2025).
- Typical HESS studies report **battery peak current reductions of 30 to 60%** and **total energy changes of only a few percent**.

> ⚠️ **Honest expectation-setting:** the big win from a HESS is **battery stress and lifetime**, not raw kWh. An SC can even *add* converter losses. Our headline metrics should therefore be **battery RMS current, peak C-rate, Ah throughput and degradation proxy**, with total energy reported alongside. Claiming large energy savings would be easy to challenge.

**Future directions the review highlights:** explainable AI, digital twins, edge intelligence. These directly inform our innovative features (§7).

**Base paper:** a paper with this exact title exists (PMC12340030, NIH PubMed Central). Automated access was blocked, so **please open it in your browser and share the PDF or abstract**; we should align with its method and beat or extend its numbers.

---

## 5. Competitor & similar-product analysis

| Product | Type | Strengths | Weaknesses / our opening |
|---|---|---|---|
| **MATLAB/Simulink + Powertrain Blockset** | Desktop, licensed | Industry standard; code generation | Costly; steep learning curve; ML is bolted on; no shareable web reports |
| **AVL CRUISE M / GT-SUITE / IPG CarMaker** | Enterprise simulation | High fidelity; OEM-trusted | Very expensive; heavyweight; not EMS-ML-focused |
| **Argonne Autonomie** | Vehicle system simulation | Rich vehicle library | MATLAB-based; licence-gated |
| **NREL FASTSim** | Free Python/Rust library | Fast; 20+ vehicles; standard cycles | Code-only, no UI; no HESS/SC model |
| **PyBaMM** | Open-source battery physics | Detailed electrochemistry | Cell-level only; no EMS or vehicle |
| **TWAICE, Voltaiq, Electra** | Battery-analytics SaaS | Great dashboards; fleet scale | Analyse batteries, not *control* them; closed; enterprise pricing |
| **Research GitHub repos** | Notebooks | Free | Unreproducible; no UI; one-off |

**Gap we fill:** nothing combines (a) HESS-specific simulation, (b) side-by-side controller benchmarking against a DP optimum, (c) ML distillation with explainability and (d) embedded code export in one modern, shareable web product.

**UI/UX lessons to borrow:**
- **Linear:** keyboard-first, dense-but-calm UI.
- **Weights & Biases:** run comparison and experiment tracking.
- **TWAICE:** battery-health storytelling.
- **Stripe:** clarity of numbers.
- **Vercel:** deployment status and logs.

---

## 6. Core features (each tied to a user problem)

| # | Feature | Problem it solves |
|---|---|---|
| F1 | **Vehicle & HESS configurator**: mass, drag, tyre, motor efficiency; battery pack (cells, capacity, R); SC bank (F, V, ESR); converter efficiency. Presets such as an e-scooter, a city car and an e-bus. | Every study starts by rebuilding a vehicle model |
| F2 | **Drive-cycle library + upload**: UDDS, HWFET, US06, WLTP C3, NEDC; CSV upload of speed/time or real logs | Testing needs standard *and* real cycles |
| F3 | **Simulation runs**: pick vehicle + cycle + controller(s) → run as a background job with live progress | Core action |
| F4 | **Controller suite**: battery-only, rule-based, low-pass filter, MPC, DP (benchmark), ML-distilled | Fair comparison against baselines and the optimum |
| F5 | **Comparison dashboard**: synchronized time-series (speed, P_req, P_bat, P_sc, SOCs, currents); KPI deltas vs baseline; a "% of DP optimum achieved" score | Engineers need to *see* where the gains come from |
| F6 | **Battery-health impact**: Ah throughput, RMS current, peak C-rate, DoD histogram, degradation proxy → projected lifetime extension | Converts technical results into a business case |
| F7 | **Model lab**: forecaster and policy training runs, metrics (MAE, R², imitation error), model versioning | Reproducible ML |
| F8 | **Controller export**: download a C header/source with a SIL equivalence report, size in KB and inference µs | "ECU-ready" deliverable |
| F9 | **Shareable report**: read-only link / PDF of a run comparison | Evaluators and managers |
| F10 | **Auth + projects/workspaces**: save configs, runs and models per user | Persistence and collaboration |

---

## 7. Recommended innovative features: ⏸ PARKED (out of PS scope, not being built)

| Feature | Why it's not gimmicky |
|---|---|
| **"Why this split?" explainability**: SHAP contributions per timestep for the ML policy (e.g. "SC took 70% because predicted decel in 3 s + SC at 85%") | Black-box controllers are the #1 adoption barrier in automotive (supported by review: explainable AI) |
| **Optimality gauge**: every controller scored as a % of the DP global optimum | Gives an absolute, comparable quality number instead of only relative claims |
| **SC sizing sweep**: auto-run across SC sizes → Pareto chart of cost/weight vs battery-life gain | Answers the real business question: "how big a supercap is worth it?" |
| **Forecast-uncertainty-aware MPC**: GP uncertainty bands shown and used to keep an SC energy reserve | Bridges forecasting and control; visible on the chart |
| **Drive-cycle "replay" scrubber**: scrub time and watch power flow animate between battery, SC and motor | Makes the system understandable at a glance; strong demo value |
| **Safety guardrail layer**: the ML output is clipped by a hard rule-based constraint checker; violations are logged and shown | Required for anything called "ECU-ready"; matches the "safety fallback" in the statement |

**Deliberately excluded** (sound impressive, don't serve users now): reinforcement learning (unstable, hard to verify within a semester; DP+MPC distillation is safer), LLM chat assistant, federated learning, live vehicle telematics.

---

## 8. Requirements

### Functional
- FR1 Users can sign up/in (email + OAuth) and manage projects.
- FR2 CRUD for vehicle/HESS configurations, with validation of physical ranges.
- FR3 Upload drive cycles (CSV, ≤ 50 MB) with schema validation and preview.
- FR4 Launch simulation jobs; see queued → running (progress %) → done/failed in real time.
- FR5 Compare ≥ 2 runs on synchronized charts and a KPI table.
- FR6 Train/retrain forecaster and policy; view metrics; set the active model version.
- FR7 Export the controller as C source + SIL report.
- FR8 Generate a shareable read-only report.

### Non-functional
| Area | Target |
|---|---|
| Performance | UDDS (1369 s @ 1 Hz) simulation with distilled policy < 2 s; MPC run < 60 s; dashboard first load (LCP) < 2.5 s |
| ML quality | Distilled policy ≥ 95% of MPC's battery-stress reduction; ≤ 2% gap to DP on energy; zero hard-constraint violations after guardrail |
| Embedded | Exported policy < 64 KB, < 50 µs per inference on desktop CPU (proxy for ECU) |
| Security | Supabase RLS on every table; service keys only server-side; signed URLs for files |
| Accessibility | WCAG 2.2 AA; charts have keyboard and table alternatives; colour-blind-safe palettes |
| Responsiveness | Full function on desktop/laptop/tablet; mobile = review and monitor (heavy configuration is desktop-first, by design) |
| Reproducibility | Every run stores config + dataset hash + model version + code version |

---

## 9. Data sources (verified where possible)

| Data | Source | Use |
|---|---|---|
| Standard drive cycles (UDDS, HWFET, US06, etc.) | US EPA dynamometer schedules; FASTSim demo files (`utils.copy_demo_files()`) | Training and testing cycles |
| WLTP Class 3 | UNECE GTR 15 tables | EU cycle |
| **Real driving + battery data** | *Battery and Heating Data in Real Driving Cycles*: TUM, BMW i3, 72 trips, 10 Hz, V/I/T/SOC (IEEE DataPort, DOI 10.21227/6jr9-5235, free account) | Real-world forecaster training; validates battery model |
| Battery ageing | NASA PCoE Li-ion Battery Aging Datasets (new URL: nasa.gov/intelligent-systems-division/discovery-and-systems-health/pcoe/pcoe-data-set-repository) | Calibrate the degradation proxy / internal resistance |
| Supercapacitor | Manufacturer datasheets (e.g. Maxwell BCAP3000) | SC model parameters |

**Data strategy:** with few cycles, **augment** the training data (speed scaling, time-warping, stitched micro-trips, synthetic grade profiles). **Hold out entire cycles** for testing (e.g. train on UDDS, HWFET and real trips; test on US06 and WLTP) so results reflect generalization, not memorisation.

---

## 10. Proposed system architecture

### 10A. ✅ Approved architecture (Vercel + Supabase only)

```
┌───────────────── Vercel ─────────────────┐
│ Next.js (React, TS): dashboard UI       │
└──────┬───────────────────────────┬───────┘
       │ supabase-js (anon + RLS)  │ Realtime
┌──────▼───────────────────────────▼───────┐
│ SUPABASE                                  │
│ Auth · Postgres+RLS · Storage · Realtime  │
│ Edge Functions (Deno/TS):                 │
│   simulate  → vehicle + HESS model +      │
│               distilled policy (JS export) │
│   export    → signed URL to C controller   │
└──────▲───────────────────────────────────┘
       │ publishes models, MPC/baseline runs, metrics
┌──────┴───────────────────────────────────┐
│ Offline ML pipeline (Python, repo /ml)    │
│ NASA PCoE + FASTSim cycles → features →   │
│ GBM/GP forecaster · loss surrogates ·     │
│ MPC (CasADi/OSQP) · distil → XGBoost/RF → │
│ export C (ECU) + JS (edge) · evaluation   │
│ Retraining = scheduled run (monitoring)   │
└───────────────────────────────────────────┘
```

Rationale:
- A distilled tree ensemble plus a 1 Hz physics simulation of a ~30-minute cycle takes milliseconds in TypeScript, so it fits Edge Function limits.
- MPC is too heavy for Edge Functions, so its runs are precomputed offline for every library cycle and stored as reference results.

### 10B. Original proposal (superseded)

```
┌────────────────────── Browser ──────────────────────┐
│ Next.js (React, TypeScript) · design system · charts │
└──────────┬───────────────────────────────┬──────────┘
           │ supabase-js (anon key + RLS)  │ Realtime (job progress)
┌──────────▼───────────────────────────────▼──────────┐
│                     SUPABASE                         │
│ Auth · Postgres (+RLS) · Storage (cycles, models,    │
│ exports) · Realtime · Edge Function: submit-job      │
└──────────┬──────────────────────────────────────────┘
           │ jobs table (queue): worker claims jobs
┌──────────▼──────────────────────────────────────────┐
│ Python Compute Service (FastAPI + worker, Docker)    │
│ vehicle model · HESS model · DP · MPC (CasADi/OSQP)  │
│ LightGBM/XGBoost/GPyTorch · SHAP · m2cgen → C · SIL  │
└─────────────────────────────────────────────────────┘
```

**Key decision:** Supabase Edge Functions run Deno/TypeScript with tight CPU limits. They **cannot run the Python optimisation and ML stack**. A separate Python worker is therefore unavoidable. To stay simple:
- Use the Postgres `jobs` table as the queue (no Redis/Celery). The worker claims rows with `SELECT … FOR UPDATE SKIP LOCKED`.
- The worker writes progress back; Realtime pushes it to the UI.
- Edge Functions are used only for thin, secure operations: validating and submitting jobs, and signing share links.
- Hosting: Vercel (frontend), Supabase Cloud (free tier), and Render/Fly.io/Railway or a local Docker host for the worker.

**Draft data model** (detailed in Phase 4):
- `profiles`, `projects`, `project_members`
- `vehicles` (incl. HESS config jsonb)
- `drive_cycles` (+ Storage file)
- `controllers`
- `models` (versioned, metrics jsonb)
- `jobs`
- `runs` (KPIs; time-series in Storage as Parquet)
- `exports`, `share_links`

---

## 11. ML pipeline (summary; full spec in Phase 5)

1. **Simulation data generation:** cycles × vehicle variants × SC sizes → DP and MPC solutions = labelled `(state, forecast) → P_sc*` pairs.
2. **Forecaster:**
   - Features: speed/accel lags, rolling stats, grade, time-in-trip.
   - Targets: `P_req` at t+1…t+H, with H ≈ 5 to 10 s.
   - Models: LightGBM vs GP vs persistence baseline.
   - Metrics: MAE/RMSE per horizon step.
3. **Loss surrogates:** at first use the physics-based losses directly. Only learn a surrogate if a high-fidelity loss map is too slow inside MPC; **we will not train one just because the statement lists it**, and we'll justify that decision with timing data.
4. **Policy distillation:**
   - Model: XGBoost/LightGBM.
   - Inputs: SOC_bat, SOC_sc, P_req, forecast summary, speed.
   - Output: P_sc share.
   - Metrics: imitation MAE, and closed-loop KPIs (the metric that actually matters).
5. **Guardrail:** hard limits are enforced post-model.
6. **Evaluation** on held-out cycles: E_tot, battery RMS/peak current, Ah throughput, degradation proxy, SC SOC violations, % of DP optimum, inference time.

---

## 12. Development roadmap

| Phase | Deliverable | Gate |
|---|---|---|
| 1 ✅ | This research document | **Your approval now** |
| 2 | Design system: tokens, type, colour, components, motion; design reference board | Approval |
| 3 | High-fidelity **dashboard/home** (static data clearly marked as design fixtures) | **Approval before other pages** |
| 3b | Remaining screens: configurator, cycles, run compare, model lab, export, report, auth | Approval |
| 4 | Supabase schema, RLS, auth, storage, jobs queue; Python worker skeleton | Approval |
| 5 | Physics models → baselines → DP → MPC → forecaster → distillation → C export + SIL | Metrics review |
| 6 | End-to-end integration; remove all fixtures | Approval |
| 7 | Testing (unit, integration, e2e with Playwright), accessibility and performance audit, deployment | Final sign-off |

**Recommended priority if time runs short:** physics + baselines + MPC + distillation + comparison dashboard (the graded core) **before** SC sizing sweep, sharing, explainability.

---

## 13. Risks

| Risk | Mitigation |
|---|---|
| MPC too slow for data generation | Linearise/convexify → OSQP QP; shorter horizon; parallel worker |
| Distilled policy violates constraints | Guardrail layer + constraint-violation metric |
| Results don't generalise | Held-out cycles + augmentation + real BMW i3 trips |
| Small energy savings disappoint | Lead with battery-stress/lifetime metrics (where HESS actually wins); report energy honestly |
| Scope too large for a semester | Strict phase gates; cut list defined above |

---

## 14. Open questions for you

1. **Timeline & team:** How many weeks until submission, and how many people are building this?
2. **MATLAB/Simulink:** Do you have a licence, and does your evaluator *require* Simulink results?
3. **Vehicle class focus:** Indian 2/3-wheeler or e-rickshaw, passenger car, or e-bus? (This changes presets and which story to tell. 2W/3W with SC is very relevant in India.)
4. **Multi-user:** Is login/projects genuinely needed for grading, or is a single-user demo acceptable? (This affects Phase 4 scope.)
5. **Hosting:** Is a free-tier cloud deployment fine, or must it run fully locally for the demo?
6. **Base paper:** Can you share the PDF of PMC12340030?
7. **Product name:** keep *VoltSplit* or propose another?

---

### Sources
- Machine learning-based approach for reduction of energy consumption in HESS EV (base paper): https://pmc.ncbi.nlm.nih.gov/articles/PMC12340030/
- HESS review & EMS literature: https://mdpi-res.com/d_attachment/wevj/wevj-17-00380/article_deploy/wevj-17-00380.pdf · https://doaj.org/article/6dd528e7ffe849b8bb4733e9e223ba5d · https://doaj.org/article/88e481422ca6465abacde6fec0952b59
- NREL FASTSim: https://www.nrel.gov/fastsim · https://pypi.org/project/fastsim · https://github.com/NREL/fastsim
- NASA PCoE repository: https://www.nasa.gov/intelligent-systems-division/discovery-and-systems-health/pcoe/pcoe-data-set-repository/ · https://data.nasa.gov/dataset/li-ion-battery-aging-datasets
- Battery and Heating Data in Real Driving Cycles: https://ieee-dataport.org/open-access/battery-and-heating-data-real-driving-cycles
