"use client";

import clsx from "clsx";
import { Activity, ArrowDownRight, ArrowUpRight, Cpu, Info, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CycleTrace } from "@/components/charts/CycleTrace";
import {
  buttonClasses,
  Card,
  CardHeader,
  EmptyState,
  Skeleton,
  Segmented,
  SeriesKey,
  StatusBadge,
  Tag,
} from "@/components/ui/primitives";
import {
  CONTROLLERS,
  overviewCycles,
  runCycle,
  shortName,
  type ControllerKey,
} from "@/lib/fixtures/overview";
import type { SimResult } from "@/lib/hess/model";
import { controllerDef, type LoadedModels } from "@/lib/hess/registry";
import { useModels } from "@/lib/useModels";
import { timeAgo } from "@/lib/format";
import { MODELS } from "@/lib/models";
import { useActiveVehicle, useStore } from "@/lib/store";

const pct = (a: number, b: number) => ((a - b) / b) * 100;
const fmtPct = (v: number) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toFixed(1)}%`;

/* ------------------------------------------------------------- KPI tiles */

function Delta({ value, goodWhenNegative = true }: { value: number; goodWhenNegative?: boolean }) {
  const good = goodWhenNegative ? value < 0 : value > 0;
  const Icon = value < 0 ? ArrowDownRight : ArrowUpRight;
  return (
    <span
      className={clsx(
        "num inline-flex items-center gap-0.5 rounded-xs px-1 text-xs font-medium",
        Math.abs(value) < 0.05 ? "text-ink-3" : good ? "bg-good-bg text-good-ink" : "bg-critical-bg text-critical-ink",
      )}
    >
      <Icon className="size-3" aria-hidden />
      {fmtPct(value)}
    </span>
  );
}

function Kpi({
  label,
  value,
  unit,
  delta,
  hint,
}: {
  label: string;
  value: string;
  unit: string;
  delta: number;
  hint: string;
}) {
  return (
    <div className="flex flex-col justify-between gap-3 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-2">{label}</span>
        <Delta value={delta} />
      </div>
      <div>
        <span className="num text-xl font-medium text-ink-1">{value}</span>
        <span className="ml-1 text-sm text-ink-3">{unit}</span>
      </div>
      <span className="text-2xs text-ink-3">{hint}</span>
    </div>
  );
}

/* --------------------------------------------------------- Power flow */

function energyFlows(r: SimResult) {
  let bat = 0, scOut = 0, scIn = 0, regen = 0, traction = 0;
  for (let i = 0; i < r.trace.t.length; i++) {
    const pb = r.trace.pBat[i], ps = r.trace.pSc[i], pr = r.trace.pReq[i];
    if (pb > 0) bat += pb;
    if (ps > 0) scOut += ps; else scIn -= ps;
    if (pr < 0) regen -= pr; else traction += pr;
  }
  const k = 1 / 3.6e6;
  return { bat: bat * k, scOut: scOut * k, scIn: scIn * k, regen: regen * k, traction: traction * k };
}

function PowerFlow({ r }: { r: SimResult }) {
  const f = energyFlows(r);
  const scShare = f.traction > 0 ? (f.scOut / f.traction) * 100 : 0;
  const regenCaptured = f.regen > 0 ? Math.min(100, (f.scIn / f.regen) * 100) : 0;
  const node = "fill-[var(--surface-2)] stroke-[var(--line-strong)]";
  return (
    <div>
      <svg viewBox="0 0 320 150" className="mx-auto w-full max-w-[380px]" role="img" aria-label="Energy flow between battery, supercapacitor, DC bus and motor">
        <path d="M70 40 H160 V75" className="flow-line" fill="none" stroke="var(--series-bat)" strokeWidth="2" />
        <path d="M70 110 H160 V75" className="flow-line" fill="none" stroke="var(--series-sc)" strokeWidth="2" />
        <path d="M160 75 H250" className="flow-line" fill="none" stroke="var(--ink-3)" strokeWidth="2" />
        <rect x="8" y="22" width="62" height="36" rx="8" className={node} />
        <text x="39" y="44" textAnchor="middle" className="fill-[var(--ink-1)] text-[11px] font-medium">Battery</text>
        <rect x="8" y="92" width="62" height="36" rx="8" className={node} />
        <text x="39" y="114" textAnchor="middle" className="fill-[var(--ink-1)] text-[11px] font-medium">Supercap</text>
        <circle cx="160" cy="75" r="7" fill="var(--surface-1)" stroke="var(--ink-2)" strokeWidth="2" />
        <text x="170" y="91" className="fill-[var(--ink-3)] text-[10px]">DC bus</text>
        <rect x="250" y="57" width="62" height="36" rx="8" className={node} />
        <text x="281" y="79" textAnchor="middle" className="fill-[var(--ink-1)] text-[11px] font-medium">Motor</text>
        <text x="110" y="33" textAnchor="middle" className="num fill-[var(--ink-2)] text-[10px]">{f.bat.toFixed(2)} kWh</text>
        <text x="110" y="128" textAnchor="middle" className="num fill-[var(--ink-2)] text-[10px]">{f.scOut.toFixed(2)} kWh</text>
      </svg>
      <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line">
        <div className="bg-surface-1 p-3">
          <dt className="text-2xs text-ink-3">Traction energy from SC</dt>
          <dd className="num mt-0.5 text-md text-ink-1">{scShare.toFixed(1)}%</dd>
        </div>
        <div className="bg-surface-1 p-3">
          <dt className="text-2xs text-ink-3">Regen absorbed by SC</dt>
          <dd className="num mt-0.5 text-md text-ink-1">{regenCaptured.toFixed(0)}%</dd>
        </div>
      </dl>
    </div>
  );
}

/* ------------------------------------------------- Controller comparison */

function ComparisonTable({ runs, selected }: { runs: ReturnType<typeof runCycle>; selected: ControllerKey }) {
  const base = runs.battery.kpis;
  const maxStress = Math.max(...CONTROLLERS.map((c) => runs[c.key].kpis.dodStress));
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Scrollable table">
      <table className="w-full min-w-[620px] text-sm">
        <thead>
          <tr className="border-y border-line bg-surface-2 text-left text-2xs uppercase tracking-[0.06em] text-ink-3">
            <th className="py-2 pl-5 pr-3 font-medium">Controller</th>
            <th className="px-3 py-2 text-right font-medium">E<sub>tot</sub> kWh</th>
            <th className="px-3 py-2 text-right font-medium">Peak C-rate</th>
            <th className="px-3 py-2 text-right font-medium">RMS current</th>
            <th className="py-2 pl-3 pr-5 font-medium">DoD cycle stress</th>
          </tr>
        </thead>
        <tbody>
          {CONTROLLERS.map((c) => {
            const k = runs[c.key].kpis;
            const isBase = c.key === "battery";
            return (
              <tr
                key={c.key}
                className={clsx(
                  "border-b border-line transition-colors last:border-b-0 hover:bg-surface-2",
                  c.key === selected && "bg-surface-2/60",
                )}
              >
                <td className="py-3 pl-5 pr-3">
                  <div className="flex items-center gap-2">
                    <span className={clsx("font-medium", c.key === selected ? "text-ink-1" : "text-ink-2")}>{c.label}</span>
                    {c.preview && <Tag>stand-in</Tag>}
                  </div>
                  <div className="text-2xs text-ink-3">{c.kind}</div>
                </td>
                <td className="num px-3 py-3 text-right text-ink-1">
                  {k.energyTotalKwh.toFixed(3)}
                  {!isBase && <div className="text-2xs text-ink-3">{fmtPct(pct(k.energyTotalKwh, base.energyTotalKwh))}</div>}
                </td>
                <td className="num px-3 py-3 text-right text-ink-1">
                  {k.peakCRate.toFixed(2)}C
                  {!isBase && <div className="text-2xs text-ink-3">{fmtPct(pct(k.peakCRate, base.peakCRate))}</div>}
                </td>
                <td className="num px-3 py-3 text-right text-ink-1">
                  {k.rmsCurrentA.toFixed(1)} A
                  {!isBase && <div className="text-2xs text-ink-3">{fmtPct(pct(k.rmsCurrentA, base.rmsCurrentA))}</div>}
                </td>
                <td className="py-3 pl-3 pr-5">
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="h-full rounded-full bg-[var(--ink-2)] transition-[width] duration-500 ease-out"
                        style={{ width: `${(k.dodStress / maxStress) * 100}%` }}
                      />
                    </div>
                    <span className="num w-12 text-right text-xs text-ink-2">{k.dodStress.toFixed(1)}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------- Page body */

export function Overview() {
  const { models, error } = useModels();
  if (!models) return <ModelsLoading error={error} />;
  return <OverviewInner models={models} />;
}

function ModelsLoading({ error }: { error: string | null }) {
  return error ? (
    <div role="alert" className="rounded-md bg-critical-bg px-4 py-3 text-sm text-critical-ink">Couldn&apos;t load the trained models: {error}</div>
  ) : (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading trained models">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-44" />
      <Skeleton className="h-96" />
    </div>
  );
}

function OverviewInner({ models: trained }: { models: LoadedModels }) {
  const { cycles: allCycles, models } = useStore();
  const options = useMemo(() => overviewCycles(allCycles), [allCycles]);
  const [cycleId, setCycleId] = useState<string>("ds-wltc_3b");
  const cycle = options.find((c) => c.id === cycleId) ?? options[0];
  const [ctrl, setCtrl] = useState<ControllerKey>("ml");
  const vehicle = useActiveVehicle();
  const { runs: history } = useStore();
  const runs = useMemo(() => runCycle(cycle, vehicle.config, trained), [cycle, vehicle.config, trained]);
  const cycleLabel = shortName(cycle);
  const r = runs[ctrl];
  const base = runs.battery.kpis;
  const k = r.kpis;

  const trace = useMemo(
    () => ({
      t: r.trace.t,
      speedKmh: runs.speedKmh,
      pReqKw: r.trace.pReq.map((p) => p / 1000),
      pBatKw: r.trace.pBat.map((p) => p / 1000),
      pScKw: r.trace.pSc.map((p) => p / 1000),
      socScPct: r.trace.socSc.map((s) => s * 100),
    }),
    [r, runs.speedKmh],
  );

  const peakDelta = pct(k.peakCRate, base.peakCRate);
  const ctrlLabel = CONTROLLERS.find((c) => c.key === ctrl)!.label;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="rise flex flex-wrap items-end justify-between gap-4" style={{ animationDelay: "40ms" }}>
        <div>
          <p className="text-xs font-medium text-ink-3">Overview</p>
          <h1 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-ink-1 sm:text-[32px] sm:leading-[38px]">
            Hybrid storage energy management
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-ink-2">
            How the {ctrlLabel} controller splits power between battery and supercapacitor on the{" "}
            {cycleLabel} cycle, compared with battery-only operation.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/controller" className={buttonClasses("secondary")}>
            <Cpu className="size-3.5" aria-hidden /> Export controller
          </Link>
          <Link href="/simulate" className={buttonClasses("primary")}>
            <Plus className="size-3.5" aria-hidden /> New simulation
          </Link>
        </div>
      </div>

      {/* Controls */}
      <div className="rise flex flex-wrap items-center gap-x-5 gap-y-3" style={{ animationDelay: "80ms" }}>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-3">Cycle</span>
          <Segmented
            label="Drive cycle"
            value={cycle.id}
            onChange={setCycleId}
            options={options.map((c) => ({ value: c.id, label: shortName(c) }))}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-3">Controller</span>
          <Segmented
            label="Controller"
            value={ctrl}
            onChange={setCtrl}
            options={CONTROLLERS.filter((c) => c.key !== "battery").map((c) => ({ value: c.key, label: c.label }))}
          />
        </div>
      </div>

      {/* Hero + KPIs */}
      <Card className="rise grid overflow-hidden lg:grid-cols-[1.25fr_2fr]" style={{ animationDelay: "120ms" }}>
        <div className="relative flex flex-col justify-between gap-6 border-b border-line p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-1.5 text-xs text-ink-2">
            Peak battery C-rate vs battery-only
            <Info className="size-3 text-ink-3" aria-label="Highest battery current divided by capacity (60 Ah)" />
          </div>
          <div>
            <div className="num text-3xl font-medium tracking-[-0.04em] text-ink-1 sm:text-[64px] sm:leading-[64px]">
              {fmtPct(peakDelta)}
            </div>
            <p className="mt-3 text-sm text-ink-2">
              <span className="num text-ink-1">{base.peakCRate.toFixed(2)}C</span> →{" "}
              <span className="num text-ink-1">{k.peakCRate.toFixed(2)}C</span>. The supercapacitor absorbs the
              acceleration and braking transients so the battery sees a smoother load.
            </p>
            <div className="mt-5 flex flex-col gap-2" aria-hidden>
              {[
                { label: "Battery only", v: base.peakCRate, cls: "bg-[var(--ink-3)] opacity-50" },
                { label: ctrlLabel, v: k.peakCRate, cls: "bg-[var(--series-bat)]" },
              ].map((b) => (
                <div key={b.label} className="grid grid-cols-[92px_1fr_44px] items-center gap-3 text-2xs">
                  <span className="truncate text-ink-3">{b.label}</span>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 ease-out ${b.cls}`}
                      style={{ width: `${(b.v / Math.max(base.peakCRate, k.peakCRate)) * 100}%` }}
                    />
                  </div>
                  <span className="num text-right text-ink-2">{b.v.toFixed(2)}C</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 divide-line sm:divide-x [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-line">
          <Kpi
            label="Total energy E_tot"
            value={k.energyTotalKwh.toFixed(3)}
            unit="kWh"
            delta={pct(k.energyTotalKwh, base.energyTotalKwh)}
            hint="Storage energy incl. converter and ESR losses"
          />
          <Kpi
            label="Battery RMS current"
            value={k.rmsCurrentA.toFixed(1)}
            unit="A"
            delta={pct(k.rmsCurrentA, base.rmsCurrentA)}
            hint="Drives I²R heating and ageing"
          />
          <Kpi
            label="DoD cycle stress"
            value={k.dodStress.toFixed(1)}
            unit="idx"
            delta={pct(k.dodStress, base.dodStress)}
            hint="ΔSOC weighted by C-rate^1.3"
          />
          <Kpi
            label="Ah throughput"
            value={k.ahThroughput.toFixed(2)}
            unit="Ah"
            delta={pct(k.ahThroughput, base.ahThroughput)}
            hint="Charge moved through the battery"
          />
        </div>
      </Card>

      {/* Main trace */}
      <Card className="rise" style={{ animationDelay: "160ms" }}>
        <CardHeader
          title={`Power split · ${cycleLabel}`}
          description={`${cycle.description} · ${vehicle.name} · ${Math.round(r.trace.t.length / 60)} min · ${ctrlLabel}`}
          actions={
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <SeriesKey color="var(--series-bat)" label="Battery P_bat" />
              <SeriesKey color="var(--series-sc)" label="Supercap P_sc" />
              <SeriesKey color="var(--ink-3)" label="Demand P_req" />
            </div>
          }
        />
        <div className="px-3 pb-4 pt-3 sm:px-5">
          <CycleTrace data={trace} />
        </div>
      </Card>

      {/* Comparison + flow */}
      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <Card className="rise overflow-hidden" style={{ animationDelay: "200ms" }}>
          <CardHeader
            title="Controller comparison"
            description={`Same vehicle, ${cycleLabel} cycle. Deltas vs battery-only.`}
          />
          <div className="mt-4">
            <ComparisonTable runs={runs} selected={ctrl} />
          </div>
        </Card>
        <Card className="rise" style={{ animationDelay: "240ms" }}>
          <CardHeader title="Energy flow" description={`${ctrlLabel} · whole cycle`} />
          <div className="px-5 pb-5 pt-4">
            <PowerFlow r={r} />
          </div>
        </Card>
      </div>

      {/* Models + runs */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="rise overflow-hidden" style={{ animationDelay: "280ms" }}>
          <CardHeader
            title="Model registry"
            description="Learned components used by the controller"
            actions={
              <Link href="/models" className={buttonClasses("ghost", "sm")}>
                View all
              </Link>
            }
          />
          <ul className="mt-3 divide-y divide-line border-t border-line">
            {MODELS.map((spec) => {
              const rec = models.find((x) => x.kind === spec.id && x.status === "active");
              const ev = rec ? spec.evaluate(rec.metrics) : null;
              return (
                <li key={spec.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink-1">{spec.name}</div>
                    <div className="truncate text-2xs text-ink-3">{rec ? String(rec.metrics.algorithm ?? spec.algorithms) : spec.algorithms}</div>
                  </div>
                  <div className="text-right">
                    <div className="num text-sm text-ink-1">{ev ? ev.display : spec.target}</div>
                    <div className="text-2xs text-ink-3">{ev ? spec.metric : `${spec.metric} target`}</div>
                  </div>
                  {!rec ? (
                    <StatusBadge status="neutral">Pending</StatusBadge>
                  ) : ev?.pass ? (
                    <StatusBadge status="good">{rec.version}</StatusBadge>
                  ) : (
                    <StatusBadge status="warning">{rec.version}</StatusBadge>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
        <Card className="rise overflow-hidden" style={{ animationDelay: "320ms" }}>
          <CardHeader
            title="Recent runs"
            description="Your latest simulations"
            actions={
              <Link href="/runs" className={buttonClasses("ghost", "sm")}>
                View all
              </Link>
            }
          />
          {history.length === 0 ? (
            <EmptyState
              icon={<Activity className="size-4" />}
              title="No runs yet"
              body="Run a simulation to compare controllers on any vehicle and drive cycle."
              action={
                <Link href="/simulate" className={buttonClasses("primary")}>
                  New simulation
                </Link>
              }
            />
          ) : (
            <ul className="mt-3 divide-y divide-line border-t border-line">
              {history.slice(0, 5).map((run) => (
                <li key={run.id}>
                  <Link
                    href={`/runs/${run.id}`}
                    className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-2"
                  >
                    <span className="num hidden w-12 text-xs text-ink-3 sm:block">#{run.seq}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-ink-1">{run.cycleName}</div>
                      <div className="truncate text-2xs text-ink-3">
                        {controllerDef(run.controller).label} · {run.vehicleName} · {timeAgo(run.createdAt)}
                      </div>
                    </div>
                    <span className="num text-sm text-ink-1">
                      {fmtPct(pct(run.kpis.peakCRate, run.baseline.peakCRate))} peak C
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
