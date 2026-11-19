# Phase 2: Design System

**Live reference:** run the frontend and open `/design-system`. Tokens live in [`frontend/src/app/globals.css`](../frontend/src/app/globals.css); components live in [`frontend/src/components/ui/`](../frontend/src/components/ui/).

## 1. Direction: "Instrument-grade calm"

VoltSplit is an engineering tool, so the interface should feel like a precision instrument: quiet, exact and trustworthy, not a marketing page.

- **Colour is reserved for energy.** The chrome is warm graphite. **Blue always means battery**, **orange always means supercapacitor**, and nothing else competes with them.
- **Numbers are first-class.** Every value is set in Geist Mono with tabular figures, so columns align and values don't jitter while they update.
- **Depth comes from hairlines and tone steps,** not heavy shadows or gradients.
- **Motion explains state:** content rises in on load, energy flows along dashed paths, skeletons show loading, and the crosshair tracks the cursor. There is nothing decorative, and everything respects `prefers-reduced-motion`.

References studied: Linear (calm density, keyboard-first chrome), Stripe (number clarity), Vercel (status and log surfaces), Weights & Biases (run comparison).

## 2. Tokens

| Group | Light | Dark | Notes |
|---|---|---|---|
| Canvas / surface 1 / 2 / 3 | `#f6f6f4` / `#fff` / `#f1f1ee` / `#e9e9e5` | `#0d0d0c` / `#161615` / `#1d1d1b` / `#262624` | Warm neutrals |
| Line / line-strong | `#e4e4df` / `#d3d3cc` | `#262624` / `#34342f` | Hairlines vs control borders |
| Ink 1 / 2 / 3 | `#121211` / `#52514e` / `#6b6a65` (darkened in Phase 7 for WCAG AA) | `#f0efec` / `#b9b8b0` / `#8a8983` | Primary / secondary / muted |
| Primary action | Ink (`#121211`) | Inverted ink | Confident and quiet; no brand-blue buttons that clash with battery data |
| Volt `#c6f432` | logo + brand moments only | n/a | Never used for data |
| **Battery series** | `#2a78d6` | `#3987e5` | Validated |
| **Supercap series** | `#eb6834` | `#d95926` | Validated |
| Demand series | ink at 32% | ink at 32% | A reference line, not an identity colour |
| Status good / warning / critical | `#0ca30c` / `#fab219` / `#d03b3b` | same | Always icon + label |

**Series colour validation** (dataviz six-check validator, both themes, against their surfaces): all checks pass. Worst-case colour-vision-deficiency ΔE is 24.7 in light and 26.8 in dark (target ≥ 8); contrast is ≥ 3:1.

**Typography:** Geist Sans for UI, Geist Mono for numbers.

| Size / line height | Role |
|---|---|
| 56/56 | Hero number |
| 40/44 | Display |
| 28/34 | Page title |
| 20/28 | Section |
| 16/24 | Card title |
| 14/22 | Body |
| 13/20 | UI / table |
| 12/16 | Caption |
| 11/16 | Overline |

Headings use -0.02em tracking; hero numbers use -0.04em.

**Spacing and shape:**
- Spacing: 4px grid.
- Radii: 4 / 6 / 10 / 14 / 20 (xs → xl).
- Elevation: three levels, card / pop / modal.

**Motion:**
- Durations: 120ms (hover), 200ms (state change), 420ms (entrance).
- Easing: `cubic-bezier(0.22,1,0.36,1)`.
- Entrances are staggered by 40ms.

## 3. Components (built)

| Component | File | Notes |
|---|---|---|
| Button (primary, secondary, ghost, danger × sm/md/lg; loading; disabled) | `ui/primitives.tsx` | 1px press feedback |
| Card, CardHeader | `ui/primitives.tsx` | |
| StatusBadge, Tag | `ui/primitives.tsx` | Status = icon + label + tone |
| Segmented control | `ui/primitives.tsx` | `radiogroup` semantics |
| Field (label, unit, hint, error) | `ui/primitives.tsx` | `aria-invalid`, `aria-describedby` |
| Skeleton, EmptyState | `ui/primitives.tsx` | |
| SeriesKey (legend) | `ui/primitives.tsx` | |
| Dialog | `ui/Dialog.tsx` | Native `<dialog>`: focus trap, Esc, backdrop click |
| Toast | `ui/Toast.tsx` | `aria-live`, auto-dismiss after 5 s, max 3 |
| AppShell (sidebar, top bar, mobile drawer, theme toggle) | `shell/AppShell.tsx` | Theme stored per viewer, applied before paint (no flash) |
| CycleTrace chart | `charts/CycleTrace.tsx` | See below |

**CycleTrace chart:**
- Three stacked panels: speed, power split, supercap charge.
- Each panel has a single axis; no dual-axis charts.
- Crosshair and tooltip are synced across panels.
- Keyboard: ←/→ steps 5 s, Shift jumps 30 s, Esc clears.
- Responsive through ResizeObserver.

Tables and drop-downs/tooltips beyond those shown are built as the remaining screens need them (Phase 3b).

## 4. Data-viz rules we follow
- One y-axis per panel; different units go in separate panels.
- Colour follows the entity (battery and supercap), never its rank.
- Thin lines: battery 2px, supercap 1.5px, demand 1px at low opacity.
- Recessive grid lines; the zero line is stronger.
- A legend is always present; values appear in ink, not in the series colour.
- Status colours are never used for series.

## 5. Responsive behaviour
- ≥1024px: fixed 232px sidebar.
- Below 1024px: top bar with a drawer.
- The KPI grid collapses to 2×2, the comparison table scrolls horizontally inside its card, and panels stack.

Verified at 390 / 820 / 1440 px with no page-level horizontal scroll.

## 6. Information architecture (all screens built, Phase 3b)

| Group | Screen | What works now (browser storage until Supabase in Phase 4/6) |
|---|---|---|
| Workspace | Overview | Built-in cycles × all controllers for the active vehicle; recent runs and model status from the shared data layer |
| Workspace | Simulate | Vehicle + cycle + controllers + initial SOC → real physics simulation; results are saved as runs |
| Workspace | Runs / run detail / compare | Filter, multi-select, delete (with confirmation), CSV export; per-run trace CSV, re-run, configuration snapshot; side-by-side comparison |
| Inputs | Drive cycles | Built-in cycles plus CSV upload (validated, resampled to 1 Hz); stats and speed chart; delete uploads; problem-statement datasets listed (imported in Phase 5) |
| Inputs | Vehicle & HESS | Read-only presets; duplicate/new/edit/delete with per-field physical range validation; set active vehicle |
| Intelligence | Models | Lifecycle stages from the problem statement, 4 model specs with acceptance targets, dataset links; status "Not trained" until Phase 5 |
| Intelligence | ECU controller | CAN signal interface for the active vehicle; **generated C99 safety-guardrail header** (copy / download); policy export slots filled after training |
| Intelligence | Monitoring | Aggregates over all runs (peak C, E_tot, DoD stress, constraint violations); retraining plan |
| System | Design system | Living reference of tokens and components |

Global: Ctrl/⌘ K search palette (pages, runs, cycles, vehicles), live active-vehicle card, toasts for every outcome, confirmation before every destructive action.

**Still waiting on later phases:**
- Sign-in and accounts (Phase 4, Supabase Auth)
- Cloud persistence (Phase 4/6)
- Trained MPC and ML controllers, plus WLTP/US06 imports (Phase 5)
