"use client";

import clsx from "clsx";
import { ArrowRight, Play, ShieldAlert, Sigma } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { CycleTrace } from "@/components/charts/CycleTrace";
import { CheckRow, PageHeader, Select } from "@/components/ui/form";
import { Button, buttonClasses, Card, CardHeader, EmptyState, Field, Segmented, SeriesKey, Tag } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { cycleStats } from "@/lib/hess/cycles";
import type { SimResult } from "@/lib/hess/model";
import {
  CONTROLLER_DEFS,
  controllerDef,
  fmtPct,
  KPI_DEFS,
  pctDelta,
  runOne,
  toTraceData,
  type ControllerKey,
} from "@/lib/hess/registry";
import { fmtDuration } from "@/lib/format";
import { useStore, type NewRun, type Run } from "@/lib/store";
import { useModels } from "@/lib/useModels";

interface Result {
  runs: Run[];
  results: Partial<Record<ControllerKey, SimResult>>;
  baseline: SimResult;
  speedMs: number[];
}

export function Simulate() {
  const params = useSearchParams();
  const { vehicles, cycles, activeVehicleId, addRuns } = useStore();
  const toast = useToast();
  const { models, error: modelsError } = useModels();

  const [vehicleId, setVehicleId] = useState(params.get("vehicle") ?? activeVehicleId);
  const [cycleId, setCycleId] = useState(params.get("cycle") ?? cycles[0].id);
  const [selected, setSelected] = useState<ControllerKey[]>(["rule", "mpc", "ml"]);
  const [socBat, setSocBat] = useState("80");
  const [socSc, setSocSc] = useState("75");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [view, setView] = useState<ControllerKey>("ml");

  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? vehicles[0];
  const cycle = cycles.find((c) => c.id === cycleId) ?? cycles[0];
  const stats = useMemo(() => cycleStats(cycle.speedMs), [cycle]);

  const sb = Number(socBat), ss = Number(socSc);
  const errBat =
    !Number.isFinite(sb) || sb < vehicle.config.battery.socMin * 100 || sb > vehicle.config.battery.socMax * 100
      ? `Between ${vehicle.config.battery.socMin * 100}% and ${vehicle.config.battery.socMax * 100}%.`
      : undefined;
  const errSc = !Number.isFinite(ss) || ss < 0 || ss > 100 ? "Between 0% and 100%." : undefined;
  const canRun = selected.length > 0 && !errBat && !errSc && !busy && !!models;

  const run = () => {
    if (!canRun || !models) return;
    setBusy(true);
    // Yield a frame so the loading state paints before the synchronous solve.
    setTimeout(async () => {
      try {
        const init = { socBat: sb / 100, socSc: ss / 100 };
        const t0 = performance.now();
        const baseline = runOne(vehicle.config, cycle, "battery", init, models);
        const results: Result["results"] = {};
        const drafts: NewRun[] = [];
        for (const key of selected) {
          const s = performance.now();
          const r = runOne(vehicle.config, cycle, key, init, models);
          results[key] = r;
          drafts.push({
            vehicleId: vehicle.id,
            vehicleName: vehicle.name,
            config: vehicle.config,
            cycleId: cycle.id,
            cycleName: cycle.name,
            controller: key,
            init,
            kpis: r.kpis,
            baseline: baseline.kpis,
            computeMs: performance.now() - s,
          });
        }
        const saved = await addRuns(drafts);
        setResult({ runs: saved, results, baseline, speedMs: cycle.speedMs });
        setView(selected.includes(view) ? view : selected[selected.length - 1]);
        toast({
          tone: "good",
          title: `${saved.length} run${saved.length > 1 ? "s" : ""} complete`,
          body: `${cycle.name} · ${vehicle.name} · ${(performance.now() - t0).toFixed(0)} ms`,
        });
      } catch (e) {
        toast({ tone: "critical", title: "Simulation or save failed", body: e instanceof Error ? e.message : String(e) });
      } finally {
        setBusy(false);
      }
    }, 30);
  };

  const shown = result?.results[view];
  const shownRun = result?.runs.find((r) => r.controller === view);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Workspace"
        title="Simulate"
        description="Run the HESS model over a drive cycle and compare power-split controllers against battery-only operation."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[340px_1fr]">
        {/* Configuration */}
        <Card className="rise lg:sticky lg:top-20" style={{ animationDelay: "40ms" }}>
          <CardHeader title="Configuration" />
          <div className="flex flex-col gap-5 p-5">
            <Select
              id="sim-vehicle"
              label="Vehicle & HESS"
              value={vehicle.id}
              onChange={(e) => setVehicleId(e.target.value)}
              hint={vehicle.description}
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
            <Select
              id="sim-cycle"
              label="Drive cycle"
              value={cycle.id}
              onChange={(e) => setCycleId(e.target.value)}
              hint={
                <span className="num">
                  {fmtDuration(stats.durationS)} · {stats.distanceKm.toFixed(1)} km · max {stats.maxKmh.toFixed(0)} km/h
                </span>
              }
            >
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-xs font-medium text-ink-2">Controllers</legend>
              <CheckRow checked disabled onChange={() => {}} title="Battery only" description="Always run as the baseline" />
              {CONTROLLER_DEFS.filter((c) => c.key !== "battery").map((c) => (
                <CheckRow
                  key={c.key}
                  checked={selected.includes(c.key)}
                  onChange={(on) => setSelected((s) => (on ? [...s, c.key] : s.filter((k) => k !== c.key)))}
                  title={
                    <>
                      {c.label}
                      {c.preview && <Tag>stand-in</Tag>}
                    </>
                  }
                  description={c.kind}
                />
              ))}
              {selected.length === 0 && <p className="text-2xs text-critical-ink">Select at least one controller.</p>}
            </fieldset>

            <div className="grid grid-cols-2 gap-3">
              <Field id="sim-socb" label="Battery SOC₀" unit="%" inputMode="decimal" value={socBat} onChange={(e) => setSocBat(e.target.value)} error={errBat} />
              <Field id="sim-socs" label="Supercap SOC₀" unit="%" inputMode="decimal" value={socSc} onChange={(e) => setSocSc(e.target.value)} error={errSc} />
            </div>

            <Button variant="primary" size="lg" onClick={run} disabled={!canRun} loading={busy}>
              {!busy && <Play className="size-4" aria-hidden />}
              {busy ? "Simulating…" : models ? "Run simulation" : modelsError ? "Models unavailable" : "Loading models…"}
            </Button>
          </div>
        </Card>

        {/* Results */}
        <div className="flex min-w-0 flex-col gap-6">
          {!result ? (
            <Card className="rise" style={{ animationDelay: "80ms" }}>
              <EmptyState
                icon={<Sigma className="size-4" />}
                title="Ready to simulate"
                body="Choose a vehicle, a drive cycle and the controllers to compare. Every run is saved to Runs so you can revisit or compare it later."
              />
            </Card>
          ) : (
            <>
              <div className="rise flex flex-wrap items-center justify-between gap-3">
                <Segmented
                  label="Show controller"
                  value={view}
                  onChange={setView}
                  options={result.runs.map((r) => ({ value: r.controller, label: controllerDef(r.controller).label }))}
                />
                {shownRun && (
                  <Link href={`/runs/${shownRun.id}`} className={buttonClasses("ghost", "sm")}>
                    Open run #{shownRun.seq} <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                )}
              </div>

              {shown && (
                <>
                  <Card className="rise overflow-hidden">
                    <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3">
                    {KPI_DEFS.map((k) => {
                      const v = shown.kpis[k.key];
                      const b = result.baseline.kpis[k.key];
                      const d = pctDelta(v, b);
                      return (
                        <div key={k.key} className="bg-surface-1 p-4">
                          <div className="text-xs text-ink-2">{k.label}</div>
                          <div className="mt-2">
                            <span className="num text-lg font-medium text-ink-1">{v.toFixed(k.digits)}</span>
                            <span className="ml-1 text-xs text-ink-3">{k.unit}</span>
                          </div>
                          <div className="num mt-1 text-2xs">
                            <span className={clsx(Math.abs(d) < 0.05 ? "text-ink-3" : d < 0 ? "text-good-ink" : "text-critical-ink")}>
                              {fmtPct(d)}
                            </span>{" "}
                            <span className="text-ink-3">vs {b.toFixed(k.digits)}</span>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  </Card>

                  <Card className="rise">
                    <CardHeader
                      title={`${controllerDef(view).label} · ${cycle.name}`}
                      description={
                        shown.kpis.constraintViolations ? (
                          <span className="inline-flex items-center gap-1 text-critical-ink">
                            <ShieldAlert className="size-3" aria-hidden /> {shown.kpis.constraintViolations} constraint violation(s)
                          </span>
                        ) : (
                          "All battery and supercap constraints respected"
                        )
                      }
                      actions={
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          <SeriesKey color="var(--series-bat)" label="Battery" />
                          <SeriesKey color="var(--series-sc)" label="Supercap" />
                          <SeriesKey color="var(--ink-3)" label="Demand" />
                        </div>
                      }
                    />
                    <div className="px-3 pb-4 pt-3 sm:px-5">
                      <CycleTrace data={toTraceData(shown, result.speedMs)} />
                    </div>
                  </Card>

                  <Card className="rise overflow-hidden">
                    <CardHeader title="All controllers on this cycle" description="Deltas vs battery-only" />
                    <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Scrollable table">
                      <table className="w-full min-w-[560px] text-sm">
                        <thead>
                          <tr className="border-y border-line bg-surface-2 text-left text-2xs uppercase tracking-[0.06em] text-ink-3">
                            <th className="py-2 pl-5 pr-3 font-medium">Controller</th>
                            {KPI_DEFS.slice(0, 4).map((k) => (
                              <th key={k.key} className="px-3 py-2 text-right font-medium last:pr-5">
                                {k.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.runs.map((r) => (
                            <tr key={r.id} className={clsx("border-b border-line last:border-0", r.controller === view && "bg-surface-2/60")}>
                              <td className="py-2.5 pl-5 pr-3">
                                <button onClick={() => setView(r.controller)} className="font-medium text-ink-1 hover:underline">
                                  {controllerDef(r.controller).label}
                                </button>
                              </td>
                              {KPI_DEFS.slice(0, 4).map((k) => (
                                <td key={k.key} className="num px-3 py-2.5 text-right text-ink-1 last:pr-5">
                                  {fmtPct(pctDelta(r.kpis[k.key], r.baseline[k.key]))}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </>
              )}
              <p className="text-2xs text-ink-3">
                MPC and Distilled ML use trained models {models?.version}. They were trained on the Compact EV; on other vehicles
                the guardrail limits adapt but the learned policy is outside its training distribution.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
